import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { withRetry, isRetryableHttpError } from '../utils/retry';
import { notifySNSPosted, notifyError } from '../utils/notify';
import * as wpHandler from './wpHandler';
import * as claudeHandler from './claudeHandler';
import * as veoHandler from './veoHandler';
import * as hubspotHandler from './hubspotHandler';
import * as tiktokHandler from './tiktokHandler';
import * as lifullHandler from './lifullHandler';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// フローB: WordPress Webhook を受信してSNS自動投稿を実行
export async function handleWordPressWebhook(req: Request, res: Response): Promise<void> {
  // Webhookトークン認証
  if (WEBHOOK_SECRET) {
    const token = req.headers['x-webhook-secret'] || req.query.secret;
    if (token !== WEBHOOK_SECRET) {
      res.status(401).json({ error: '認証エラー' });
      return;
    }
  }

  const { post_id: postId, status } = req.body;

  // 公開イベントのみ処理
  if (status !== 'publish') {
    res.status(200).json({ message: 'skipped: not a publish event' });
    return;
  }

  if (!postId) {
    res.status(400).json({ error: 'post_id が必要です' });
    return;
  }

  logger.info(`フローB開始: WordPress記事 ID=${postId}`, { flow: 'B', postId });

  // 即座に200を返してWebhookのタイムアウトを防ぐ
  res.status(200).json({ message: 'accepted', postId });

  // 非同期でSNS投稿処理を実行
  processFlowB(String(postId)).catch(async (error) => {
    logger.error('フローB処理エラー', { flow: 'B', postId, error: String(error) });
    await notifyError(`WordPress記事ID=${postId}のSNS投稿処理`, error, 'B');
  });
}

async function processFlowB(postId: string): Promise<void> {
  // WordPress から記事内容を取得
  const article = await withRetry(
    () => wpHandler.getPost(postId),
    'WordPress記事取得',
    { maxAttempts: 3, shouldRetry: isRetryableHttpError }
  );
  logger.info('フローB: 記事取得完了', { flow: 'B', title: article.title });

  // Claude で各SNS用投稿文を生成
  const snsPosts = await withRetry(
    () => claudeHandler.generateSNSPosts({
      title: article.title,
      content: article.content,
      url: article.url,
      excerpt: article.excerpt,
    }),
    'Claude SNS投稿文生成',
    { maxAttempts: 2 }
  );

  // アイキャッチ画像を取得（TikTok動画生成用）
  let thumbnailBuffer: Buffer | null = null;
  if (article.thumbnailUrl) {
    thumbnailBuffer = await wpHandler.getThumbnailBuffer(article.thumbnailUrl);
  }

  // TikTok用動画を先に生成開始（最も時間がかかる）
  const videoPromise = veoHandler.generateVideo({
    imageBuffer: thumbnailBuffer ?? undefined,
    caption: snsPosts.tiktokCaption,
  }).catch(e => {
    logger.error('TikTok動画生成失敗', { flow: 'B', error: String(e) });
    return null;
  });

  // Facebook・Instagram・LIFULL介護は並列投稿
  const [fbResult, igResult, lifullResult] = await Promise.allSettled([
    withRetry(
      () => hubspotHandler.postFacebook(snsPosts.facebookPost, article.url),
      'HubSpot Facebook投稿',
      { maxAttempts: 3, shouldRetry: isRetryableHttpError }
    ),
    withRetry(
      () => hubspotHandler.postInstagram(snsPosts.instagramPost, article.thumbnailUrl || ''),
      'HubSpot Instagram投稿',
      { maxAttempts: 3, shouldRetry: isRetryableHttpError }
    ),
    withRetry(
      () => lifullHandler.post(snsPosts.lifullPost, article.url),
      'LIFULL介護投稿',
      { maxAttempts: 2 }
    ),
  ]);

  // TikTok: 動画生成完了後に投稿
  const video = await videoPromise;
  let tiktokSuccess = false;
  if (video) {
    try {
      await withRetry(
        () => tiktokHandler.post(video.gcsUri, snsPosts.tiktokCaption),
        'TikTok動画投稿',
        { maxAttempts: 2, shouldRetry: isRetryableHttpError }
      );
      tiktokSuccess = true;
    } catch (e) {
      logger.error('TikTok投稿失敗', { flow: 'B', error: String(e) });
    }
  }

  // 投稿結果を通知
  const results = {
    Facebook: fbResult.status === 'fulfilled',
    Instagram: igResult.status === 'fulfilled',
    TikTok: tiktokSuccess,
    'LIFULL介護': lifullResult.status === 'fulfilled',
  };

  await notifySNSPosted(article.title, results);

  logger.info('フローB完了', { flow: 'B', postId, results });
}
