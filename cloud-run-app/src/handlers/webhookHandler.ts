import { logger } from '../utils/logger';
import { withRetry, isRetryableHttpError } from '../utils/retry';
import { notifySNSPosted, notifyError } from '../utils/notify';
import { getSeenUrls, saveSeenUrls } from '../utils/stateStore';
import { getArticleUrls, getArticleContent, ScrapedArticle } from './scraperHandler';
import * as claudeHandler from './claudeHandler';
import * as veoHandler from './veoHandler';
import * as hubspotHandler from './hubspotHandler';
import axios from 'axios';

// フローB: お知らせページをポーリングして新着記事をSNS投稿
export async function pollAndPost(): Promise<{ newCount: number }> {
  logger.info('フローB: ポーリング開始', { flow: 'B' });

  // スクレイピングで記事URL一覧を取得
  const articles = await getArticleUrls();
  if (articles.length === 0) {
    logger.info('フローB: 記事が見つかりませんでした', { flow: 'B' });
    return { newCount: 0 };
  }

  // 投稿済みURLを読み込み、新着を絞り込む
  const seenUrls = await getSeenUrls();
  const newArticles = articles.filter(a => !seenUrls.has(a.url));

  logger.info(`フローB: 新着 ${newArticles.length} 件`, { flow: 'B', total: articles.length });

  if (newArticles.length === 0) {
    return { newCount: 0 };
  }

  // 新着記事を順次処理（並列は負荷が高いため直列）
  for (const { url } of newArticles) {
    try {
      const article = await getArticleContent(url);
      await processFlowB(article);
      seenUrls.add(url);
    } catch (error) {
      logger.error('フローB: 記事処理失敗', { flow: 'B', url, error: String(error) });
      await notifyError(`記事URL=${url}のSNS投稿処理`, error, 'B');
      // 1件失敗しても次の記事を継続処理
    }
  }

  // 今回確認した全URLを保存（次回以降の重複投稿を防ぐ）
  for (const { url } of articles) seenUrls.add(url);
  await saveSeenUrls(seenUrls);

  return { newCount: newArticles.length };
}

// 1記事分のSNS投稿処理（フローBコア）
async function processFlowB(article: ScrapedArticle): Promise<void> {
  logger.info('フローB: SNS投稿処理開始', { flow: 'B', title: article.title });

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

  // アイキャッチ画像を Buffer で取得（TikTok動画生成用）
  let thumbnailBuffer: Buffer | null = null;
  if (article.thumbnailUrl) {
    thumbnailBuffer = await fetchImageBuffer(article.thumbnailUrl);
  }

  const xEnabled = !!process.env.HUBSPOT_X_CHANNEL_ID;
  const tiktokEnabled = !!process.env.HUBSPOT_TIKTOK_CHANNEL_ID;

  // TikTok動画を先に生成開始（最も時間がかかる）
  const videoPromise = tiktokEnabled
    ? veoHandler.generateVideo({
        imageBuffer: thumbnailBuffer ?? undefined,
        caption: snsPosts.tiktokCaption,
      }).catch(e => {
        logger.error('TikTok動画生成失敗', { flow: 'B', error: String(e) });
        return null;
      })
    : Promise.resolve(null);

  // Facebook・Instagram（必須）+ X（任意）を並列投稿
  const parallelPosts: Promise<PromiseSettledResult<void>>[] = [
    Promise.allSettled([
      withRetry(
        () => hubspotHandler.postFacebook(snsPosts.facebookPost, article.url),
        'HubSpot Facebook投稿',
        { maxAttempts: 3, shouldRetry: isRetryableHttpError }
      ),
    ]).then(r => r[0]),
    Promise.allSettled([
      withRetry(
        () => hubspotHandler.postInstagram(snsPosts.instagramPost, article.thumbnailUrl || ''),
        'HubSpot Instagram投稿',
        { maxAttempts: 3, shouldRetry: isRetryableHttpError }
      ),
    ]).then(r => r[0]),
  ];

  if (xEnabled) {
    parallelPosts.push(
      Promise.allSettled([
        withRetry(
          () => hubspotHandler.postX(snsPosts.xPost, article.url),
          'HubSpot X投稿',
          { maxAttempts: 3, shouldRetry: isRetryableHttpError }
        ),
      ]).then(r => r[0])
    );
  } else {
    logger.info('X投稿スキップ（HUBSPOT_X_CHANNEL_ID未設定）', { flow: 'B' });
  }

  const [fbResult, igResult, xResult] = await Promise.all(parallelPosts);

  // TikTok: 動画生成完了後に HubSpot 経由で投稿
  const video = await videoPromise;
  let tiktokSuccess = false;
  if (tiktokEnabled && video) {
    try {
      await withRetry(
        () => hubspotHandler.postTikTok(snsPosts.tiktokCaption, video.publicUrl),
        'HubSpot TikTok投稿',
        { maxAttempts: 2, shouldRetry: isRetryableHttpError }
      );
      tiktokSuccess = true;
    } catch (e) {
      logger.error('TikTok投稿失敗', { flow: 'B', error: String(e) });
    }
  } else if (!tiktokEnabled) {
    logger.info('TikTok投稿スキップ（HUBSPOT_TIKTOK_CHANNEL_ID未設定）', { flow: 'B' });
  }

  const results: Record<string, boolean> = {
    Facebook: fbResult?.status === 'fulfilled',
    Instagram: igResult?.status === 'fulfilled',
    X: xEnabled ? xResult?.status === 'fulfilled' : false,
    TikTok: tiktokEnabled ? tiktokSuccess : false,
  };

  await notifySNSPosted(article.title, results);
  logger.info('フローB: SNS投稿処理完了', { flow: 'B', title: article.title, results });
}

// 画像URLを Buffer で取得
async function fetchImageBuffer(imageUrl: string): Promise<Buffer | null> {
  try {
    const res = await axios.get<ArrayBuffer>(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
    return Buffer.from(res.data);
  } catch {
    logger.warn('Scraper: アイキャッチ画像取得失敗', { url: imageUrl });
    return null;
  }
}
