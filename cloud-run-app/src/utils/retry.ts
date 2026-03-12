// 外部API呼び出し用 指数バックオフ付きリトライユーティリティ

import { logger } from './logger';

export interface RetryOptions {
  maxAttempts?: number;      // 最大試行回数（デフォルト: 3）
  initialDelayMs?: number;   // 初回待機時間ms（デフォルト: 1000）
  maxDelayMs?: number;       // 最大待機時間ms（デフォルト: 30000）
  shouldRetry?: (error: unknown) => boolean; // リトライするか判定（デフォルト: 全エラー）
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error)) {
        logger.error(`${operationName}: ${maxAttempts}回試行後も失敗`, {
          operation: operationName,
          attempt,
          error: String(error),
        });
        throw error;
      }

      // 指数バックオフ（ジッター付き）
      const delay = Math.min(
        initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000,
        maxDelayMs
      );

      logger.warn(`${operationName}: 試行 ${attempt}/${maxAttempts} 失敗。${Math.round(delay)}ms 後にリトライ`, {
        operation: operationName,
        attempt,
        nextDelayMs: Math.round(delay),
        error: String(error),
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// HTTPステータスコードでリトライ判定（5xx・429のみリトライ）
export function isRetryableHttpError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'response' in error) {
    const status = (error as { response: { status: number } }).response?.status;
    return status >= 500 || status === 429; // サーバーエラー or レート制限
  }
  return true; // ネットワークエラーはリトライ
}
