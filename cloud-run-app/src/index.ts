import express from 'express';
import { logger } from './utils/logger';
import { notifyDraftCreated, notifyLowStock, notifyEmptyQueue, notifyError } from './utils/notify';
import { withRetry, isRetryableHttpError } from './utils/retry';
import { pollAndPost } from './handlers/webhookHandler';
import * as queueHandler from './handlers/queueHandler';
import * as claudeHandler from './handlers/claudeHandler';
import * as veoHandler from './handlers/veoHandler';
import * as wpHandler from './handlers/wpHandler';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// ─────────────────────────────────────────
// 起動時の環境変数チェック
// ─────────────────────────────────────────
function validateEnv(): void {
  const required = [
    'GOOGLE_CLOUD_PROJECT',
    'WORDPRESS_BASE_URL',
    'WORDPRESS_USERNAME',
    'HUBSPOT_FACEBOOK_CHANNEL_ID',
    'HUBSPOT_INSTAGRAM_CHANNEL_ID',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    logger.error('必須環境変数が未設定です', { missing });
    process.exit(1);
  }

  // 任意だが推奨の設定
  if (!process.env.SLACK_WEBHOOK_URL && !process.env.SENDGRID_API_KEY) {
    logger.warn('SLACK_WEBHOOK_URL / SENDGRID_API_KEY が未設定です。通知はログのみになります');
  }
}

// ─────────────────────────────────────────
// ヘルスチェック
// ─────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────
// フローB: お知らせページポーリングエンドポイント
// Cloud Scheduler から 30分ごとに呼び出す
// (POST https://[CLOUD_RUN_URL]/poll/news)
// ─────────────────────────────────────────
app.post('/poll/news', async (_req, res) => {
  logger.info('フローB: ポーリングリクエスト受信', { flow: 'B' });
  res.status(200).json({ message: 'accepted' });

  pollAndPost().catch(async (error) => {
    logger.error('フローB: ポーリング処理エラー', { flow: 'B', error: String(error) });
  });
});

// ─────────────────────────────────────────
// フローA: Cloud Scheduler から呼ばれるエンドポイント
// 毎朝9:00に実行される
// ─────────────────────────────────────────
app.post('/queue/process', async (_req, res) => {
  logger.info('フローA開始: キュー処理', { flow: 'A' });
  res.status(200).json({ message: 'accepted' });

  try {
    const source = await queueHandler.getNext();

    if (!source) {
      await notifyEmptyQueue();
      return;
    }

    logger.info(`フローA: 素材処理開始 "${source.folderName}"`, { flow: 'A' });

    // 画像解析
    const imageDescriptions = source.imageBuffers.length > 0
      ? await withRetry(
          () => claudeHandler.analyzeImages(source.imageBuffers),
          'Claude 画像解析',
          { maxAttempts: 2 }
        )
      : '画像なし';

    // 記事＋SNS投稿文を一括生成
    const article = await withRetry(
      () => claudeHandler.generateArticle({
        sourceText: source.textContent || source.pdfContent || '（テキスト情報なし）',
        imageDescriptions,
        folderName: source.folderName,
      }),
      'Claude 記事生成',
      { maxAttempts: 2 }
    );

    // TikTok用動画生成（時間がかかるため先に開始）
    const videoPromise = veoHandler.generateVideo({
      imageBuffer: source.imageBuffers[0],
      caption: article.tiktokCaption,
    }).catch(e => {
      logger.error('TikTok動画生成失敗', { flow: 'A', error: String(e) });
      return null;
    });

    // WordPress に下書き投稿
    const postId = await withRetry(
      () => wpHandler.createDraft(article),
      'WordPress下書き作成',
      { maxAttempts: 3, shouldRetry: isRetryableHttpError }
    );

    // 処理済みフォルダに移動
    await queueHandler.markDone(source);

    const remaining = await queueHandler.count();

    // 担当者へ確認通知
    await notifyDraftCreated(article.title, postId, remaining);

    // ストックが少なくなったら警告
    if (remaining <= 3) {
      await notifyLowStock(remaining);
    }

    // 動画生成完了を待機（フローBで使うため保存しておく）
    const video = await videoPromise;
    if (video) {
      logger.info(`フローA: TikTok動画生成完了 ${video.gcsUri}`, { flow: 'A' });
    }

    logger.info(`フローA完了: 下書き作成 postId=${postId} 残り${remaining}件`, { flow: 'A' });

  } catch (error) {
    logger.error('フローA: 処理失敗', { flow: 'A', error: String(error) });
    await notifyError('フローA キュー処理', error, 'A');
  }
});

// ─────────────────────────────────────────
// Cloud Pub/Sub プッシュサブスクリプション受信
// ─────────────────────────────────────────
app.post('/pubsub', async (req, res) => {
  const message = req.body?.message;
  if (!message) {
    res.status(400).json({ error: 'Pub/Sub メッセージが不正です' });
    return;
  }

  const data = Buffer.from(message.data, 'base64').toString('utf-8');
  logger.info('Pub/Sub メッセージ受信', { data: data.slice(0, 100) });
  res.status(200).json({ message: 'accepted' });
});

// ─────────────────────────────────────────
// 未定義ルートへの404
// ─────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// 起動
validateEnv();
app.listen(PORT, () => {
  logger.info(`SNS自動投稿サーバー起動 port=${PORT}`);
});

export default app;
