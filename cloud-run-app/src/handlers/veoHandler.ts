import axios from 'axios';
import { Storage } from '@google-cloud/storage';
import { logger } from '../utils/logger';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT!;
const REGION = process.env.VEO_REGION || 'us-central1';
const BUCKET_NAME = process.env.GCS_BUCKET || `${PROJECT_ID}-sns-videos`;
const storage = new Storage();

export interface VeoInput {
  imageBuffer?: Buffer;
  caption: string;
  durationSeconds?: number;
}

export interface GeneratedVideo {
  gcsUri: string;
  publicUrl: string;
  localPath?: string;
}

// Vertex AI Veo 2 で動画を生成する
export async function generateVideo(input: VeoInput): Promise<GeneratedVideo> {
  logger.info('Veo 2: 動画生成開始', { caption: input.caption.slice(0, 50) });

  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
  const accessToken = await auth.getAccessToken();

  const endpoint = `https://${REGION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/publishers/google/models/veo-2:predictLongRunning`;

  const requestBody: Record<string, unknown> = {
    instances: [
      {
        prompt: buildVideoPrompt(input.caption),
        ...(input.imageBuffer ? {
          image: {
            bytesBase64Encoded: input.imageBuffer.toString('base64'),
            mimeType: 'image/jpeg',
          },
        } : {}),
      },
    ],
    parameters: {
      durationSeconds: input.durationSeconds || 15,
      aspectRatio: '9:16', // TikTok縦型
      generateAudio: true,
    },
  };

  // 長時間実行オペレーション開始
  const initResponse = await axios.post(endpoint, requestBody, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });

  const operationName = initResponse.data.name;
  logger.info('Veo 2: 生成オペレーション開始', { operation: operationName });

  // オペレーション完了待ち（最大5分）
  const videoData = await waitForOperation(operationName, accessToken as string);

  // Cloud Storage に保存
  const fileName = `tiktok-${Date.now()}.mp4`;
  const gcsUri = await saveToGCS(videoData, fileName);
  const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${fileName}`;

  logger.info('Veo 2: 動画生成完了', { gcsUri });
  return { gcsUri, publicUrl };
}

function buildVideoPrompt(caption: string): string {
  return `介護施設の温かみのある動画。${caption}。
テロップ付き、縦型フォーマット（9:16）、明るく穏やかな雰囲気、プロフェッショナルな品質。
高齢者とスタッフが笑顔で交流している場面。15秒間。`;
}

async function waitForOperation(operationName: string, accessToken: string): Promise<Buffer> {
  const pollingUrl = `https://us-central1-aiplatform.googleapis.com/v1/${operationName}`;
  const maxAttempts = 60; // 5分（5秒 × 60回）

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));

    const response = await axios.get(pollingUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.data.done) {
      if (response.data.error) {
        throw new Error(`Veo 2 エラー: ${JSON.stringify(response.data.error)}`);
      }
      const videoBase64 = response.data.response?.predictions?.[0]?.bytesBase64Encoded;
      if (!videoBase64) throw new Error('Veo 2: 動画データが空です');
      return Buffer.from(videoBase64, 'base64');
    }
  }

  throw new Error('Veo 2: タイムアウト（5分以内に生成されませんでした）');
}

async function saveToGCS(videoBuffer: Buffer, fileName: string): Promise<string> {
  const file = storage.bucket(BUCKET_NAME).file(fileName);
  await file.save(videoBuffer, { contentType: 'video/mp4' });
  return `gs://${BUCKET_NAME}/${fileName}`;
}
