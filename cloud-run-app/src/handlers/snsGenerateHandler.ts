// Vertex AI 上の Claude Haiku を使って SNS 投稿文を生成するハンドラ
// 認証は Cloud Run の Workload Identity（ADC）で自動処理される
// Vertex AI の Claude エンドポイントに直接 HTTP リクエストを送る

import axios from 'axios';
import { GoogleAuth } from 'google-auth-library';
import { logger } from '../utils/logger';
import { withRetry, isRetryableHttpError } from '../utils/retry';
import { buildSnsPrompt, SnsGenerationOutput } from '../prompts/snsPrompt';
import { MaterialMetadata } from './driveHandler';

// Vertex AI 上の Claude Haiku モデル ID
const VERTEX_MODEL = 'claude-haiku-4-5@20251001';
const VERTEX_REGION = process.env.VERTEX_REGION || 'us-east5';

// Google ADC クライアント（Workload Identity で自動認証）
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

// Vertex AI Claude エンドポイント URL を組み立て
function getVertexUrl(): string {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT!;
  return `https://${VERTEX_REGION}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${VERTEX_REGION}/publishers/anthropic/models/${VERTEX_MODEL}:rawPredict`;
}

// Anthropic Claude メッセージ content の型
interface ImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}
interface TextContent {
  type: 'text';
  text: string;
}
type MessageContent = ImageContent | TextContent;

// Vertex AI 経由で Claude を呼び出す
async function callClaude(
  contentBlocks: MessageContent[]
): Promise<string> {
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = tokenResponse.token;

  const requestBody = {
    anthropic_version: 'vertex-2023-10-16',
    max_tokens: 2048,
    messages: [{ role: 'user', content: contentBlocks }],
  };

  const response = await axios.post(getVertexUrl(), requestBody, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 60000,
  });

  const textContent = response.data?.content?.find(
    (c: { type: string }) => c.type === 'text'
  ) as { type: string; text: string } | undefined;

  if (!textContent) {
    throw new Error('Claude からテキストレスポンスが返りませんでした');
  }

  return textContent.text;
}

// 1件の素材から SNS 投稿文を生成
export async function generateSnsPost(
  metadata: MaterialMetadata,
  images: Array<{ base64: string; mimeType: string }>
): Promise<SnsGenerationOutput> {
  const prompt = buildSnsPrompt({
    comment: metadata.comment || '（コメントなし）',
    photoCount: metadata.photoCount,
  });

  // 画像がある場合は vision も使用（最大4枚）
  const contentBlocks: MessageContent[] = images.map(img => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: img.mimeType,
      data: img.base64,
    },
  }));
  contentBlocks.push({ type: 'text', text: prompt });

  const result = await withRetry(
    () => callClaude(contentBlocks),
    'Vertex AI Claude SNS生成',
    {
      maxAttempts: 3,
      shouldRetry: isRetryableHttpError,
    }
  );

  // JSON を抽出してパース
  const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) {
    const directJson = result.match(/\{[\s\S]*\}/);
    if (!directJson) {
      throw new Error(`Claude のレスポンスから JSON を抽出できません: ${result.substring(0, 200)}`);
    }
    return JSON.parse(directJson[0]) as SnsGenerationOutput;
  }

  const parsed = JSON.parse(jsonMatch[1]) as SnsGenerationOutput;

  logger.info('SNS投稿文を生成しました', {
    materialId: metadata.materialId,
    model: VERTEX_MODEL,
    detectedBranch: parsed.detectedBranch,
    hasFacePermission: parsed.hasFacePermission,
  });

  return parsed;
}
