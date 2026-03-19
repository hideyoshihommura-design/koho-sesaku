import { Storage } from '@google-cloud/storage';
import { logger } from './logger';

const storage = new Storage();
const BUCKET_NAME = process.env.GCS_STATE_BUCKET
  || `${process.env.GOOGLE_CLOUD_PROJECT}-sns-state`;
const STATE_FILE = 'flow-b-seen-urls.json';

// Cloud Storage から既に投稿済みのURLセットを取得
export async function getSeenUrls(): Promise<Set<string>> {
  try {
    const file = storage.bucket(BUCKET_NAME).file(STATE_FILE);
    const [exists] = await file.exists();
    if (!exists) return new Set();

    const [contents] = await file.download();
    const urls: string[] = JSON.parse(contents.toString('utf-8'));
    return new Set(urls);
  } catch (error) {
    logger.warn('stateStore: seen URLs の読み込み失敗、空セットで継続', { error: String(error) });
    return new Set();
  }
}

// 投稿済みURLセットを Cloud Storage に保存
export async function saveSeenUrls(urls: Set<string>): Promise<void> {
  const file = storage.bucket(BUCKET_NAME).file(STATE_FILE);
  await file.save(JSON.stringify([...urls]), { contentType: 'application/json' });
  logger.info('stateStore: seen URLs 保存完了', { count: urls.size });
}
