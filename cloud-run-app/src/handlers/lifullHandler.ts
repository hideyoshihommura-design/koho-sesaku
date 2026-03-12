import axios from 'axios';
import { chromium } from 'playwright';
import { logger } from '../utils/logger';
import { getSecret, SECRET_NAMES } from '../utils/secretManager';

const LIFULL_API_BASE = process.env.LIFULL_API_BASE_URL; // APIが提供された場合
const LIFULL_LOGIN_URL = 'https://kaigo.homes.co.jp/partner/login'; // パートナー管理画面

// LIFULL介護へ投稿（方針A: REST API / 方針B: Playwright）
export async function post(content: string, articleUrl?: string): Promise<void> {
  if (LIFULL_API_BASE) {
    await postViaAPI(content, articleUrl);
  } else {
    await postViaPlaywright(content, articleUrl);
  }
}

// 方針A: LIFULL介護 パートナーAPI経由で投稿
async function postViaAPI(content: string, articleUrl?: string): Promise<void> {
  logger.info('LIFULL介護: API経由で投稿開始', { flow: 'B', platform: 'LIFULL' });

  const email = await getSecret(SECRET_NAMES.LIFULL_LOGIN_EMAIL);
  const password = await getSecret(SECRET_NAMES.LIFULL_LOGIN_PASSWORD);

  // APIトークン取得
  const authResponse = await axios.post(`${LIFULL_API_BASE}/auth/token`, {
    email,
    password,
  });
  const apiToken = authResponse.data.token;

  // 記事投稿
  await axios.post(
    `${LIFULL_API_BASE}/posts`,
    {
      content,
      external_url: articleUrl,
      published_at: new Date().toISOString(),
    },
    { headers: { Authorization: `Bearer ${apiToken}` } }
  );

  logger.info('LIFULL介護: API投稿完了', { platform: 'LIFULL' });
}

// 方針B: Playwright でブラウザ自動操作して投稿
async function postViaPlaywright(content: string, articleUrl?: string): Promise<void> {
  logger.info('LIFULL介護: Playwright経由で投稿開始', { flow: 'B', platform: 'LIFULL' });

  const email = await getSecret(SECRET_NAMES.LIFULL_LOGIN_EMAIL);
  const password = await getSecret(SECRET_NAMES.LIFULL_LOGIN_PASSWORD);

  // Cloud Run 上では --no-sandbox が必要
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  try {
    // ログイン
    await page.goto(LIFULL_LOGIN_URL, { timeout: 30000 });
    await page.fill('input[type="email"], input[name="email"]', email);
    await page.fill('input[type="password"], input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ timeout: 15000 });

    // 投稿フォームへ移動
    await page.goto(`${LIFULL_LOGIN_URL.replace('/login', '')}/posts/new`, { timeout: 15000 });

    // 投稿文を入力
    const textareaSelector = 'textarea[name="content"], textarea#content, textarea.content';
    await page.waitForSelector(textareaSelector, { timeout: 10000 });
    await page.fill(textareaSelector, content);

    // 外部URLがある場合は入力
    if (articleUrl) {
      const urlSelector = 'input[name="external_url"], input[name="url"]';
      const urlInput = await page.$(urlSelector);
      if (urlInput) await page.fill(urlSelector, articleUrl);
    }

    // 投稿ボタンをクリック
    await page.click('button[type="submit"], input[type="submit"]');
    await page.waitForNavigation({ timeout: 15000 });

    logger.info('LIFULL介護: Playwright投稿完了', { platform: 'LIFULL' });

  } catch (error) {
    const screenshotPath = `/tmp/lifull-error-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath });
    logger.error('LIFULL介護: Playwright投稿失敗', {
      platform: 'LIFULL',
      error: String(error),
      screenshot: screenshotPath,
    });
    throw error;

  } finally {
    await browser.close();
  }
}
