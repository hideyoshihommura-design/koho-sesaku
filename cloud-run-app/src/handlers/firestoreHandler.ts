// Firestore を使ったデータ管理
// 素材の受信記録・生成結果の保存・承認処理

import { Firestore, Timestamp } from '@google-cloud/firestore';
import { logger } from '../utils/logger';
import { SnsGenerationOutput } from '../prompts/snsPrompt';

const db = new Firestore();
const COLLECTION = 'materials';

// ─────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────

export type GenerationStatus = 'pending' | 'generated' | 'failed';
export type PostStatus = 'pending' | 'approved';

export interface PlatformPost {
  text: string;
  editedText: string | null;
  status: PostStatus;
  approvedAt: Date | null;
}

// Chat 受信時に Firestore に作成する最小レコード
export interface PendingMaterialRecord {
  materialId: string;
  receivedAt: string;
  sender: string;
  comment: string;
  photoCount: number;
  gcsImagePaths: string[];  // GCS に保存した画像のパス
}

// 生成完了後のフルレコード
export interface MaterialDocument {
  materialId: string;
  receivedAt: Date;
  sender: string;
  comment: string;
  photoCount: number;
  gcsImagePaths: string[];          // 素材画像の GCS パス
  generationStatus: GenerationStatus;
  generatedAt: Date | null;
  detectedBranch: string;
  hasFacePermission: boolean;
  videoGcsPath: string | null;      // 生成動画の GCS パス
  facebook: PlatformPost;
  instagram: PlatformPost;
  tiktok: PlatformPost;
  x: PlatformPost;
}

// ─────────────────────────────────────────
// Chat 受信時：素材レコードを作成（生成待ち）
// ─────────────────────────────────────────

export async function createMaterialRecord(record: PendingMaterialRecord): Promise<void> {
  await db.collection(COLLECTION).doc(record.materialId).set({
    materialId: record.materialId,
    receivedAt: Timestamp.fromDate(new Date(record.receivedAt)),
    sender: record.sender,
    comment: record.comment,
    photoCount: record.photoCount,
    gcsImagePaths: record.gcsImagePaths,
    generationStatus: 'pending' as GenerationStatus,
    generatedAt: null,
    detectedBranch: '',
    hasFacePermission: false,
    videoGcsPath: null,
    facebook:  { text: '', editedText: null, status: 'pending', approvedAt: null },
    instagram: { text: '', editedText: null, status: 'pending', approvedAt: null },
    tiktok:    { text: '', editedText: null, status: 'pending', approvedAt: null },
    x:         { text: '', editedText: null, status: 'pending', approvedAt: null },
  });

  logger.info('素材レコードを作成しました（生成待ち）', { materialId: record.materialId });
}

// ─────────────────────────────────────────
// Scheduler：生成待ち素材を一覧取得
// ─────────────────────────────────────────

export async function listPendingMaterials(): Promise<PendingMaterialRecord[]> {
  const snapshot = await db.collection(COLLECTION)
    .where('generationStatus', '==', 'pending')
    .orderBy('receivedAt', 'asc')
    .get();

  const results = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      materialId: data.materialId as string,
      receivedAt: (data.receivedAt instanceof Timestamp
        ? data.receivedAt.toDate()
        : new Date(data.receivedAt)
      ).toISOString(),
      sender: data.sender as string,
      comment: data.comment as string,
      photoCount: data.photoCount as number,
      gcsImagePaths: (data.gcsImagePaths as string[]) || [],
    };
  });

  logger.info('生成待ち素材を取得しました', { count: results.length });
  return results;
}

// ─────────────────────────────────────────
// Scheduler：生成結果でレコードを更新
// ─────────────────────────────────────────

export async function updateWithGeneratedContent(
  materialId: string,
  generated: SnsGenerationOutput,
  videoGcsPath: string | null
): Promise<void> {
  await db.collection(COLLECTION).doc(materialId).update({
    generationStatus: 'generated' as GenerationStatus,
    generatedAt: Timestamp.now(),
    detectedBranch: generated.detectedBranch,
    hasFacePermission: generated.hasFacePermission,
    videoGcsPath,
    'facebook.text':  generated.facebook,
    'instagram.text': generated.instagram,
    'tiktok.text':    generated.tiktok,
    'x.text':         generated.x,
  });

  logger.info('生成結果を保存しました', { materialId });
}

// ─────────────────────────────────────────
// Scheduler：生成失敗をマーク
// ─────────────────────────────────────────

export async function markGenerationFailed(materialId: string): Promise<void> {
  await db.collection(COLLECTION).doc(materialId).update({
    generationStatus: 'failed' as GenerationStatus,
  });
}

// ─────────────────────────────────────────
// Web アプリ：全素材を取得（新しい順）
// ─────────────────────────────────────────

export async function getAllMaterials(): Promise<MaterialDocument[]> {
  const snapshot = await db.collection(COLLECTION)
    .orderBy('receivedAt', 'desc')
    .limit(100)
    .get();

  return snapshot.docs.map(doc => convertTimestamps(doc.data()) as unknown as MaterialDocument);
}

// ─────────────────────────────────────────
// リマインダー：3日以上未承認の件数
// ─────────────────────────────────────────

export async function countPendingMaterials(): Promise<number> {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const snapshot = await db.collection(COLLECTION)
    .where('generationStatus', '==', 'generated')
    .where('receivedAt', '<', Timestamp.fromDate(threeDaysAgo))
    .get();

  let count = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (
      data.facebook?.status === 'pending' &&
      data.instagram?.status === 'pending' &&
      data.tiktok?.status === 'pending' &&
      data.x?.status === 'pending'
    ) {
      count++;
    }
  }
  return count;
}

// ─────────────────────────────────────────
// Web アプリ：承認・編集
// ─────────────────────────────────────────

export type Platform = 'facebook' | 'instagram' | 'tiktok' | 'x';

export async function approvePlatform(materialId: string, platform: Platform): Promise<void> {
  await db.collection(COLLECTION).doc(materialId).update({
    [`${platform}.status`]: 'approved',
    [`${platform}.approvedAt`]: Timestamp.now(),
  });
  logger.info('承認しました', { materialId, platform });
}

export async function editPostText(
  materialId: string,
  platform: Platform,
  newText: string
): Promise<void> {
  await db.collection(COLLECTION).doc(materialId).update({
    [`${platform}.editedText`]: newText,
  });
  logger.info('投稿文を編集しました', { materialId, platform });
}

export async function updateBranch(materialId: string, branch: string): Promise<void> {
  await db.collection(COLLECTION).doc(materialId).update({
    detectedBranch: branch,
  });
  logger.info('拠点名を更新しました', { materialId, branch });
}

// ─────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────

function convertTimestamps(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Timestamp) {
      result[key] = value.toDate();
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = convertTimestamps(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}
