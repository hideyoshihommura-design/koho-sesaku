import { google } from 'googleapis';
import { logger } from '../utils/logger';
import { getSecret, SECRET_NAMES } from '../utils/secretManager';

const QUEUE_FOLDER_NAME = '投稿素材_キュー';
const DONE_FOLDER_NAME = '処理済み';
const LOW_STOCK_THRESHOLD = 3;

export interface QueueItem {
  folderId: string;
  folderName: string;
  textContent: string;
  imageBuffers: Buffer[];
  pdfContent: string;
}

// Google Drive サービスアカウントで認証
async function getDriveClient() {
  const serviceAccountJson = await getSecret(SECRET_NAMES.GOOGLE_DRIVE_SERVICE_ACCOUNT);
  const serviceAccount = JSON.parse(serviceAccountJson);

  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth });
}

// キューの先頭（番号が最小のフォルダ）を取得
export async function getNext(): Promise<QueueItem | null> {
  const drive = await getDriveClient();

  // 「投稿素材_キュー」フォルダを探す
  const queueFolderRes = await drive.files.list({
    q: `name='${QUEUE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
  });

  const queueFolder = queueFolderRes.data.files?.[0];
  if (!queueFolder?.id) {
    logger.error('Google Drive: 投稿素材_キューフォルダが見つかりません');
    return null;
  }

  // キュー内の未処理フォルダを番号順に取得（処理済みフォルダを除く）
  const itemsRes = await drive.files.list({
    q: `'${queueFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and name!='${DONE_FOLDER_NAME}' and trashed=false`,
    orderBy: 'name',
    fields: 'files(id, name)',
  });

  const items = itemsRes.data.files || [];
  if (items.length === 0) {
    logger.warn('Google Drive: キューが空です', { flow: 'A' });
    return null;
  }

  const firstItem = items[0];
  logger.info(`Google Drive: 素材取得 "${firstItem.name}"`, { flow: 'A', remaining: items.length });

  // 残りストック数の警告
  if (items.length <= LOW_STOCK_THRESHOLD) {
    logger.warn(`Google Drive: ストック残り${items.length}件です`, { flow: 'A', remaining: items.length });
  }

  // フォルダ内のファイルを取得
  const filesRes = await drive.files.list({
    q: `'${firstItem.id}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType)',
  });

  const files = filesRes.data.files || [];
  let textContent = '';
  const imageBuffers: Buffer[] = [];
  let pdfContent = '';

  for (const file of files) {
    if (!file.id) continue;

    if (file.mimeType === 'text/plain' || file.name?.endsWith('.txt')) {
      // テキストファイル
      const res = await drive.files.get(
        { fileId: file.id, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      textContent += Buffer.from(res.data as ArrayBuffer).toString('utf-8') + '\n';

    } else if (file.mimeType?.startsWith('image/')) {
      // 画像ファイル
      const res = await drive.files.get(
        { fileId: file.id, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      imageBuffers.push(Buffer.from(res.data as ArrayBuffer));

    } else if (file.mimeType === 'application/pdf') {
      // PDFはテキストメモとして扱う（Claudeがbase64でも解析可能）
      pdfContent += `[PDF: ${file.name}]\n`;
    }
  }

  return {
    folderId: firstItem.id!,
    folderName: firstItem.name!,
    textContent,
    imageBuffers,
    pdfContent,
  };
}

// 処理完了後に「処理済み」フォルダへ移動
export async function markDone(item: QueueItem): Promise<void> {
  const drive = await getDriveClient();

  // 「処理済み」フォルダを検索（なければ作成）
  const doneRes = await drive.files.list({
    q: `name='${DONE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });

  let doneFolderId = doneRes.data.files?.[0]?.id;
  if (!doneFolderId) {
    const created = await drive.files.create({
      requestBody: {
        name: DONE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });
    doneFolderId = created.data.id!;
  }

  // 処理済みフォルダへ移動
  await drive.files.update({
    fileId: item.folderId,
    addParents: doneFolderId,
    removeParents: undefined, // 元の親は自動で解決
    fields: 'id, parents',
  });

  logger.info(`Google Drive: "${item.folderName}" を処理済みに移動しました`, { flow: 'A' });
}

// キュー内の未処理件数を返す
export async function count(): Promise<number> {
  const drive = await getDriveClient();

  const queueFolderRes = await drive.files.list({
    q: `name='${QUEUE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  });

  const queueFolder = queueFolderRes.data.files?.[0];
  if (!queueFolder?.id) return 0;

  const itemsRes = await drive.files.list({
    q: `'${queueFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and name!='${DONE_FOLDER_NAME}' and trashed=false`,
    fields: 'files(id)',
  });

  return (itemsRes.data.files || []).length;
}
