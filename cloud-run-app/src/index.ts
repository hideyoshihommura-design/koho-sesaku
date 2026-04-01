// SNS 自動投稿システム Phase A
// Google Chat 素材受信 → Claude 生成 → Google Sheets 出力

import express from 'express';
import { handleChatWebhook } from './handlers/chatWebhookHandler';
import { handleProcess, handleReminder } from './handlers/schedulerHandler';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT || 8080;

// JSON ボディパーサー（画像の base64 が含まれる場合があるため 50MB まで許容）
app.use(express.json({ limit: '50mb' }));

// ヘルスチェック（Cloud Run のスタートアップ・ライブネスプローブ用）
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', version: 'phase-a-1.0.0' });
});

// ─────────────────────────────────────────
// Google Chat Bot からの素材受信
// Google Chat App の設定で「エンドポイント URL」に登録:
//   https://[CLOUD_RUN_URL]/webhook/google-chat
// ─────────────────────────────────────────
app.post('/webhook/google-chat', handleChatWebhook);

// ─────────────────────────────────────────
// Cloud Scheduler からの処理トリガー
// 1日2回 18:00・23:00 に実行
// Cloud Scheduler ジョブの URL: https://[CLOUD_RUN_URL]/process
// ─────────────────────────────────────────
app.post('/process', handleProcess);

// ─────────────────────────────────────────
// Cloud Scheduler からのリマインダートリガー
// 毎日10:00 に実行（3日未承認チェック）
// Cloud Scheduler ジョブの URL: https://[CLOUD_RUN_URL]/remind
// ─────────────────────────────────────────
app.post('/remind', handleReminder);

// 未定義ルートは 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.listen(PORT, () => {
  logger.info('SNS自動投稿システム Phase A 起動', {
    port: PORT,
    env: process.env.NODE_ENV || 'development',
  });
});

export default app;
