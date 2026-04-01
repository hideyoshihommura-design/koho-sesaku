// Google Chat Incoming Webhook による通知ユーティリティ

import axios from 'axios';
import { logger } from './logger';
import { getSecret, SECRET_NAMES } from './secretManager';

// Webアプリへのリンク付き通知（処理完了時）
export async function notifyProcessingComplete(
  appUrl: string,
  itemCount: number
): Promise<void> {
  const webhookUrl = await getSecret(SECRET_NAMES.CHAT_WEBHOOK_URL);

  const message = {
    text: `✅ *SNS投稿文の生成が完了しました*\n\n` +
      `件数: ${itemCount}件\n` +
      `以下のURLから内容を確認し、承認してください。\n` +
      `👉 ${appUrl}`,
  };

  await axios.post(webhookUrl, message);
  logger.info('処理完了通知を送信しました', { itemCount });
}

// 3日未承認リマインダー通知
export async function notifyPendingReminder(
  appUrl: string,
  pendingCount: number
): Promise<void> {
  const webhookUrl = await getSecret(SECRET_NAMES.CHAT_WEBHOOK_URL);

  const message = {
    text: `⏰ *未承認の投稿文があります*\n\n` +
      `${pendingCount}件の投稿文が3日以上承認されていません。\n` +
      `👉 ${appUrl}`,
  };

  await axios.post(webhookUrl, message);
  logger.info('リマインダー通知を送信しました', { pendingCount });
}

// エラー通知
export async function notifyError(message: string): Promise<void> {
  try {
    const webhookUrl = await getSecret(SECRET_NAMES.CHAT_WEBHOOK_URL);
    await axios.post(webhookUrl, {
      text: `❌ *システムエラーが発生しました*\n\n${message}`,
    });
  } catch (err) {
    // 通知自体が失敗してもログのみ
    logger.error('エラー通知の送信に失敗', { error: String(err) });
  }
}
