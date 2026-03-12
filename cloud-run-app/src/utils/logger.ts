// Cloud Logging と互換性のある構造化ログ

type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

interface LogEntry {
  severity: LogLevel;
  message: string;
  flow?: 'A' | 'B';
  platform?: string;
  [key: string]: unknown;
}

function log(entry: LogEntry) {
  // Cloud Logging は stdout の JSON をパースする
  console.log(JSON.stringify({
    ...entry,
    timestamp: new Date().toISOString(),
  }));
}

export const logger = {
  debug: (message: string, extra?: Record<string, unknown>) =>
    log({ severity: 'DEBUG', message, ...extra }),

  info: (message: string, extra?: Record<string, unknown>) =>
    log({ severity: 'INFO', message, ...extra }),

  warn: (message: string, extra?: Record<string, unknown>) =>
    log({ severity: 'WARNING', message, ...extra }),

  error: (message: string, extra?: Record<string, unknown>) =>
    log({ severity: 'ERROR', message, ...extra }),
};
