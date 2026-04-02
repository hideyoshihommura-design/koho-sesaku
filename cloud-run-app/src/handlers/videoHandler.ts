// ffmpeg を使ってスライドショー動画を生成し GCS にアップロードするハンドラ
// Remotion（Chromium依存）から ffmpeg に変更（Cloud Run 環境での安定動作のため）

import { Storage } from '@google-cloud/storage';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);
const storage = new Storage();

// GCS バケット名
function getBucketName(): string {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT が設定されていません');
  return `${project}-sns-videos`;
}

// BGM ファイル一覧
const BGM_FILES = ['bgm1.mp3', 'bgm2.mp3', 'bgm3.mp3'];
function pickBgm(): string {
  return BGM_FILES[Math.floor(Math.random() * BGM_FILES.length)];
}

// BGM ファイルのパス（Dockerfile で public/music/ をコピー済み）
function getBgmPath(file: string): string {
  return path.join(__dirname, '../../public/music', file);
}

/**
 * 写真からスライドショー動画を生成して GCS に保存する（ffmpeg 版）
 * - 1080x1920（縦型 9:16）
 * - 1枚あたり5秒表示
 * - BGM付き（30秒、ループなし）
 * - 黒背景にセンタリングして表示
 */
export async function generateSlideshowVideo(
  materialId: string,
  images: Array<{ base64: string; mimeType: string }>,
  captionText: string
): Promise<string> {
  if (images.length === 0) {
    throw new Error('動画生成には1枚以上の画像が必要です');
  }

  const tmpDir = path.join(os.tmpdir(), `video-${materialId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // ─── 1. 画像を一時ファイルに保存 ───
    const imagePaths: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const ext = images[i].mimeType.includes('png') ? 'png' : 'jpg';
      const imgPath = path.join(tmpDir, `img${i}.${ext}`);
      fs.writeFileSync(imgPath, Buffer.from(images[i].base64, 'base64'));
      imagePaths.push(imgPath);
    }

    logger.info('動画生成を開始します（ffmpeg）', {
      materialId,
      imageCount: images.length,
    });

    // ─── 2. concat ファイルを作成（各画像5秒表示） ───
    const concatFile = path.join(tmpDir, 'concat.txt');
    const concatLines = imagePaths.flatMap(p => [`file '${p}'`, `duration 5`]);
    // concat demuxer は最後のファイルを再度指定する必要がある
    concatLines.push(`file '${imagePaths[imagePaths.length - 1]}'`);
    fs.writeFileSync(concatFile, concatLines.join('\n'));

    // ─── 3. スライドショー動画を生成（音声なし）───
    const videoNoAudio = path.join(tmpDir, 'slideshow.mp4');
    const slideshowCmd = [
      'ffmpeg -y',
      `-f concat -safe 0 -i "${concatFile}"`,
      `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,`,
      `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1"`,
      `-c:v libx264 -pix_fmt yuv420p -r 30`,
      `"${videoNoAudio}"`,
    ].join(' ');

    await execAsync(slideshowCmd);

    // ─── 4. BGM を合成 ───
    const outputPath = path.join(os.tmpdir(), `${materialId}.mp4`);
    const bgmFile = pickBgm();
    const bgmPath = getBgmPath(bgmFile);

    let finalCmd: string;
    if (fs.existsSync(bgmPath)) {
      // BGM あり: 動画の長さに合わせてカット（-shortest）
      finalCmd = [
        'ffmpeg -y',
        `-i "${videoNoAudio}"`,
        `-i "${bgmPath}"`,
        `-shortest`,
        `-c:v copy -c:a aac -b:a 128k`,
        `"${outputPath}"`,
      ].join(' ');
    } else {
      // BGM なし: そのままコピー
      logger.warn('BGMファイルが見つかりません', { bgmPath });
      finalCmd = `ffmpeg -y -i "${videoNoAudio}" -c:v copy "${outputPath}"`;
    }

    await execAsync(finalCmd);

    // ─── 5. GCS にアップロード ───
    const destPath = `videos/${materialId}.mp4`;
    await storage.bucket(getBucketName()).upload(outputPath, {
      destination: destPath,
      metadata: { contentType: 'video/mp4' },
    });

    // 一時ファイルをクリーンアップ
    fs.unlinkSync(outputPath);

    logger.info('動画を GCS に保存しました', { materialId, destPath, bgmFile });
    return destPath;

  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
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
