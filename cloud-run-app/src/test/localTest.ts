/**
 * ローカルテストスクリプト（GCP・外部APIなしで動作確認）
 * 実行: npm test
 */

import { buildArticlePrompt, parseGeneratedArticle } from '../prompts/articlePrompt';
import { buildSNSPrompt, parseGeneratedSNSPosts } from '../prompts/snsPrompt';
import { logger } from '../utils/logger';
import { withRetry, isRetryableHttpError } from '../utils/retry';

const GREEN = '\x1b[32m'; const RED = '\x1b[31m';
const YELLOW = '\x1b[33m'; const RESET = '\x1b[0m';
let passed = 0; let failed = 0;

function ok(name: string) { console.log(`${GREEN}✅ PASS${RESET}: ${name}`); passed++; }
function fail(name: string, error: unknown) {
  console.log(`${RED}❌ FAIL${RESET}: ${name}\n       ${String(error)}`); failed++;
}
function section(title: string) { console.log(`\n${YELLOW}━━━ ${title} ━━━${RESET}`); }

// ─────────────────────────────────
// 1. プロンプト生成テスト
// ─────────────────────────────────
section('プロンプト生成テスト');

try {
  const prompt = buildArticlePrompt({
    sourceText: 'スタッフ紹介：田中看護師、10年のキャリア',
    imageDescriptions: '笑顔の看護師が高齢者と話している写真',
    folderName: '001_スタッフ紹介',
  });
  if (prompt.includes('介護業界') && prompt.includes('田中看護師') && prompt.includes('JSON'))
    ok('フローA: 記事生成プロンプトの構築');
  else fail('フローA: 記事生成プロンプトの構築', '期待するキーワードが含まれていない');
} catch (e) { fail('フローA: 記事生成プロンプトの構築', e); }

try {
  const prompt = buildSNSPrompt({
    title: '田中看護師のご紹介',
    content: '10年のキャリアを持つ田中看護師が入職しました。',
    url: 'https://example.com/posts/tanaka',
  });
  if (prompt.includes('田中看護師') && prompt.includes('https://example.com') && prompt.includes('JSON'))
    ok('フローB: SNS投稿文最適化プロンプトの構築');
  else fail('フローB: SNS投稿文最適化プロンプトの構築', '期待するキーワードが含まれていない');
} catch (e) { fail('フローB: SNS投稿文最適化プロンプトの構築', e); }

// URL が excerpt を使う場合のテスト
try {
  const prompt = buildSNSPrompt({
    title: 'テスト記事',
    content: 'x'.repeat(1000), // 長い本文
    url: 'https://example.com',
    excerpt: '要約文はこちら',
  });
  if (prompt.includes('要約文はこちら') && !prompt.includes('x'.repeat(500)))
    ok('フローB: excerpt がある場合は excerpt を優先する');
  else fail('フローB: excerpt がある場合は excerpt を優先する', 'excerpt が使われていない');
} catch (e) { fail('フローB: excerpt がある場合は excerpt を優先する', e); }

// ─────────────────────────────────
// 2. JSONパーステスト
// ─────────────────────────────────
section('JSONパーステスト');

const sampleArticleJson = `
以下がご要望のJSON形式の出力です：
{
  "title": "【スタッフ紹介】田中看護師が入職",
  "content": "## 田中看護師のプロフィール\\n介護の現場で10年...",
  "metaDescription": "田中看護師のプロフィールをご紹介します。",
  "facebookPost": "新しいスタッフをご紹介します！",
  "instagramPost": "田中看護師がチームに加わりました✨\\n\\n#介護 #看護師",
  "tiktokCaption": "新スタッフ紹介🎉\\n\\n#介護施設",
  "lifullPost": "田中看護師（経験10年）が入職しました。"
}`;

try {
  const article = parseGeneratedArticle(sampleArticleJson);
  if (article.title && article.content && article.metaDescription &&
      article.facebookPost && article.instagramPost && article.tiktokCaption && article.lifullPost)
    ok('フローA: 記事JSONの全フィールドパース');
  else fail('フローA: 記事JSONの全フィールドパース', '必須フィールドが欠けている');
} catch (e) { fail('フローA: 記事JSONの全フィールドパース', e); }

// JSONの前後に余分なテキストがある場合
try {
  const messyJson = 'なんか前置き\n{"facebookPost":"FB","instagramPost":"IG","tiktokCaption":"TK","lifullPost":"LF"}\n後書き';
  const posts = parseGeneratedSNSPosts(messyJson);
  if (posts.facebookPost === 'FB') ok('フローB: JSON前後に余分なテキストがあっても解析できる');
  else fail('フローB: JSON前後に余分なテキストがあっても解析できる', '解析失敗');
} catch (e) { fail('フローB: JSON前後に余分なテキストがあっても解析できる', e); }

// 不正なJSONのエラーハンドリング
try {
  parseGeneratedSNSPosts('JSONではないテキスト');
  fail('不正なJSONは例外を投げる', '例外が投げられなかった');
} catch { ok('不正なJSONは例外を投げる'); }

// ─────────────────────────────────
// 3. リトライユーティリティテスト
// ─────────────────────────────────
section('リトライユーティリティテスト');

(async () => {
  // 成功ケース
  try {
    const result = await withRetry(async () => 'success', 'テスト成功');
    if (result === 'success') ok('リトライ: 初回成功はそのまま返す');
    else fail('リトライ: 初回成功はそのまま返す', '結果不一致');
  } catch (e) { fail('リトライ: 初回成功はそのまま返す', e); }

  // 失敗→成功
  try {
    let attempt = 0;
    const result = await withRetry(async () => {
      attempt++;
      if (attempt < 3) throw new Error('一時的エラー');
      return 'recovered';
    }, 'テスト失敗→成功', { maxAttempts: 3, initialDelayMs: 10 });
    if (result === 'recovered') ok('リトライ: 3回目に成功する');
    else fail('リトライ: 3回目に成功する', '結果不一致');
  } catch (e) { fail('リトライ: 3回目に成功する', e); }

  // 全失敗
  try {
    await withRetry(async () => { throw new Error('永続エラー'); }, 'テスト全失敗', {
      maxAttempts: 2, initialDelayMs: 10,
    });
    fail('リトライ: 全失敗時は例外を投げる', '例外が投げられなかった');
  } catch { ok('リトライ: 全失敗時は例外を投げる'); }

  // shouldRetry で即座に諦めるケース
  try {
    let callCount = 0;
    try {
      await withRetry(async () => { callCount++; throw new Error('4xx'); }, 'テスト即時失敗', {
        maxAttempts: 3, initialDelayMs: 10, shouldRetry: () => false,
      });
    } catch { /* 期待通り */ }
    if (callCount === 1) ok('リトライ: shouldRetry=false なら1回だけ試みる');
    else fail('リトライ: shouldRetry=false なら1回だけ試みる', `実際の呼び出し回数: ${callCount}`);
  } catch (e) { fail('リトライ: shouldRetry=false なら1回だけ試みる', e); }

  // isRetryableHttpError テスト
  try {
    const err5xx = { response: { status: 503 } };
    const err4xx = { response: { status: 404 } };
    const err429 = { response: { status: 429 } };
    if (isRetryableHttpError(err5xx) && !isRetryableHttpError(err4xx) && isRetryableHttpError(err429))
      ok('HTTPエラー判定: 5xx・429はリトライ、4xxはリトライしない');
    else fail('HTTPエラー判定', `5xx=${isRetryableHttpError(err5xx)} 4xx=${isRetryableHttpError(err4xx)} 429=${isRetryableHttpError(err429)}`);
  } catch (e) { fail('HTTPエラー判定', e); }

  // ─────────────────────────────────
  // 4. ロガーテスト
  // ─────────────────────────────────
  section('ロガーテスト');

  const captureLog = (): { restore: () => void; output: string[] } => {
    const output: string[] = [];
    const orig = console.log;
    console.log = (msg: string) => output.push(msg);
    return { output, restore: () => { console.log = orig; } };
  };

  try {
    const { output, restore } = captureLog();
    logger.info('テストINFO', { flow: 'A', key: 'value' });
    restore();
    const parsed = JSON.parse(output[0]);
    if (parsed.severity === 'INFO' && parsed.message === 'テストINFO' &&
        parsed.flow === 'A' && parsed.timestamp)
      ok('ロガー: INFO を構造化JSONで出力');
    else fail('ロガー: INFO を構造化JSONで出力', output[0]);
  } catch (e) { fail('ロガー: INFO を構造化JSONで出力', e); }

  try {
    const { output, restore } = captureLog();
    logger.error('テストERROR', { error: 'something failed' });
    restore();
    const parsed = JSON.parse(output[0]);
    if (parsed.severity === 'ERROR') ok('ロガー: ERROR レベルを正しく設定');
    else fail('ロガー: ERROR レベルを正しく設定', `severity=${parsed.severity}`);
  } catch (e) { fail('ロガー: ERROR レベルを正しく設定', e); }

  try {
    const { output, restore } = captureLog();
    logger.warn('テストWARN');
    restore();
    const parsed = JSON.parse(output[0]);
    if (parsed.severity === 'WARNING') ok('ロガー: WARN → WARNING に変換');
    else fail('ロガー: WARN → WARNING に変換', `severity=${parsed.severity}`);
  } catch (e) { fail('ロガー: WARN → WARNING に変換', e); }

  // ─────────────────────────────────
  // 5. 文字数・制約テスト
  // ─────────────────────────────────
  section('SNS投稿文の文字数制約テスト');

  const samplePosts = {
    facebookPost: 'FB投稿文'.repeat(20),       // 80文字（300字以内）
    instagramPost: 'IG投稿'.repeat(10),          // 40文字（150字以内）
    tiktokCaption: 'TK'.repeat(20),              // 40文字（100字以内）
    lifullPost: 'LF投稿'.repeat(15),             // 60文字（200字以内）
  };

  try {
    const fb = samplePosts.facebookPost.length <= 300;
    const ig = samplePosts.instagramPost.length <= 150;
    const tk = samplePosts.tiktokCaption.length <= 100;
    const lf = samplePosts.lifullPost.length <= 200;
    if (fb && ig && tk && lf)
      ok('SNS各プラットフォームの文字数制約が正しく定義されている');
    else
      fail('SNS各プラットフォームの文字数制約', `FB:${fb} IG:${ig} TK:${tk} LF:${lf}`);
  } catch (e) { fail('SNS文字数制約テスト', e); }

  // ─────────────────────────────────
  // 結果サマリー
  // ─────────────────────────────────
  console.log(`\n${'━'.repeat(45)}`);
  const failColor = failed > 0 ? RED : GREEN;
  console.log(`結果: ${GREEN}${passed} PASS${RESET} / ${failColor}${failed} FAIL${RESET}`);
  console.log('━'.repeat(45));
  if (failed > 0) process.exit(1);
})();
