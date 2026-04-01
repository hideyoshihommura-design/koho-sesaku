// Claude API を使って SNS 投稿文を生成するハンドラ

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger';
import { withRetry, isRetryableHttpError } from '../utils/retry';
import { getSecret, SECRET_NAMES } from '../utils/secretManager';
import { buildSnsPrompt, SnsGenerationOutput } from '../prompts/snsPrompt';
import { MaterialMetadata } from './driveHandler';

// Anthropic クライアントのシングルトン
let anthropicClient: Anthropic | null = null;

async function getAnthropicClient(): Promise<Anthropic> {
  if (!anthropicClient) {
    const apiKey = await getSecret(SECRET_NAMES.ANTHROPIC_API_KEY);
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// 1件の素材から SNS 投稿文を生成
export async function generateSnsPost(
  metadata: MaterialMetadata,
  images: Array<{ base64: string; mimeType: string }>
): Promise<SnsGenerationOutput> {
  const client = await getAnthropicClient();

  const prompt = buildSnsPrompt({
    comment: metadata.comment || '（コメントなし）',
    photoCount: metadata.photoCount,
  });

  // Claude API に送るメッセージを構築
  // 画像がある場合は vision を使用
  const contentBlocks: Anthropic.MessageParam['content'] = [];

  for (const img of images) {
    contentBlocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: img.base64,
      },
    });
  }

  contentBlocks.push({
    type: 'text',
    text: prompt,
  });

  const result = await withRetry(
    async () => {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: contentBlocks,
          },
        ],
      });

      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('Claude からテキストレスポンスが返りませんでした');
      }

      return textContent.text;
    },
    'Claude SNS生成',
    {
      maxAttempts: 3,
      shouldRetry: isRetryableHttpError,
    }
  );

  // JSON を抽出してパース
  const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) {
    // コードブロックなしで JSON が返ることもある
    const directJson = result.match(/\{[\s\S]*\}/);
    if (!directJson) {
      throw new Error(`Claude のレスポンスから JSON を抽出できません: ${result.substring(0, 200)}`);
    }
    return JSON.parse(directJson[0]) as SnsGenerationOutput;
  }

  const parsed = JSON.parse(jsonMatch[1]) as SnsGenerationOutput;

  logger.info('SNS投稿文を生成しました', {
    materialId: metadata.materialId,
    detectedBranch: parsed.detectedBranch,
    hasFacePermission: parsed.hasFacePermission,
  });

  return parsed;
}
