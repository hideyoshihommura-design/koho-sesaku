// Cloud Scheduler から呼ばれる処理パイプライン
// 18:00 と 23:00 に実行: Drive から未処理素材を取得 → Claude 生成 → 動画生成 → Firestore 保存 → Chat 通知

import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { listUnprocessedMaterials, downloadImagesAsBase64, markAsProcessed } from './driveHandler';
import { generateSnsPost } from './snsGenerateHandler';
import { generateSlideshowVideo } from './videoHandler';
import { saveMaterial, countPendingMaterials } from './firestoreHandler';
import { notifyProcessingComplete, notifyPendingReminder, notifyError } from '../utils/notify';
import { getSecret, SECRET_NAMES } from '../utils/secretManager';

// Cloud Run のサービス URL + 秘密パスを組み立て
async function getAppUrl(): Promise<string> {
  const serviceUrl = process.env.CLOUD_RUN_URL || `https://sns-auto-post-${process.env.GOOGLE_CLOUD_PROJECT}.a.run.app`;
  const secretPath = await getSecret(SECRET_NAMES.APP_SECRET_PATH);
  return `${serviceUrl}/app/${secretPath}`;
}

// Cloud Scheduler からのリクエスト認証チェック
async function validateSchedulerRequest(req: Request): Promise<boolean> {
  const authHeader = req.headers['authorization'] || '';
  const xSchedulerToken = req.headers['x-scheduler-token'] as string | undefined;

  if (xSchedulerToken) {
    const expectedToken = await getSecret(SECRET_NAMES.SCHEDULER_SECRET);
    return xSchedulerToken === expectedToken;
  }

  // Cloud Run の OIDC 検証（Cloud Scheduler は Bearer トークンを付与）
  return authHeader.startsWith('Bearer ');
}

// メイン処理パイプライン（18:00・23:00 実行）
export async function handleProcess(req: Request, res: Response): Promise<void> {
  const isValid = await validateSchedulerRequest(req);
  if (!isValid) {
    logger.warn('スケジューラー認証失敗');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  logger.info('処理パイプライン開始');
  res.status(200).json({ message: '処理を開始しました' });

  // 非同期で処理（Cloud Scheduler のタイムアウトを避ける）
  processAllMaterials().catch(err => {
    logger.error('処理パイプラインでエラー', { error: String(err) });
    notifyError(`処理パイプラインでエラーが発生しました: ${String(err)}`).catch(() => {});
  });
}

async function processAllMaterials(): Promise<void> {
  const materials = await listUnprocessedMaterials();

  if (materials.length === 0) {
    logger.info('未処理素材なし。処理をスキップします');
    return;
  }

  logger.info('処理開始', { totalCount: materials.length });

  let successCount = 0;

  for (const material of materials) {
    try {
      logger.info('素材を処理中', { materialId: material.materialId });

      // 画像を Drive からダウンロード（最大4枚）
      const images = material.driveImageFileIds && material.driveImageFileIds.length > 0
        ? await downloadImagesAsBase64(material.driveImageFileIds)
        : [];

      // Claude で投稿文生成
      const generated = await generateSnsPost(material, images);

      // Remotion でスライドショー動画を生成（画像がある場合のみ）
      let videoGcsPath: string | null = null;
      if (images.length > 0) {
        try {
          // Instagram 投稿文を字幕として使用
          videoGcsPath = await generateSlideshowVideo(
            material.materialId,
            images,
            generated.instagram
          );
        } catch (videoErr) {
          // 動画生成に失敗しても投稿文は保存して続行
          logger.warn('動画生成をスキップします', {
            materialId: material.materialId,
            error: String(videoErr),
          });
        }
      }

      // Firestore に保存
      await saveMaterial(material, generated, videoGcsPath);

      // Drive の素材を処理済みにマーク
      await markAsProcessed(material.materialId);

      successCount++;
      logger.info('素材の処理が完了', { materialId: material.materialId });

    } catch (err) {
      logger.error('素材の処理中にエラー', {
        materialId: material.materialId,
        error: String(err),
      });
      // 1件失敗しても続行
    }
  }

  // 処理完了通知（1件以上成功した場合）
  if (successCount > 0) {
    const appUrl = await getAppUrl();
    await notifyProcessingComplete(appUrl, successCount);
    logger.info('処理パイプライン完了', { successCount, total: materials.length });
  }
}

// リマインダーパイプライン（毎日10:00 実行）
export async function handleReminder(req: Request, res: Response): Promise<void> {
  const isValid = await validateSchedulerRequest(req);
  if (!isValid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  logger.info('リマインダーチェック開始');

  try {
    const pendingCount = await countPendingMaterials();

    if (pendingCount > 0) {
      const appUrl = await getAppUrl();
      await notifyPendingReminder(appUrl, pendingCount);
    } else {
      logger.info('未承認の素材なし');
    }

    res.status(200).json({ pendingCount });
  } catch (err) {
    logger.error('リマインダーチェックでエラー', { error: String(err) });
    res.status(500).json({ error: String(err) });
  }
}
