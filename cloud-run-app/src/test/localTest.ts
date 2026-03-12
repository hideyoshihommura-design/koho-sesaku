/**
 * ローカルテストスクリプト
 * GCP・外部APIなしで各モジュールの動作を確認できます
 *
 * 実行方法:
 *   npx ts-node src/test/localTest.ts
 */

import { buildArticlePrompt, parseGeneratedArticle } from '../prompts/articlePrompt';
import { buildSNSPrompt, parseGeneratedSNSPosts } from '../prompts/snsPrompt';
import { logger } from '../utils/logger';
import { withRetry } from '../utils/retry';

// ─────────────────────────────────
// テスト用カラー出力
// ─────────────────────────────────
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function ok(name: string) {
  console.log(`${GREEN}✅ PASS${RESET}: ${name}`);
  passed++;
}

function fail(name: string, error: unknown) {
  console.log(`${RED}❌ FAIL${RESET}: ${name}`);
  console.log(`       ${String(error)}`);
  failed++;
}

function section(title: string) {
  console.log(`\n${YELLOW}━━━ ${title} ━━━${RESET}`);
}

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
  if (prompt.includes('介護業界') && prompt.includes('田中看護師')) {
    ok('フローA: 記事生成プロンプトの構築');
  } else {
    fail('フローA: 記事生成プロンプトの構築', '期待するキーワードが含まれていない');
  }
} catch (e) { fail('フローA: 記事生成プロンプトの構築', e); }

try {
  const prompt = buildSNSPrompt({
    title: '田中看護師のご紹介',
    content: '10年のキャリアを持つ田中看護師が入職しました。',
    url: 'https://example.com/posts/tanaka',
  });
  if (prompt.includes('田中看護師') && prompt.includes('https://example.com')) {
    ok('フローB: SNS投稿文最適化プロンプトの構築');
  } else {
    fail('フローB: SNS投稿文最適化プロンプトの構築', '期待するキーワードが含まれていない');
  }
} catch (e) { fail('フローB: SNS投稿文最適化プロンプトの構築', e); }

// ─────────────────────────────────
// 2. JSONパーステスト（Claudeのレスポンスを想定）
// ─────────────────────────────────
section('JSONパーステスト');

const sampleArticleJson = `
以下がご要望のJSON形式の出力です：

{
  "title": "【スタッフ紹介】10年のキャリアを持つ田中看護師が入職",
  "content": "## 田中看護師のプロフィール\\n介護の現場で10年...",
  "metaDescription": "田中看護師のプロフィールと介護への想いをご紹介します。",
  "facebookPost": "新しいスタッフをご紹介します！田中看護師が仲間に加わりました。",
  "instagramPost": "田中看護師がチームに加わりました✨\\n\\n#介護 #看護師 #スタッフ紹介",
  "tiktokCaption": "新スタッフ紹介🎉\\n\\n#介護施設 #スタッフ",
  "lifullPost": "田中看護師（経験10年）が入職しました。丁寧なケアをお約束します。"
}
`;

try {
  const article = parseGeneratedArticle(sampleArticleJson);
  if (article.title && article.facebookPost && article.tiktokCaption) {
    ok('フローA: 記事JSONのパース');
  } else {
    fail('フローA: 記事JSONのパース', '必須フィールドが欠けている');
  }
} catch (e) { fail('フローA: 記事JSONのパース', e); }

const sampleSNSJson = `
{
  "facebookPost": "新しいスタッフをご紹介します！ https://example.com/posts/tanaka",
  "instagramPost": "田中看護師がチームに加わりました\\n\\n#介護 #看護師",
  "tiktokCaption": "新スタッフ紹介🎉\\n\\n#介護施設",
  "lifullPost": "田中看護師（経験10年）が入職しました。"
}
`;

try {
  const posts = parseGeneratedSNSPosts(sampleSNSJson);
  if (posts.facebookPost && posts.instagramPost && posts.tiktokCaption && posts.lifullPost) {
    ok('フローB: SNS投稿文JSONのパース');
  } else {
    fail('フローB: SNS投稿文JSONのパース', '必須フィールドが欠けている');
  }
} catch (e) { fail('フローB: SNS投稿文JSONのパース', e); }

// ─────────────────────────────────
// 3. リトライユーティリティテスト
// ─────────────────────────────────
section('リトライユーティリティテスト');

(async () => {
  // 成功ケース
  try {
    const result = await withRetry(async () => 'success', 'テスト成功操作');
    if (result === 'success') ok('リトライ: 成功時はそのまま返す');
    else fail('リトライ: 成功時はそのまま返す', '結果が一致しない');
  } catch (e) { fail('リトライ: 成功時はそのまま返す', e); }

  // 失敗後成功ケース
  try {
    let attempt = 0;
    const result = await withRetry(async () => {
      attempt++;
      if (attempt < 3) throw new Error('一時的なエラー');
      return 'recovered';
    }, 'テスト失敗→成功', { maxAttempts: 3, initialDelayMs: 10 });
    if (result === 'recovered') ok('リトライ: 3回目に成功');
    else fail('リトライ: 3回目に成功', '結果が一致しない');
  } catch (e) { fail('リトライ: 3回目に成功', e); }

  // 全失敗ケース
  try {
    await withRetry(async () => { throw new Error('永続エラー'); }, 'テスト全失敗', {
      maxAttempts: 2,
      initialDelayMs: 10,
    });
    fail('リトライ: 全失敗時は例外を投げる', '例外が投げられなかった');
  } catch {
    ok('リトライ: 全失敗時は例外を投げる');
  }

  // ─────────────────────────────────
  // 4. ロガーテスト
  // ─────────────────────────────────
  section('ロガーテスト');

  try {
    const output: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => output.push(msg);
    logger.info('テストメッセージ', { flow: 'A', testKey: 'testValue' });
    console.log = origLog;

    const parsed = JSON.parse(output[0]);
    if (parsed.severity === 'INFO' && parsed.message === 'テストメッセージ' && parsed.flow === 'A') {
      ok('ロガー: 構造化JSONを出力');
    } else {
      fail('ロガー: 構造化JSONを出力', `出力: ${output[0]}`);
    }
  } catch (e) { fail('ロガー: 構造化JSONを出力', e); }

  // ─────────────────────────────────
  // 結果サマリー
  // ─────────────────────────────────
  console.log(`\n${'━'.repeat(40)}`);
  console.log(`結果: ${GREEN}${passed} PASS${RESET} / ${failed > 0 ? RED : ''}${failed} FAIL${RESET}`);
  console.log('━'.repeat(40));

  if (failed > 0) process.exit(1);
})();
