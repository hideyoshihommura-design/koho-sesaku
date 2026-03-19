import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT!;

// シークレット名の定義
export const SECRET_NAMES = {
  WORDPRESS_APP_PASSWORD: 'wordpress-app-password',
  HUBSPOT_ACCESS_TOKEN: 'hubspot-access-token',
  TIKTOK_ACCESS_TOKEN: 'tiktok-access-token',
  GOOGLE_DRIVE_SERVICE_ACCOUNT: 'google-drive-service-account',
  // 別フロー（LIFULL介護）用。フローBからは使用しない
  LIFULL_LOGIN_EMAIL: 'lifull-login-email',
  LIFULL_LOGIN_PASSWORD: 'lifull-login-password',
} as const;

// キャッシュ（Cloud Run インスタンスのライフタイム中はキャッシュする）
const cache = new Map<string, string>();

export async function getSecret(secretName: string): Promise<string> {
  if (cache.has(secretName)) {
    return cache.get(secretName)!;
  }

  const name = `projects/${PROJECT_ID}/secrets/${secretName}/versions/latest`;
  const [version] = await client.accessSecretVersion({ name });
  const payload = version.payload?.data?.toString();

  if (!payload) {
    throw new Error(`Secret ${secretName} が空です`);
  }

  cache.set(secretName, payload);
  return payload;
}

export async function getAllSecrets() {
  const [wordpressPassword, hubspotToken, tiktokToken] = await Promise.all([
    getSecret(SECRET_NAMES.WORDPRESS_APP_PASSWORD),
    getSecret(SECRET_NAMES.HUBSPOT_ACCESS_TOKEN),
    getSecret(SECRET_NAMES.TIKTOK_ACCESS_TOKEN),
  ]);

  return { wordpressPassword, hubspotToken, tiktokToken };
}
