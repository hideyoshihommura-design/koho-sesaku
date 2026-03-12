import axios from 'axios';
import { logger } from '../utils/logger';
import { getSecret, SECRET_NAMES } from '../utils/secretManager';
import { GeneratedArticle } from '../prompts/articlePrompt';

const WP_BASE_URL = process.env.WORDPRESS_BASE_URL!; // 例: https://example.com
const WP_USERNAME = process.env.WORDPRESS_USERNAME!;

export interface WordPressPost {
  id: number;
  title: string;
  content: string;
  excerpt: string;
  url: string;
  thumbnailUrl?: string;
  status: 'publish' | 'draft' | 'private';
}

async function getWpAuth(): Promise<string> {
  const appPassword = await getSecret(SECRET_NAMES.WORDPRESS_APP_PASSWORD);
  return Buffer.from(`${WP_USERNAME}:${appPassword}`).toString('base64');
}

// フローA: WordPress に下書きとして投稿
export async function createDraft(article: GeneratedArticle): Promise<number> {
  logger.info('WordPress: 下書き作成開始', { flow: 'A', title: article.title });

  const auth = await getWpAuth();

  const response = await axios.post(
    `${WP_BASE_URL}/wp-json/wp/v2/posts`,
    {
      title: article.title,
      content: article.content,
      excerpt: article.metaDescription,
      status: 'draft',
      meta: {
        _yoast_wpseo_metadesc: article.metaDescription, // Yoast SEO対応
        // SNS投稿文をカスタムフィールドに保存しておく
        sns_facebook_post: article.facebookPost,
        sns_instagram_post: article.instagramPost,
        sns_tiktok_caption: article.tiktokCaption,
        sns_lifull_post: article.lifullPost,
      },
    },
    {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const postId = response.data.id as number;
  logger.info(`WordPress: 下書き作成完了 ID=${postId}`, { flow: 'A', postId });
  return postId;
}

// フローB: WordPress から記事内容を取得
export async function getPost(postId: string): Promise<WordPressPost> {
  logger.info(`WordPress: 記事取得 ID=${postId}`, { flow: 'B', postId });

  const auth = await getWpAuth();

  const response = await axios.get(
    `${WP_BASE_URL}/wp-json/wp/v2/posts/${postId}?_embed`,
    {
      headers: { Authorization: `Basic ${auth}` },
    }
  );

  const data = response.data;

  // アイキャッチ画像URLを取得
  const thumbnailUrl = data._embedded?.['wp:featuredmedia']?.[0]?.source_url;

  return {
    id: data.id,
    title: data.title.rendered,
    content: stripHtml(data.content.rendered),
    excerpt: stripHtml(data.excerpt.rendered),
    url: data.link,
    thumbnailUrl,
    status: data.status,
  };
}

// アイキャッチ画像をBufferで取得
export async function getThumbnailBuffer(thumbnailUrl: string): Promise<Buffer | null> {
  try {
    const response = await axios.get(thumbnailUrl, { responseType: 'arraybuffer' });
    return Buffer.from(response.data as ArrayBuffer);
  } catch {
    logger.warn('WordPress: アイキャッチ画像取得失敗', { url: thumbnailUrl });
    return null;
  }
}

// HTMLタグを除去してプレーンテキスト化
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}
