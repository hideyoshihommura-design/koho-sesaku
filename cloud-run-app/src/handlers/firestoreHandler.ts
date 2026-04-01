// Firestore を使ったデータ管理
// 生成した SNS 投稿文の保存・取得・承認処理

import { Firestore, Timestamp } from '@google-cloud/firestore';
import { logger } from '../utils/logger';
import { MaterialMetadata } from './driveHandler';
import { SnsGenerationOutput } from '../prompts/snsPrompt';

const db = new Firestore();
const COLLECTION = 'materials';

export type PostStatus = 'pending' | 'approved';

export interface PlatformPost {
  text: string;           // 生成された投稿文
  editedText: string | null;  // コーディネーターが編集した文（nullは未編集）
  status: PostStatus;
  approvedAt: Date | null;
}

export interface MaterialDocument {
  materialId: string;
  receivedAt: Date;
  sender: string;
  comment: string;
  detectedBranch: string;
  hasFacePermission: boolean;
  photoCount: number;
  driveImageFileIds: string[];
  generatedAt: Date;
  facebook: PlatformPost;
  instagram: PlatformPost;
  tiktok: PlatformPost;
  x: PlatformPost;
}

// 生成結果を Firestore に保存
export async function saveMaterial(
  metadata: MaterialMetadata,
  generated: SnsGenerationOutput
): Promise<void> {
  const now = new Date();

  const doc: MaterialDocument = {
    materialId: metadata.materialId,
    receivedAt: new Date(metadata.receivedAt),
    sender: metadata.sender,
    comment: metadata.comment || '',
    detectedBranch: generated.detectedBranch,
    hasFacePermission: generated.hasFacePermission,
    photoCount: metadata.photoCount,
    driveImageFileIds: metadata.driveImageFileIds || [],
    generatedAt: now,
    facebook:  { text: generated.facebook,  editedText: null, status: 'pending', approvedAt: null },
    instagram: { text: generated.instagram, editedText: null, status: 'pending', approvedAt: null },
    tiktok:    { text: generated.tiktok,    editedText: null, status: 'pending', approvedAt: null },
    x:         { text: generated.x,         editedText: null, status: 'pending', approvedAt: null },
  };

  await db.collection(COLLECTION).doc(metadata.materialId).set(doc);

  logger.info('Firestore に保存しました', {
    materialId: metadata.materialId,
    branch: generated.detectedBranch,
  });
}

// 全件取得（新しい順）
export async function getAllMaterials(): Promise<MaterialDocument[]> {
  const snapshot = await db.collection(COLLECTION)
    .orderBy('receivedAt', 'desc')
    .limit(100)
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return convertTimestamps(data) as unknown as MaterialDocument;
  });
}

// 3日以上未承認の件数を取得（リマインダー用）
export async function countPendingMaterials(): Promise<number> {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const snapshot = await db.collection(COLLECTION)
    .where('receivedAt', '<', Timestamp.fromDate(threeDaysAgo))
    .get();

  let count = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    // 全プラットフォームが pending のものをカウント
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

export type Platform = 'facebook' | 'instagram' | 'tiktok' | 'x';

// 承認処理
export async function approvePlatform(
  materialId: string,
  platform: Platform
): Promise<void> {
  await db.collection(COLLECTION).doc(materialId).update({
    [`${platform}.status`]: 'approved',
    [`${platform}.approvedAt`]: Timestamp.now(),
  });

  logger.info('承認しました', { materialId, platform });
}

// 投稿文編集
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

// Firestore の Timestamp を Date に変換
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
