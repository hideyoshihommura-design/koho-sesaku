import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';

// お知らせページURL（環境変数で上書き可能）
const NEWS_PAGE_URL = process.env.OSHIRASE_PAGE_URL
  || 'https://aozora-cg.com/news/';

const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; SNSAutoBot/1.0)',
};

export interface ScrapedArticle {
  title: string;
  url: string;
  content: string;
  excerpt: string;
  thumbnailUrl?: string;
}

// お知らせ一覧ページから記事URL・タイトルを取得
export async function getArticleUrls(): Promise<{ title: string; url: string }[]> {
  logger.info('Scraper: お知らせページ取得', { url: NEWS_PAGE_URL });

  const response = await axios.get<string>(NEWS_PAGE_URL, {
    headers: REQUEST_HEADERS,
    timeout: 15000,
  });

  const $ = cheerio.load(response.data);
  const results: { title: string; url: string }[] = [];

  // aozora-cg.com のセレクター: .post-title a
  $('.post-title a').each((_i, el) => {
    const title = $(el).text().trim();
    const href = $(el).attr('href') || '';
    if (title && href) {
      results.push({ title, url: new URL(href, NEWS_PAGE_URL).href });
    }
  });

  // 重複除去
  const seen = new Set<string>();
  const unique = results.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  logger.info(`Scraper: ${unique.length} 件の記事URLを取得`, { flow: 'B' });
  return unique;
}

// 個別記事ページから本文・アイキャッチを取得
export async function getArticleContent(articleUrl: string): Promise<ScrapedArticle> {
  logger.info('Scraper: 記事ページ取得', { url: articleUrl });

  const response = await axios.get<string>(articleUrl, {
    headers: REQUEST_HEADERS,
    timeout: 15000,
  });

  const $ = cheerio.load(response.data);

  // タイトル: aozora-cg.com は h1.page-title
  const title =
    $('h1.page-title').first().text().trim() ||
    $('title').text().split('|')[0].trim();

  // 本文: .entry-content
  const content = $('.entry-content').text().replace(/\s+/g, ' ').trim();

  // アイキャッチ画像・抜粋: JSON-LD（schema.org）から取得
  let thumbnailUrl: string | undefined;
  let excerpt = '';
  try {
    const jsonLdText = $('script[type="application/ld+json"]').first().html() || '';
    if (jsonLdText) {
      const jsonLd = JSON.parse(jsonLdText) as Record<string, unknown>;
      thumbnailUrl = (jsonLd['image'] as string | undefined) ||
        ((jsonLd['image'] as Record<string, string> | undefined)?.url);
      excerpt = (jsonLd['description'] as string | undefined) || '';
    }
  } catch { /* JSON-LD がない場合はスキップ */ }

  // 抜粋が取れなければ本文の冒頭 120文字を使用
  if (!excerpt) {
    excerpt = content.slice(0, 120);
  }

  return { title, url: articleUrl, content, excerpt, thumbnailUrl };
}
