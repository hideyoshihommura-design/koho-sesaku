// SNS 自動投稿システム Phase A
// Google Chat 素材受信 → Claude 生成 → Firestore 保存 → Webアプリで承認

import express from 'express';
import { handleChatWebhook } from './handlers/chatWebhookHandler';
import { handleProcess, handleReminder } from './handlers/schedulerHandler';
import { createWebAppRouter } from './handlers/webAppHandler';
import { getSecret, SECRET_NAMES } from './utils/secretManager';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '50mb' }));

// ヘルスチェック
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', version: 'phase-a-2.0.0' });
});

// ─────────────────────────────────────────
// Google Chat Bot からの素材受信
// ─────────────────────────────────────────
app.post('/webhook/google-chat', handleChatWebhook);

// ─────────────────────────────────────────
// Cloud Scheduler からのトリガー
// ─────────────────────────────────────────
app.post('/process', handleProcess);
app.post('/remind', handleReminder);

// ─────────────────────────────────────────
// Webアプリ（承認ダッシュボード）
// 秘密パスを Secret Manager から取得してルートを動的に設定
// ─────────────────────────────────────────
async function startServer() {
  try {
    const appSecretPath = await getSecret(SECRET_NAMES.APP_SECRET_PATH);
    const webAppRouter = createWebAppRouter(appSecretPath);
    app.use('/app', webAppRouter);

    logger.info('Webアプリルート設定完了', { path: `/app/${appSecretPath}` });
  } catch (err) {
    // ローカル開発時はシークレットがなくてもサーバーは起動する
    logger.warn('APP_SECRET_PATH の取得に失敗。Webアプリは無効です', { error: String(err) });
  }

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
}

startServer();

export default app;
