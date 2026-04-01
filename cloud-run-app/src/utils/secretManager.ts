import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT!;

// Phase A で使用するシークレット名（Workload Identity 化により4つに削減）
export const SECRET_NAMES = {
  // Google API 認証: Cloud Run の Workload Identity（ADC）で自動処理 → キー不要
  // Claude 認証: Vertex AI 経由のため Anthropic API キー不要
  CHAT_WEBHOOK_URL: 'chat-webhook-url',   // 通知用 Google Chat Incoming Webhook URL
  SCHEDULER_SECRET: 'scheduler-secret',   // Cloud Scheduler 認証トークン
  DRIVE_FOLDER_ID: 'drive-folder-id',     // Google Drive ルートフォルダ ID
  APP_SECRET_PATH: 'app-secret-path',     // WebアプリのURL秘密パス（例: x9k2mN8p）
} as const;

// Cloud Run インスタンスのライフタイム中はキャッシュ
const cache = new Map<string, string>();

export async function getSecret(secretName: string): Promise<string> {
  if (cache.has(secretName)) {
    return cache.get(secretName)!;
  }

  const name = `projects/${PROJECT_ID}/secrets/${secretName}/versions/latest`;
  const [version] = await client.accessSecretVersion({ name });
  const payload = version.payload?.data?.toString();

  if (!payload) {
    throw new Error(`Secret ${secretName} が空です`);
  }

  cache.set(secretName, payload);
  return payload;
}
