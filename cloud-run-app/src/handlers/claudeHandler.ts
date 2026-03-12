import AnthropicVertex from '@anthropic-ai/vertex-sdk';
import { buildArticlePrompt, parseGeneratedArticle, ArticlePromptInput, GeneratedArticle } from '../prompts/articlePrompt';
import { buildSNSPrompt, parseGeneratedSNSPosts, SNSPromptInput, GeneratedSNSPosts } from '../prompts/snsPrompt';
import { logger } from '../utils/logger';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT!;
const REGION = process.env.VERTEX_AI_REGION || 'us-east5'; // Claudeが使えるリージョン
const MODEL = 'claude-sonnet-4-5'; // Vertex AI 上のClaude Sonnet

const client = new AnthropicVertex({ projectId: PROJECT_ID, region: REGION });

// 画像をBase64でClaudeに渡して内容を説明させる
export async function analyzeImages(imageBuffers: Buffer[]): Promise<string> {
  if (imageBuffers.length === 0) return '画像なし';

  logger.info('Claude: 画像解析開始', { flow: 'A', count: imageBuffers.length });

  const imageContents = imageBuffers.slice(0, 5).map((buf) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/jpeg' as const,
      data: buf.toString('base64'),
    },
  }));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          ...imageContents,
          {
            type: 'text',
            text: '上記の画像を日本語で詳しく説明してください。介護施設や介護サービスに関連する要素があれば特に詳しく。',
          },
        ],
      },
    ],
  });

  const text = response.content[0];
  return text.type === 'text' ? text.text : '';
}

// フローA：記事＋SNS投稿文を一括生成
export async function generateArticle(input: ArticlePromptInput): Promise<GeneratedArticle> {
  logger.info('Claude: 記事生成開始', { flow: 'A', folder: input.folderName });

  const prompt = buildArticlePrompt(input);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0];
  if (text.type !== 'text') throw new Error('予期しないレスポンス形式');

  const article = parseGeneratedArticle(text.text);
  logger.info('Claude: 記事生成完了', { flow: 'A', title: article.title });
  return article;
}

// フローB：SNS投稿文のみ最適化生成
export async function generateSNSPosts(input: SNSPromptInput): Promise<GeneratedSNSPosts> {
  logger.info('Claude: SNS投稿文生成開始', { flow: 'B', url: input.url });

  const prompt = buildSNSPrompt(input);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0];
  if (text.type !== 'text') throw new Error('予期しないレスポンス形式');

  const posts = parseGeneratedSNSPosts(text.text);
  logger.info('Claude: SNS投稿文生成完了', { flow: 'B' });
  return posts;
}
