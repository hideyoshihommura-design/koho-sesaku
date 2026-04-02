// Google Chat Bot からの受信ハンドラ
// スタッフが写真＋コメントを送信すると、このエンドポイントが呼ばれる
// 受信した素材は GCS に保存し、Firestore に登録する

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { saveMaterialToGcs, MaterialMetadata } from './storageHandler';
import { createMaterialRecord } from './firestoreHandler';

// Google Chat メッセージのイベント型
interface ChatEvent {
  type: string;
  message?: {
    name: string;
    text?: string;
    sender?: { displayName: string };
    createTime?: string;
    attachments?: Array<{
      name: string;
      contentName?: string;
      contentType?: string;
      downloadUri?: string;
      attachmentDataRef?: {
        resourceName: string;
        attachmentToken?: string;
      };
      driveDataRef?: { driveFileId: string };
    }>;
  };
  space?: { name: string };
}

export async function handleChatWebhook(req: Request, res: Response): Promise<void> {
  const event: ChatEvent = req.body;

  // 疎通確認（Google Chat がボットをスペースに追加したとき）
  if (event.type === 'ADDED_TO_SPACE') {
    res.json({ text: 'SNS素材受付ボットが追加されました。写真とコメントをお送りください。' });
    return;
  }

  if (event.type !== 'MESSAGE' || !event.message) {
    res.status(200).json({});
    return;
  }

  const message = event.message;
  const text = message.text || '';
  const sender = message.sender?.displayName || '不明';
  const receivedAt = message.createTime || new Date().toISOString();
  const attachments = message.attachments || [];

  // 画像または動画の添付がない場合はスキップ
  const mediaAttachments = attachments.filter(a => {
    const type = a.contentType || '';
    return type.startsWith('image/') || type.startsWith('video/');
  });

  if (mediaAttachments.length === 0) {
    res.status(200).json({});
    return;
  }

  const materialId = uuidv4();
  const imageCount = mediaAttachments.filter(a => a.contentType?.startsWith('image/')).length;

  logger.info('素材受信', {
    materialId,
    sender,
    attachmentCount: mediaAttachments.length,
    imageCount,
    hasComment: !!text,
  });

  // Google Chat は応答が遅いとタイムアウトするため即座に 200 を返す
  res.status(200).json({});

  // 非同期で GCS 保存 → Firestore 登録
  (async () => {
    try {
      const metadata: MaterialMetadata = {
        materialId,
        receivedAt,
        sender,
        comment: text,
        photoCount: imageCount,
        attachments: mediaAttachments.map(a => ({
          resourceName: a.attachmentDataRef?.resourceName,
          downloadUri: a.downloadUri,
          contentName: a.contentName || 'file',
          contentType: a.contentType || 'image/jpeg',
        })),
      };

      // GCS に素材を保存（画像 GCS パスを返す）
      const gcsImagePaths = await saveMaterialToGcs(metadata);

      // Firestore に素材レコードを作成（生成待ち状態で登録）
      await createMaterialRecord({
        materialId,
        receivedAt,
        sender,
        comment: text,
        photoCount: imageCount,
        gcsImagePaths,
      });

      logger.info('素材の登録が完了しました', {
        materialId,
        gcsImageCount: gcsImagePaths.length,
      });
    } catch (err) {
      logger.error('素材の保存中にエラー', { materialId, error: String(err) });
    }
  })();
}
