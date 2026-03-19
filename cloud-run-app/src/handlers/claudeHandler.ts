import { VertexAI, Part } from '@google-cloud/vertexai';
import { buildArticlePrompt, parseGeneratedArticle, ArticlePromptInput, GeneratedArticle } from '../prompts/articlePrompt';
import { buildSNSPrompt, parseGeneratedSNSPosts, SNSPromptInput, GeneratedSNSPosts } from '../prompts/snsPrompt';
import { logger } from '../utils/logger';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT!;
const REGION = process.env.GEMINI_REGION || 'us-central1';
const MODEL = 'gemini-2.0-flash-001';

const vertexAI = new VertexAI({ project: PROJECT_ID, location: REGION });
const model = vertexAI.getGenerativeModel({ model: MODEL });

// 画像をBase64でGeminiに渡して内容を説明させる
export async function analyzeImages(imageBuffers: Buffer[]): Promise<string> {
  if (imageBuffers.length === 0) return '画像なし';

  logger.info('Gemini: 画像解析開始', { flow: 'A', count: imageBuffers.length });

  const imageParts: Part[] = imageBuffers.slice(0, 5).map((buf) => ({
    inlineData: {
      mimeType: 'image/jpeg',
      data: buf.toString('base64'),
    },
  }));

  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          ...imageParts,
          { text: '上記の画像を日本語で詳しく説明してください。介護施設や介護サービスに関連する要素があれば特に詳しく。' },
        ],
      },
    ],
  });

  return result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// フローA：記事＋SNS投稿文を一括生成
export async function generateArticle(input: ArticlePromptInput): Promise<GeneratedArticle> {
  logger.info('Gemini: 記事生成開始', { flow: 'A', folder: input.folderName });

  const prompt = buildArticlePrompt(input);

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('予期しないレスポンス形式');

  const article = parseGeneratedArticle(text);
  logger.info('Gemini: 記事生成完了', { flow: 'A', title: article.title });
  return article;
}

// フローB：SNS投稿文のみ最適化生成
export async function generateSNSPosts(input: SNSPromptInput): Promise<GeneratedSNSPosts> {
  logger.info('Gemini: SNS投稿文生成開始', { flow: 'B', url: input.url });

  const prompt = buildSNSPrompt(input);

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('予期しないレスポンス形式');

  const posts = parseGeneratedSNSPosts(text);
  logger.info('Gemini: SNS投稿文生成完了', { flow: 'B' });
  return posts;
}
