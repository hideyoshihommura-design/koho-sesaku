import express from 'express';
import { logger } from './utils/logger';
import { handleWordPressWebhook } from './handlers/webhookHandler';
import * as queueHandler from './handlers/queueHandler';
import * as claudeHandler from './handlers/claudeHandler';
import * as veoHandler from './handlers/veoHandler';
import * as wpHandler from './handlers/wpHandler';
import * as hubspotHandler from './handlers/hubspotHandler';
import * as tiktokHandler from './handlers/tiktokHandler';
import * as lifullHandler from './handlers/lifullHandler';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// ヘルスチェック（Cloud Run が起動確認に使う）
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────
// フローB: WordPress Webhook 受信エンドポイント
// WP Webhooks プラグインの通知先として設定する
// ─────────────────────────────────────────
app.post('/webhook/wordpress', handleWordPressWebhook);

// ─────────────────────────────────────────
// フローA: Cloud Scheduler から呼ばれるエンドポイント
// Cloud Scheduler のジョブで毎朝9:00に呼び出す
// ─────────────────────────────────────────
app.post('/queue/process', async (_req, res) => {
  logger.info('フローA開始: キュー処理', { flow: 'A' });
  res.status(200).json({ message: 'accepted' }); // 即座に応答

  try {
    const source = await queueHandler.getNext();

    if (!source) {
      logger.warn('フローA: キューが空です。素材を追加してください', { flow: 'A' });
      return;
    }

    logger.info(`フローA: 素材処理開始 "${source.folderName}"`, { flow: 'A' });

    // 画像解析（Claudeで画像内容を説明）
    const imageDescriptions = source.imageBuffers.length > 0
      ? await claudeHandler.analyzeImages(source.imageBuffers)
      : '画像なし';

    // Claude で記事＋SNS投稿文を一括生成
    const article = await claudeHandler.generateArticle({
      sourceText: source.textContent || source.pdfContent || '（テキスト情報なし）',
      imageDescriptions,
      folderName: source.folderName,
    });

    // TikTok用動画を先に生成開始（時間がかかるため）
    const videoPromise = veoHandler.generateVideo({
      imageBuffer: source.imageBuffers[0],
      caption: article.tiktokCaption,
    });

    // WordPress に下書き投稿
    const postId = await wpHandler.createDraft(article);

    const remaining = await queueHandler.count();
    logger.info(`フローA: WordPress下書き作成完了。残りストック: ${remaining}件`, {
      flow: 'A',
      postId,
      remaining,
    });

    // 処理済みに移動
    await queueHandler.markDone(source);

    // 動画生成完了を待機（WordPress公開後にフローBが動くので参考程度）
    const video = await videoPromise;
    logger.info(`フローA: TikTok動画生成完了 ${video.gcsUri}`, { flow: 'A' });

    if (remaining <= 3) {
      logger.warn(`フローA: ストックが残り${remaining}件です。素材を追加してください`, {
        flow: 'A',
        remaining,
      });
    }

  } catch (error) {
    logger.error('フローA: 処理失敗', { flow: 'A', error: String(error) });
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

  try {
    const payload = JSON.parse(data);
    if (payload.type === 'wordpress_publish') {
      // WordPress 公開イベント（フローB）
      res.status(200).json({ message: 'accepted' });
      // 非同期処理は webhookHandler 側で行う
    }
  } catch (error) {
    logger.error('Pub/Sub 処理エラー', { error: String(error) });
    res.status(500).json({ error: String(error) });
    return;
  }
});

app.listen(PORT, () => {
  logger.info(`SNS自動投稿サーバー起動 port=${PORT}`);
});

export default app;
