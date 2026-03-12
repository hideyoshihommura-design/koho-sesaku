import axios from 'axios';
import { chromium } from 'playwright';
import { logger } from '../utils/logger';
import { getSecret, SECRET_NAMES } from '../utils/secretManager';
import { notify } from '../utils/notify';

// LIFULL介護パートナー管理画面のURL（実際のURLに要確認）
const LIFULL_LOGIN_URL = process.env.LIFULL_LOGIN_URL
  || 'https://kaigo.homes.co.jp/partner/login';
const LIFULL_POST_URL = process.env.LIFULL_POST_URL
  || 'https://kaigo.homes.co.jp/partner/posts/new';

export interface LifullPostContent {
  text: string;
  articleUrl?: string;
}

/**
 * LIFULL介護への投稿
 * ① Playwright で完全自動投稿を試みる
 * ② 失敗したら Slack/メールで投稿文を送り担当者がコピペ（フォールバック）
 */
export async function post(content: string, articleUrl?: string): Promise<void> {
  logger.info('LIFULL介護: 投稿開始', { flow: 'B', platform: 'LIFULL' });

  try {
    await postViaPlaywright(content, articleUrl);
    logger.info('LIFULL介護: Playwright自動投稿完了', { platform: 'LIFULL' });
  } catch (error) {
    logger.warn('LIFULL介護: Playwright失敗。コピペ補助モードに切り替えます', {
      platform: 'LIFULL',
      error: String(error),
    });
    // 自動投稿が失敗しても処理を止めずに通知モードへ
    await notifyForManualPost(content, articleUrl, String(error));
  }
}

// ─────────────────────────────────
// ① Playwright 完全自動投稿
// ─────────────────────────────────
async function postViaPlaywright(content: string, articleUrl?: string): Promise<void> {
  const email = await getSecret(SECRET_NAMES.LIFULL_LOGIN_EMAIL);
  const password = await getSecret(SECRET_NAMES.LIFULL_LOGIN_PASSWORD);

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  try {
    // ログイン
    await page.goto(LIFULL_LOGIN_URL, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    // メールアドレス入力（セレクターは実機で要確認）
    await page.fill('input[type="email"], input[name="email"], input[name="login_id"]', email);
    await page.fill('input[type="password"], input[name="password"]', password);
    await page.click('button[type="submit"], input[type="submit"]');
    await page.waitForNavigation({ timeout: 15000 });

    // ログイン成功チェック（エラーメッセージが出ていたら例外）
    const errorMsg = await page.$('.error, .alert-danger, [class*="error"]');
    if (errorMsg) {
      const msgText = await errorMsg.textContent();
      throw new Error(`ログイン失敗: ${msgText}`);
    }

    // 投稿ページへ移動
    await page.goto(LIFULL_POST_URL, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // 投稿テキスト入力
    const textareaSelectors = [
      'textarea[name="content"]',
      'textarea[name="body"]',
      'textarea[name="message"]',
      'textarea.content',
      'textarea',
    ];

    let textareaFound = false;
    for (const selector of textareaSelectors) {
      const el = await page.$(selector);
      if (el) {
        await page.fill(selector, content);
        textareaFound = true;
        break;
      }
    }

    if (!textareaFound) {
      throw new Error('投稿テキストエリアが見つかりません（セレクターの調整が必要です）');
    }

    // 外部URL入力（フィールドがある場合のみ）
    if (articleUrl) {
      const urlSelectors = ['input[name="url"]', 'input[name="external_url"]', 'input[name="link"]'];
      for (const selector of urlSelectors) {
        const el = await page.$(selector);
        if (el) {
          await page.fill(selector, articleUrl);
          break;
        }
      }
    }

    // 投稿ボタンをクリック
    await page.click('button[type="submit"], input[type="submit"]');
    await page.waitForNavigation({ timeout: 15000 });

    // 投稿成功チェック
    const postError = await page.$('.error, .alert-danger, [class*="error"]');
    if (postError) {
      const msgText = await postError.textContent();
      throw new Error(`投稿失敗: ${msgText}`);
    }

  } finally {
    // エラー時はスクリーンショットをCloud Storageに保存
    try {
      const screenshotPath = `/tmp/lifull-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      logger.info('LIFULL介護: スクリーンショット保存', { path: screenshotPath });
    } catch { /* スクリーンショット失敗は無視 */ }

    await browser.close();
  }
}

// ─────────────────────────────────
// ② コピペ補助モード（Playwright失敗時のフォールバック）
//    投稿文をSlack/メールに送り、担当者がコピペして投稿
// ─────────────────────────────────
async function notifyForManualPost(
  content: string,
  articleUrl: string | undefined,
  reason: string
): Promise<void> {
  const urlLine = articleUrl ? `\nURL: ${articleUrl}` : '';

  await notify({
    level: 'warning',
    title: '【要対応】LIFULL介護への投稿を手動で行ってください',
    body: `自動投稿が失敗しました（${reason}）\n\n` +
      `以下の文章をLIFULL介護パートナー管理画面にコピペして投稿してください。\n` +
      `投稿画面: ${LIFULL_POST_URL}\n` +
      `${'─'.repeat(40)}\n` +
      `${content}${urlLine}\n` +
      `${'─'.repeat(40)}`,
    flow: 'B',
  });

  logger.info('LIFULL介護: コピペ補助通知を送信しました', { platform: 'LIFULL' });
}

// ─────────────────────────────────
// Playwrightのセレクターを確認するためのデバッグ用関数
// ローカル開発時に実行: npx ts-node -e "require('./src/handlers/lifullHandler').debugSelectors()"
// ─────────────────────────────────
export async function debugSelectors(): Promise<void> {
  const email = await getSecret(SECRET_NAMES.LIFULL_LOGIN_EMAIL);
  const password = await getSecret(SECRET_NAMES.LIFULL_LOGIN_PASSWORD);

  const browser = await chromium.launch({ headless: false }); // 画面を表示
  const page = await browser.newPage();

  await page.goto(LIFULL_LOGIN_URL);
  console.log('\n=== ログインページのinput要素 ===');
  const inputs = await page.$$eval('input', els =>
    els.map(el => ({ type: el.type, name: el.name, id: el.id, placeholder: el.placeholder }))
  );
  console.log(JSON.stringify(inputs, null, 2));

  await page.fill('input[type="email"], input[name="email"], input[name="login_id"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"], input[type="submit"]');
  await page.waitForNavigation();

  await page.goto(LIFULL_POST_URL);
  console.log('\n=== 投稿ページのtextarea要素 ===');
  const textareas = await page.$$eval('textarea', els =>
    els.map(el => ({ name: el.name, id: el.id, className: el.className }))
  );
  console.log(JSON.stringify(textareas, null, 2));

  console.log('\n=== 投稿ページのinput要素 ===');
  const postInputs = await page.$$eval('input', els =>
    els.map(el => ({ type: el.type, name: el.name, id: el.id, placeholder: el.placeholder }))
  );
  console.log(JSON.stringify(postInputs, null, 2));

  console.log('\nブラウザを確認してください。Enterで終了...');
  await new Promise(resolve => process.stdin.once('data', resolve));
  await browser.close();
}
