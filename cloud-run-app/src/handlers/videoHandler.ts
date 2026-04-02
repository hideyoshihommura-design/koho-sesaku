// Remotion を使ってスライドショー動画を生成し GCS にアップロードするハンドラ
// 認証は Cloud Run の Workload Identity（ADC）で自動処理される

import { renderMedia, selectComposition } from '@remotion/renderer';
import { Storage } from '@google-cloud/storage';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { logger } from '../utils/logger';

const storage = new Storage();

// Docker ビルド時に生成した Remotion バンドルのパス
// dist/handlers/videoHandler.js から見て dist/video-bundle/
const BUNDLE_PATH = path.join(__dirname, '../video-bundle');

// GCS バケット名（setup.sh で作成）
function getBucketName(): string {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT が設定されていません');
  return `${project}-sns-videos`;
}

/**
 * 写真からスライドショー動画を生成して GCS に保存する
 *
 * @param materialId   素材ID（ファイル名に使用）
 * @param images       Drive からダウンロードした画像（base64）
 * @returns GCS のオブジェクトパス（例: videos/XXXX.mp4）
 */
export async function generateSlideshowVideo(
  materialId: string,
  images: Array<{ base64: string; mimeType: string }>
): Promise<string> {
  if (images.length === 0) {
    throw new Error('動画生成には1枚以上の画像が必要です');
  }

  const frameDuration = 90;    // 1枚あたり 3秒（30fps × 3）
  const transitionFrames = 15; // フェード 0.5秒

  // base64 → data URL に変換（Remotion の Img コンポーネントに渡す）
  const imageDataUrls = images.map(
    (img) => `data:${img.mimeType};base64,${img.base64}`
  );

  // 総フレーム数（最後の画像はフェードアウト不要のため -transitionFrames）
  const totalFrames = images.length * frameDuration + transitionFrames;

  const inputProps = { imageDataUrls, frameDuration, transitionFrames };

  logger.info('動画生成を開始します', {
    materialId,
    imageCount: images.length,
    durationSec: Math.round(totalFrames / 30),
  });

  // Remotion の合成情報を取得（バンドルから）
  const composition = await selectComposition({
    serveUrl: BUNDLE_PATH,
    id: 'Slideshow',
    inputProps,
  });

  // durationInFrames を画像枚数に合わせて上書き
  composition.durationInFrames = totalFrames;

  // 一時ファイルに MP4 を出力
  const tmpPath = path.join(os.tmpdir(), `${materialId}.mp4`);

  await renderMedia({
    composition,
    serveUrl: BUNDLE_PATH,
    codec: 'h264',
    outputLocation: tmpPath,
    inputProps,
    // Cloud Run（コンテナ）向けの Chromium 設定
    browserExecutable: process.env.CHROME_EXECUTABLE_PATH || '/usr/bin/chromium',
    chromiumOptions: {
      gl: 'swangle', // ソフトウェアレンダリング（GPU なし環境向け）
      disableWebSecurity: true,
    },
  });

  // GCS にアップロード
  const bucketName = getBucketName();
  const destPath = `videos/${materialId}.mp4`;

  await storage.bucket(bucketName).upload(tmpPath, {
    destination: destPath,
    metadata: { contentType: 'video/mp4' },
  });

  // 一時ファイルを削除
  fs.unlinkSync(tmpPath);

  logger.info('動画を GCS に保存しました', { materialId, bucketName, destPath });

  return destPath; // 例: videos/XXXX.mp4
}

/** GCS の署名付き URL を生成（Web アプリでのプレビュー用） */
export async function getVideoSignedUrl(gcsPath: string): Promise<string> {
  const bucketName = getBucketName();
  const [url] = await storage.bucket(bucketName).file(gcsPath).getSignedUrl({
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000, // 1時間
  });
  return url;
}
