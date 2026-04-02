// GCS（Google Cloud Storage）を使った素材の保存・取得
// Drive の代わりに GCS を使用することで設定をシンプルにする
//
// GCS のフォルダ構造:
//   materials/{date}/{materialId}/1.jpg   ← スタッフが送った写真
//   materials/{date}/{materialId}/1.mp4   ← スタッフが送った動画素材
//   videos/{materialId}.mp4              ← システムが生成したスライドショー

import { Storage } from '@google-cloud/storage';
import { GoogleAuth } from 'google-auth-library';
import axios from 'axios';
import { logger } from '../utils/logger';

const storage = new Storage();

// バケット名（動画保存にすでに使っているバケットを共用）
function getBucketName(): string {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT が設定されていません');
  return `${project}-sns-videos`;
}

// ─────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────

export interface AttachmentRef {
  resourceName?: string;   // Google Chat 直接添付のリソース名
  downloadUri?: string;    // Chat が提供するダウンロード URL（あれば優先）
  driveFileId?: string;    // Google Drive ファイル ID（Drive 共有の場合）
  contentName: string;     // ファイル名
  contentType: string;     // image/jpeg, video/mp4 など
}

export interface MaterialMetadata {
  materialId: string;
  receivedAt: string;
  sender: string;
  comment: string;
  photoCount: number;
  attachments: AttachmentRef[];
}

// ─────────────────────────────────────────
// Chat 添付ファイルのダウンロード
// ─────────────────────────────────────────

// Google Chat の Bearer トークンを取得（Chat Media API 用）
async function getChatAccessToken(): Promise<string> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/chat.messages.readonly'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token!;
}

// 1件の添付ファイルをダウンロードしてバッファで返す
async function downloadAttachment(
  attachment: AttachmentRef
): Promise<Buffer | null> {
  try {
    // 方法1: Chat が提供する downloadUri があればそちらを優先
    if (attachment.downloadUri) {
      const token = await getChatAccessToken();
      const res = await axios.get(attachment.downloadUri, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer',
        timeout: 30000,
      });
      return Buffer.from(res.data);
    }

    // 方法2: resourceName で Chat Media API からダウンロード
    if (attachment.resourceName) {
      const token = await getChatAccessToken();
      const res = await axios.get(
        `https://chat.googleapis.com/v1/${attachment.resourceName}/media?alt=media`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'arraybuffer',
          timeout: 30000,
        }
      );
      return Buffer.from(res.data);
    }

    logger.warn('ダウンロード可能な添付情報がありません', {
      contentName: attachment.contentName,
    });
    return null;

  } catch (err) {
    logger.warn('添付ファイルのダウンロードに失敗', {
      contentName: attachment.contentName,
      error: String(err),
    });
    return null;
  }
}

// ─────────────────────────────────────────
// GCS への保存
// ─────────────────────────────────────────

/**
 * スタッフが送った素材（写真・動画）を GCS に保存する
 * @returns 保存した GCS パスの配列（画像のみ）
 */
export async function saveMaterialToGcs(
  metadata: MaterialMetadata
): Promise<string[]> {
  const date = metadata.receivedAt.substring(0, 10); // YYYY-MM-DD
  const bucket = storage.bucket(getBucketName());
  const gcsImagePaths: string[] = [];

  for (let i = 0; i < metadata.attachments.length; i++) {
    const attachment = metadata.attachments[i];
    const buffer = await downloadAttachment(attachment);

    if (!buffer) continue;

    const ext = getExtension(attachment.contentName, attachment.contentType);
    const gcsPath = `materials/${date}/${metadata.materialId}/${i + 1}${ext}`;

    await bucket.file(gcsPath).save(buffer, {
      metadata: { contentType: attachment.contentType },
    });

    logger.info('GCS に素材を保存しました', {
      materialId: metadata.materialId,
      gcsPath,
      contentType: attachment.contentType,
    });

    // 画像のみ Claude / Remotion の処理対象にする
    if (attachment.contentType.startsWith('image/')) {
      gcsImagePaths.push(gcsPath);
    }
  }

  return gcsImagePaths;
}

// ─────────────────────────────────────────
// GCS からの取得
// ─────────────────────────────────────────

/**
 * GCS から画像を base64 でダウンロードする（Claude / Remotion 用）
 * 最大4枚
 */
export async function downloadImagesFromGcs(
  gcsPaths: string[]
): Promise<Array<{ base64: string; mimeType: string }>> {
  const bucket = storage.bucket(getBucketName());
  const images: Array<{ base64: string; mimeType: string }> = [];

  for (const gcsPath of gcsPaths.slice(0, 4)) {
    try {
      const [buffer] = await bucket.file(gcsPath).download();
      const [meta] = await bucket.file(gcsPath).getMetadata();
      const mimeType = (meta.contentType as string) || 'image/jpeg';
      images.push({ base64: buffer.toString('base64'), mimeType });
    } catch (err) {
      logger.warn('GCS からの画像ダウンロードに失敗', { gcsPath, error: String(err) });
    }
  }

  return images;
}

// ─────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────

function getExtension(contentName: string, contentType: string): string {
  const fromName = contentName.match(/(\.[a-zA-Z0-9]+)$/)?.[1];
  if (fromName) return fromName.toLowerCase();

  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
  };
  return map[contentType] || '.bin';
}
