// Google Drive 操作ハンドラ
// 素材の保存・取得・処理済みマーク

import { google } from 'googleapis';
import { logger } from '../utils/logger';
import { getSecret, SECRET_NAMES } from '../utils/secretManager';

// Drive フォルダ ID は Secret Manager から取得（フォルダ ID だけは設定が必要）

export interface AttachmentRef {
  resourceName?: string;    // Google Chat attachment resource name
  driveFileId?: string;     // Google Drive file ID（Chat が Drive に保存した場合）
  contentName: string;
  contentType: string;
}

export interface MaterialMetadata {
  materialId: string;
  receivedAt: string;
  sender: string;
  comment: string;
  photoCount: number;
  attachments: AttachmentRef[];
  processed: boolean;
  driveImageFileIds?: string[];  // Drive に保存した画像ファイルの ID
}

// Google Drive クライアントを初期化（Workload Identity / ADC で自動認証）
// Cloud Run に付与したサービスアカウントの権限が自動で使われる
async function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth });
}

// ルートフォルダ内に日付フォルダ → 素材フォルダ を作成して返す
async function ensureMaterialFolder(
  drive: ReturnType<typeof google.drive>,
  rootFolderId: string,
  date: string,  // YYYY-MM-DD
  materialId: string
): Promise<string> {
  // 日付フォルダを検索または作成
  const dateQuery = `'${rootFolderId}' in parents and name = '${date}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const dateResult = await drive.files.list({ q: dateQuery, fields: 'files(id)' });

  let dateFolderId: string;
  if (dateResult.data.files && dateResult.data.files.length > 0) {
    dateFolderId = dateResult.data.files[0].id!;
  } else {
    const dateFolder = await drive.files.create({
      requestBody: {
        name: date,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootFolderId],
      },
      fields: 'id',
    });
    dateFolderId = dateFolder.data.id!;
  }

  // 素材フォルダ（materialId）を作成
  const materialFolder = await drive.files.create({
    requestBody: {
      name: materialId,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [dateFolderId],
    },
    fields: 'id',
  });

  return materialFolder.data.id!;
}

// 素材を Drive に保存（メタデータ JSON + 画像ファイル）
export async function saveMaterialToDrive(metadata: MaterialMetadata): Promise<void> {
  const drive = await getDriveClient();
  const rootFolderId = await getSecret(SECRET_NAMES.DRIVE_FOLDER_ID);

  const date = metadata.receivedAt.substring(0, 10);  // YYYY-MM-DD
  const folderId = await ensureMaterialFolder(drive, rootFolderId, date, metadata.materialId);

  const driveImageFileIds: string[] = [];

  // Google Drive にすでに保存されている添付ファイルをコピー
  for (const attachment of metadata.attachments) {
    if (attachment.driveFileId) {
      // Chat が Drive に保存したファイルをコピー
      try {
        const copied = await drive.files.copy({
          fileId: attachment.driveFileId,
          requestBody: {
            name: attachment.contentName,
            parents: [folderId],
          },
          fields: 'id',
        });
        driveImageFileIds.push(copied.data.id!);
      } catch (err) {
        logger.warn('Drive ファイルのコピーに失敗', {
          driveFileId: attachment.driveFileId,
          error: String(err),
        });
      }
    }
  }

  metadata.driveImageFileIds = driveImageFileIds;
  metadata.processed = false;

  // メタデータ JSON を保存
  const { Readable } = await import('stream');
  const jsonStr = JSON.stringify(metadata, null, 2);
  const stream = Readable.from([jsonStr]);

  await drive.files.create({
    requestBody: {
      name: 'metadata.json',
      parents: [folderId],
      mimeType: 'application/json',
    },
    media: {
      mimeType: 'application/json',
      body: stream,
    },
  });

  logger.info('素材フォルダを作成しました', {
    materialId: metadata.materialId,
    folderId,
    imageCount: driveImageFileIds.length,
  });
}

// 未処理の素材フォルダ一覧を取得
export async function listUnprocessedMaterials(): Promise<MaterialMetadata[]> {
  const drive = await getDriveClient();
  const rootFolderId = await getSecret(SECRET_NAMES.DRIVE_FOLDER_ID);

  // ルート配下の全 metadata.json を取得
  const query = `'${rootFolderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`;
  const dateFolders = await drive.files.list({ q: query, fields: 'files(id, name)' });

  const unprocessed: MaterialMetadata[] = [];

  for (const dateFolder of dateFolders.data.files || []) {
    const materialQuery = `'${dateFolder.id}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`;
    const materialFolders = await drive.files.list({ q: materialQuery, fields: 'files(id, name)' });

    for (const materialFolder of materialFolders.data.files || []) {
      const metaQuery = `'${materialFolder.id}' in parents and name = 'metadata.json' and trashed = false`;
      const metaFiles = await drive.files.list({ q: metaQuery, fields: 'files(id)' });

      if (!metaFiles.data.files || metaFiles.data.files.length === 0) continue;

      try {
        const res = await drive.files.get({
          fileId: metaFiles.data.files[0].id!,
          alt: 'media',
        }, { responseType: 'text' });

        const metadata: MaterialMetadata = JSON.parse(res.data as string);

        if (!metadata.processed) {
          unprocessed.push(metadata);
        }
      } catch (err) {
        logger.warn('メタデータの読み込みに失敗', {
          folderId: materialFolder.id,
          error: String(err),
        });
      }
    }
  }

  logger.info('未処理素材を取得しました', { count: unprocessed.length });
  return unprocessed;
}

// 画像ファイルを base64 でダウンロード（Claude API 用）
export async function downloadImagesAsBase64(
  driveFileIds: string[]
): Promise<Array<{ base64: string; mimeType: string }>> {
  const drive = await getDriveClient();
  const images: Array<{ base64: string; mimeType: string }> = [];

  // 最大4枚まで（5枚以上は先頭4枚）
  const targetIds = driveFileIds.slice(0, 4);

  for (const fileId of targetIds) {
    try {
      // ファイルの mimeType を取得
      const meta = await drive.files.get({ fileId, fields: 'mimeType' });
      const mimeType = meta.data.mimeType || 'image/jpeg';

      // バイナリダウンロード
      const res = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
      );

      const buffer = Buffer.from(res.data as ArrayBuffer);
      images.push({ base64: buffer.toString('base64'), mimeType });
    } catch (err) {
      logger.warn('画像のダウンロードに失敗', { fileId, error: String(err) });
    }
  }

  return images;
}

// 素材を処理済みにマーク（metadata.json の processed を true に更新）
export async function markAsProcessed(materialId: string): Promise<void> {
  const drive = await getDriveClient();
  const rootFolderId = await getSecret(SECRET_NAMES.DRIVE_FOLDER_ID);

  // materialId のフォルダを検索
  const query = `name = '${materialId}' and trashed = false and mimeType = 'application/vnd.google-apps.folder'`;
  const folders = await drive.files.list({ q: query, fields: 'files(id)' });

  if (!folders.data.files || folders.data.files.length === 0) {
    logger.warn('素材フォルダが見つかりません', { materialId });
    return;
  }

  const folderId = folders.data.files[0].id!;
  const metaQuery = `'${folderId}' in parents and name = 'metadata.json' and trashed = false`;
  const metaFiles = await drive.files.list({ q: metaQuery, fields: 'files(id)' });

  if (!metaFiles.data.files || metaFiles.data.files.length === 0) return;

  const metaFileId = metaFiles.data.files[0].id!;

  // 現在の内容を読み込んで更新
  const res = await drive.files.get(
    { fileId: metaFileId, alt: 'media' },
    { responseType: 'text' }
  );

  const metadata: MaterialMetadata = JSON.parse(res.data as string);
  metadata.processed = true;

  const { Readable } = await import('stream');
  const jsonStr = JSON.stringify(metadata, null, 2);
  const stream = Readable.from([jsonStr]);

  await drive.files.update({
    fileId: metaFileId,
    media: {
      mimeType: 'application/json',
      body: stream,
    },
  });

  logger.info('素材を処理済みにマークしました', { materialId, rootFolderId });
}
