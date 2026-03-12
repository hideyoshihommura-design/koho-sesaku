// 通知ユーティリティ
// Slack Webhook と メール（SendGrid）に対応
// 環境変数で有効/無効を切り替え可能

import axios from 'axios';
import { logger } from './logger';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const NOTIFY_EMAIL_TO = process.env.NOTIFY_EMAIL_TO;
const NOTIFY_EMAIL_FROM = process.env.NOTIFY_EMAIL_FROM || 'noreply@your-domain.com';

export type NotifyLevel = 'info' | 'warning' | 'error';

export interface NotifyMessage {
  level: NotifyLevel;
  title: string;
  body: string;
  flow?: 'A' | 'B';
}

// 通知を送信（Slack & メール 両方に送る）
export async function notify(message: NotifyMessage): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (SLACK_WEBHOOK_URL) {
    tasks.push(notifySlack(message).catch(e =>
      logger.warn('Slack通知失敗', { error: String(e) })
    ));
  }

  if (SENDGRID_API_KEY && NOTIFY_EMAIL_TO) {
    tasks.push(notifyEmail(message).catch(e =>
      logger.warn('メール通知失敗', { error: String(e) })
    ));
  }

  if (tasks.length === 0) {
    // 通知設定なし → ログのみ
    logger.info(`[通知] ${message.title}: ${message.body}`);
    return;
  }

  await Promise.all(tasks);
}

// ─────────────────────────────────
// Slack Webhook
// ─────────────────────────────────
async function notifySlack(message: NotifyMessage): Promise<void> {
  const emoji = { info: ':white_check_mark:', warning: ':warning:', error: ':x:' }[message.level];
  const color = { info: '#36a64f', warning: '#ff9900', error: '#ff0000' }[message.level];
  const flowLabel = message.flow ? ` [フロー${message.flow}]` : '';

  await axios.post(SLACK_WEBHOOK_URL!, {
    attachments: [
      {
        color,
        title: `${emoji} ${message.title}${flowLabel}`,
        text: message.body,
        footer: 'SNS自動投稿システム',
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  });
}

// ─────────────────────────────────
// SendGrid メール送信
// ─────────────────────────────────
async function notifyEmail(message: NotifyMessage): Promise<void> {
  const subjectPrefix = { info: '✅', warning: '⚠️', error: '❌' }[message.level];
  const flowLabel = message.flow ? `[フロー${message.flow}] ` : '';

  await axios.post(
    'https://api.sendgrid.com/v3/mail/send',
    {
      personalizations: [{ to: [{ email: NOTIFY_EMAIL_TO }] }],
      from: { email: NOTIFY_EMAIL_FROM },
      subject: `${subjectPrefix} ${flowLabel}${message.title}`,
      content: [{ type: 'text/plain', value: message.body }],
    },
    {
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

// ─────────────────────────────────
// よく使う通知のショートカット
// ─────────────────────────────────

export async function notifyDraftCreated(title: string, postId: number, remaining: number): Promise<void> {
  await notify({
    level: 'info',
    title: 'WordPress下書きを作成しました',
    body: `タイトル: ${title}\n記事ID: ${postId}\n\n確認・公開はWordPress管理画面から行ってください。\n残りストック: ${remaining}件`,
    flow: 'A',
  });
}

export async function notifyLowStock(remaining: number): Promise<void> {
  await notify({
    level: 'warning',
    title: `ストックが残り${remaining}件です`,
    body: `Google Drive の「投稿素材_キュー」フォルダに素材を追加してください。\n\nこのままでは${remaining}日後に投稿が停止します。`,
    flow: 'A',
  });
}

export async function notifyEmptyQueue(): Promise<void> {
  await notify({
    level: 'error',
    title: 'キューが空です：本日の投稿をスキップしました',
    body: 'Google Drive の「投稿素材_キュー」フォルダに素材を追加してください。\n素材が追加されると翌朝9:00に自動処理されます。',
    flow: 'A',
  });
}

export async function notifySNSPosted(articleTitle: string, results: Record<string, boolean>): Promise<void> {
  const lines = Object.entries(results)
    .map(([platform, success]) => `${success ? '✅' : '❌'} ${platform}`)
    .join('\n');

  const allSuccess = Object.values(results).every(Boolean);

  await notify({
    level: allSuccess ? 'info' : 'warning',
    title: `SNS投稿完了: ${articleTitle}`,
    body: lines,
    flow: 'B',
  });
}

export async function notifyError(context: string, error: unknown, flow?: 'A' | 'B'): Promise<void> {
  await notify({
    level: 'error',
    title: `エラーが発生しました: ${context}`,
    body: String(error),
    flow,
  });
}
