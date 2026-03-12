import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import * as wpHandler from './wpHandler';
import * as claudeHandler from './claudeHandler';
import * as veoHandler from './veoHandler';
import * as hubspotHandler from './hubspotHandler';
import * as tiktokHandler from './tiktokHandler';
import * as lifullHandler from './lifullHandler';

// フローB: WordPress Webhook を受信してSNS自動投稿を実行
export async function handleWordPressWebhook(req: Request, res: Response): Promise<void> {
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
  processFlowB(String(postId)).catch((error) => {
    logger.error('フローB処理エラー', { flow: 'B', postId, error: String(error) });
  });
}

async function processFlowB(postId: string): Promise<void> {
  try {
    // WordPress から記事内容を取得
    const article = await wpHandler.getPost(postId);
    logger.info('フローB: 記事取得完了', { flow: 'B', title: article.title });

    // Claude で各SNS用投稿文を生成
    const snsPosts = await claudeHandler.generateSNSPosts({
      title: article.title,
      content: article.content,
      url: article.url,
      excerpt: article.excerpt,
    });

    // アイキャッチ画像を取得（TikTok動画生成用）
    let thumbnailBuffer: Buffer | null = null;
    if (article.thumbnailUrl) {
      thumbnailBuffer = await wpHandler.getThumbnailBuffer(article.thumbnailUrl);
    }

    // TikTok用動画を生成
    const videoTask = veoHandler.generateVideo({
      imageBuffer: thumbnailBuffer ?? undefined,
      caption: snsPosts.tiktokCaption,
    });

    // Facebook・Instagram・LIFULL介護は先に並列投稿（動画生成を待たない）
    const [videoResult] = await Promise.allSettled([
      videoTask,
      hubspotHandler.postFacebook(snsPosts.facebookPost, article.url),
      hubspotHandler.postInstagram(snsPosts.instagramPost, article.thumbnailUrl || ''),
      lifullHandler.post(snsPosts.lifullPost, article.url),
    ]);

    // TikTok は動画生成完了後に投稿
    if (videoResult.status === 'fulfilled') {
      await tiktokHandler.post(videoResult.value.gcsUri, snsPosts.tiktokCaption);
    } else {
      logger.error('TikTok動画生成失敗', { flow: 'B', error: String(videoResult.reason) });
    }

    logger.info('フローB完了: 全プラットフォームへの投稿が完了しました', {
      flow: 'B',
      postId,
      title: article.title,
    });

  } catch (error) {
    logger.error('フローB: 処理失敗', { flow: 'B', postId, error: String(error) });
    throw error;
  }
}
