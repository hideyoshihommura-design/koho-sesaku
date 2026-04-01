// Google Chat Bot からの受信ハンドラ
// スタッフが写真＋コメントを送信すると、このエンドポイントが呼ばれる

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { saveMaterialToDrive, MaterialMetadata } from './driveHandler';

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
      attachmentDataRef?: { resourceName: string };
      driveDataRef?: { driveFileId: string };
    }>;
  };
  space?: { name: string };
}

export async function handleChatWebhook(req: Request, res: Response): Promise<void> {
  const event: ChatEvent = req.body;

  // 確認リクエスト（Google Chat の疎通確認）
  if (event.type === 'ADDED_TO_SPACE') {
    res.json({ text: 'SNS素材受付ボットが追加されました。写真とコメントをお送りください。' });
    return;
  }

  // MESSAGE 以外は無視
  if (event.type !== 'MESSAGE' || !event.message) {
    res.status(200).json({});
    return;
  }

  const message = event.message;
  const text = message.text || '';
  const sender = message.sender?.displayName || '不明';
  const receivedAt = message.createTime || new Date().toISOString();

  // テキストのみ・添付なしは素材として扱わない
  const attachments = message.attachments || [];
  if (attachments.length === 0 && text.trim() === '') {
    res.status(200).json({});
    return;
  }

  // 写真添付がない場合はスキップ（テキストのみのメッセージは素材ではない）
  const imageAttachments = attachments.filter(a =>
    a.contentType?.startsWith('image/') || a.driveDataRef
  );

  if (imageAttachments.length === 0) {
    logger.info('画像なしメッセージはスキップ', { sender, text: text.substring(0, 50) });
    res.status(200).json({});
    return;
  }

  const materialId = uuidv4();

  logger.info('素材受信', {
    materialId,
    sender,
    attachmentCount: imageAttachments.length,
    hasText: !!text,
  });

  // 即座に 200 を返す（Google Chat はタイムアウトが早い）
  res.status(200).json({});

  // 非同期で Drive 保存
  try {
    const metadata: MaterialMetadata = {
      materialId,
      receivedAt,
      sender,
      comment: text,
      photoCount: imageAttachments.length,
      attachments: imageAttachments.map(a => ({
        resourceName: a.attachmentDataRef?.resourceName,
        driveFileId: a.driveDataRef?.driveFileId,
        contentName: a.contentName || 'photo.jpg',
        contentType: a.contentType || 'image/jpeg',
      })),
      processed: false,
    };

    await saveMaterialToDrive(metadata);
    logger.info('素材を Drive に保存しました', { materialId });
  } catch (error) {
    logger.error('Drive 保存エラー', { materialId, error: String(error) });
  }
}
