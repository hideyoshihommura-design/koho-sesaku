import axios from 'axios';
import { Storage } from '@google-cloud/storage';
import { logger } from '../utils/logger';
import { getSecret, SECRET_NAMES } from '../utils/secretManager';

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';
const BUCKET_NAME = process.env.GCS_BUCKET || `${process.env.GOOGLE_CLOUD_PROJECT}-sns-videos`;
const storage = new Storage();

// TikTok Content Posting API で動画を投稿
export async function post(gcsUri: string, caption: string): Promise<void> {
  logger.info('TikTok: 動画投稿開始', { flow: 'B', platform: 'TikTok' });

  const token = await getSecret(SECRET_NAMES.TIKTOK_ACCESS_TOKEN);

  // GCS から動画のサイズを取得
  const fileName = gcsUri.replace(`gs://${BUCKET_NAME}/`, '');
  const file = storage.bucket(BUCKET_NAME).file(fileName);
  const [metadata] = await file.getMetadata();
  const videoSize = Number(metadata.size);

  // Step 1: 動画アップロードの初期化
  const initResponse = await axios.post(
    `${TIKTOK_API_BASE}/post/publish/video/init/`,
    {
      post_info: {
        title: caption.slice(0, 150), // TikTokのタイトルは150文字まで
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: await getSignedUrl(fileName),
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
    }
  );

  const publishId = initResponse.data.data?.publish_id;
  logger.info('TikTok: アップロード開始', { publishId });

  // Step 2: 投稿ステータスを確認（最大3分）
  await waitForPublish(publishId, token);
  logger.info('TikTok: 動画投稿完了', { platform: 'TikTok', publishId });
}

async function getSignedUrl(fileName: string): Promise<string> {
  const [url] = await storage.bucket(BUCKET_NAME).file(fileName).getSignedUrl({
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000, // 1時間
  });
  return url;
}

async function waitForPublish(publishId: string, token: string): Promise<void> {
  const maxAttempts = 36; // 3分（5秒 × 36回）

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));

    const response = await axios.post(
      `${TIKTOK_API_BASE}/post/publish/status/fetch/`,
      { publish_id: publishId },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    const status = response.data.data?.status;
    if (status === 'PUBLISH_COMPLETE') return;
    if (status === 'FAILED') {
      throw new Error(`TikTok投稿失敗: ${JSON.stringify(response.data)}`);
    }
  }

  throw new Error('TikTok: 投稿タイムアウト');
}
