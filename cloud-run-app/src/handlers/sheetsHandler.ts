// Google Sheets 操作ハンドラ
// 生成した SNS 投稿文をスプレッドシートに書き込む

import { google } from 'googleapis';
import { logger } from '../utils/logger';
import { getSecret, SECRET_NAMES } from '../utils/secretManager';
import { MaterialMetadata } from './driveHandler';
import { SnsGenerationOutput } from '../prompts/snsPrompt';

// スプレッドシートのシート名
const SHEET_NAME = '投稿管理';

// ヘッダー行の定義
const HEADERS = [
  '番号',
  '受信日時',
  '拠点',
  '素材ID',
  '送信者',
  '顔出し記載',
  '写真枚数',
  'コメント（原文）',
  'Facebook投稿文',
  'Instagram投稿文',
  'TikTok投稿文',
  'X投稿文',
  'Facebook承認',
  'Instagram承認',
  'TikTok承認',
  'X承認',
  '投稿日時(FB)',
  '投稿日時(IG)',
  '投稿日時(TikTok)',
  '投稿日時(X)',
  '備考',
];

async function getSheetsClient() {
  const saJson = await getSecret(SECRET_NAMES.GOOGLE_SERVICE_ACCOUNT);
  const credentials = JSON.parse(saJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

// ヘッダー行がなければ追加
async function ensureHeaders(sheetsId: string): Promise<void> {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetsId,
    range: `${SHEET_NAME}!A1:A1`,
  });

  if (!res.data.values || res.data.values.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetsId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
    logger.info('ヘッダー行を作成しました');
  }
}

// 次の行番号（A列の最終行 + 1）を取得
export async function getNextRowNumber(sheetsId: string): Promise<number> {
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetsId,
    range: `${SHEET_NAME}!A:A`,
  });

  const rows = res.data.values || [];
  // ヘッダー行を除いた件数 + 1
  return Math.max(rows.length, 1);
}

// 生成結果を1行スプレッドシートに追記
export async function appendToSheets(
  metadata: MaterialMetadata,
  generated: SnsGenerationOutput,
  rowNumber: number
): Promise<void> {
  const sheetsId = await getSecret(SECRET_NAMES.SHEETS_ID);
  const sheets = await getSheetsClient();

  await ensureHeaders(sheetsId);

  const receivedAt = new Date(metadata.receivedAt).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const row = [
    rowNumber,                                              // 番号
    receivedAt,                                            // 受信日時
    generated.detectedBranch,                              // 拠点
    metadata.materialId,                                   // 素材ID
    metadata.sender,                                       // 送信者
    generated.hasFacePermission ? '顔出しOK記載あり' : '', // 顔出し記載
    metadata.photoCount,                                   // 写真枚数
    metadata.comment || '',                                // コメント（原文）
    generated.facebook,                                    // Facebook投稿文
    generated.instagram,                                   // Instagram投稿文
    generated.tiktok,                                      // TikTok投稿文
    generated.x,                                           // X投稿文
    '',  // Facebook承認（コーディネーターが記入）
    '',  // Instagram承認
    '',  // TikTok承認
    '',  // X承認
    '',  // 投稿日時(FB)
    '',  // 投稿日時(IG)
    '',  // 投稿日時(TikTok)
    '',  // 投稿日時(X)
    '',  // 備考
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetsId,
    range: `${SHEET_NAME}!A:U`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });

  logger.info('スプレッドシートに追記しました', {
    materialId: metadata.materialId,
    rowNumber,
    branch: generated.detectedBranch,
  });
}

// 3日以上未承認の件数を返す（リマインダー用）
export async function countPendingRows(): Promise<number> {
  const sheetsId = await getSecret(SECRET_NAMES.SHEETS_ID);
  const sheets = await getSheetsClient();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetsId,
    range: `${SHEET_NAME}!A:U`,
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) return 0;  // ヘッダーのみ

  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  let pendingCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const receivedAtStr = row[1] as string | undefined;
    const fbApproval = row[12] as string | undefined;
    const igApproval = row[13] as string | undefined;
    const ttApproval = row[14] as string | undefined;
    const xApproval = row[15] as string | undefined;

    // 全プラットフォームの承認が空
    const allEmpty = !fbApproval && !igApproval && !ttApproval && !xApproval;

    if (allEmpty && receivedAtStr) {
      try {
        const receivedAt = new Date(receivedAtStr);
        if (receivedAt < threeDaysAgo) {
          pendingCount++;
        }
      } catch {
        // 日付パース失敗は無視
      }
    }
  }

  return pendingCount;
}
