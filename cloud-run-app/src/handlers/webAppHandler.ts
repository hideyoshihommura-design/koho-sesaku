// Webアプリのルートハンドラ
// コーディネーターが生成結果を確認・承認・編集する画面

import { Router } from 'express';
import { Storage } from '@google-cloud/storage';
import { getAllMaterials, approvePlatform, approveAllPlatforms, editPostText, updateBranch, Platform } from './firestoreHandler';
import { getVideoSignedUrl } from './videoHandler';
import { logger } from '../utils/logger';

const storage = new Storage();

function getBucketName(): string {
  return `${process.env.GOOGLE_CLOUD_PROJECT}-sns-videos`;
}

// 既知の拠点名リスト（サジェスト用）
const KNOWN_BRANCHES = [
  'あおぞら博多',
  '七福の里',
  '下荒田',
  '東千石',
  '梅ヶ丘',
];

export function createWebAppRouter(appSecret: string): Router {
  const router = Router();

  // 秘密URLの検証ミドルウェア
  router.use((req, res, next) => {
    if (req.path.startsWith(`/${appSecret}`)) {
      next();
    } else {
      res.status(404).send('Not Found');
    }
  });

  // ─────────────────────────────────────────
  // ダッシュボード
  // ─────────────────────────────────────────
  router.get(`/${appSecret}`, async (_req, res) => {
    try {
      const materials = await getAllMaterials();
      res.send(renderDashboard(materials, appSecret));
    } catch (err) {
      logger.error('ダッシュボード表示エラー', { error: String(err) });
      res.status(500).send('エラーが発生しました');
    }
  });

  // ─────────────────────────────────────────
  // 画像プロキシ（GCS から取得してブラウザに返す）
  // ─────────────────────────────────────────
  router.get(`/${appSecret}/image`, async (req, res) => {
    const encoded = req.query.p as string;
    if (!encoded) { res.status(400).send('Bad Request'); return; }

    const gcsPath = Buffer.from(encoded, 'base64').toString('utf-8');

    try {
      const file = storage.bucket(getBucketName()).file(gcsPath);
      const [meta] = await file.getMetadata();
      res.setHeader('Content-Type', (meta.contentType as string) || 'image/jpeg');
      res.setHeader('Cache-Control', 'max-age=3600');
      file.createReadStream().pipe(res);
    } catch (err) {
      logger.warn('画像取得エラー', { gcsPath, error: String(err) });
      res.status(404).send('Not Found');
    }
  });

  // ─────────────────────────────────────────
  // 動画リダイレクト（GCS 署名付き URL にリダイレクト）
  // ─────────────────────────────────────────
  router.get(`/${appSecret}/video`, async (req, res) => {
    const encoded = req.query.p as string;
    if (!encoded) { res.status(400).send('Bad Request'); return; }

    const gcsPath = Buffer.from(encoded, 'base64').toString('utf-8');

    try {
      const signedUrl = await getVideoSignedUrl(gcsPath);
      res.redirect(302, signedUrl);
    } catch (err) {
      logger.warn('動画URL生成エラー', { gcsPath, error: String(err) });
      res.status(404).send('動画が見つかりません');
    }
  });

  // ─────────────────────────────────────────
  // 承認 API（個別）
  // ─────────────────────────────────────────
  router.post(`/${appSecret}/api/approve`, async (req, res) => {
    const { materialId, platform } = req.body as { materialId: string; platform: string };
    if (!materialId || !platform) {
      res.status(400).json({ error: 'materialId と platform が必要です' });
      return;
    }
    try {
      await approvePlatform(materialId, platform as Platform);
      res.json({ ok: true });
    } catch (err) {
      logger.error('承認エラー', { materialId, platform, error: String(err) });
      res.status(500).json({ error: String(err) });
    }
  });

  // ─────────────────────────────────────────
  // 承認 API（全プラットフォーム一括）
  // ─────────────────────────────────────────
  router.post(`/${appSecret}/api/approve-all`, async (req, res) => {
    const { materialId } = req.body as { materialId: string };
    if (!materialId) {
      res.status(400).json({ error: 'materialId が必要です' });
      return;
    }
    try {
      await approveAllPlatforms(materialId);
      res.json({ ok: true });
    } catch (err) {
      logger.error('一括承認エラー', { materialId, error: String(err) });
      res.status(500).json({ error: String(err) });
    }
  });

  // ─────────────────────────────────────────
  // 編集 API
  // ─────────────────────────────────────────
  router.post(`/${appSecret}/api/edit`, async (req, res) => {
    const { materialId, platform, text } = req.body as {
      materialId: string; platform: string; text: string;
    };
    if (!materialId || !platform || text === undefined) {
      res.status(400).json({ error: 'materialId, platform, text が必要です' });
      return;
    }
    try {
      await editPostText(materialId, platform as Platform, text);
      res.json({ ok: true });
    } catch (err) {
      logger.error('編集エラー', { materialId, platform, error: String(err) });
      res.status(500).json({ error: String(err) });
    }
  });

  // ─────────────────────────────────────────
  // 拠点名更新 API
  // ─────────────────────────────────────────
  router.post(`/${appSecret}/api/branch`, async (req, res) => {
    const { materialId, branch } = req.body as { materialId: string; branch: string };
    if (!materialId || branch === undefined) {
      res.status(400).json({ error: 'materialId と branch が必要です' });
      return;
    }
    try {
      await updateBranch(materialId, branch);
      res.json({ ok: true });
    } catch (err) {
      logger.error('拠点名更新エラー', { materialId, error: String(err) });
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}

// ─────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────

interface PlatformPost {
  text: string;
  editedText: string | null;
  status: string;
  approvedAt: Date | null;
}

interface Material {
  materialId: string;
  receivedAt: Date;
  sender: string;
  comment: string;
  detectedBranch: string;
  hasFacePermission: boolean;
  photoCount: number;
  gcsImagePaths: string[];
  videoGcsPath: string | null;
  generationStatus: string;
  generatedAt: Date | null;
  facebook:  PlatformPost;
  instagram: PlatformPost;
  tiktok:    PlatformPost;
  x:         PlatformPost;
}

const PLATFORM_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  facebook:  { label: 'Facebook',  color: '#1877F2', icon: 'F' },
  instagram: { label: 'Instagram', color: '#E1306C', icon: 'I' },
  tiktok:    { label: 'TikTok',    color: '#010101', icon: 'T' },
  x:         { label: 'X',         color: '#14171A', icon: 'X' },
};

function encodeGcsPath(gcsPath: string): string {
  return Buffer.from(gcsPath).toString('base64');
}

// ─────────────────────────────────────────
// ダッシュボード HTML
// ─────────────────────────────────────────
function renderDashboard(materials: Material[], appSecret: string): string {
  const generated = materials.filter(m => m.generationStatus === 'generated');
  const pendingList = materials.filter(m => m.generationStatus === 'pending');
  const failed = materials.filter(m => m.generationStatus === 'failed').length;

  const unapprovedCount = generated.filter(m =>
    (['facebook', 'instagram', 'tiktok', 'x'] as const).some(p => m[p]?.status === 'pending')
  ).length;

  const datalistOptions = KNOWN_BRANCHES.map(b => `<option value="${escapeHtml(b)}">`).join('');

  // 生成待ちカード
  const pendingCards = pendingList.map(m => {
    const receivedDate = new Date(m.receivedAt).toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    return `
    <div class="bg-white rounded-xl shadow p-5 border-l-4 border-yellow-400">
      <div class="flex items-center gap-3">
        <span class="text-yellow-500 text-xl animate-spin">⏳</span>
        <div>
          <p class="font-semibold text-gray-700">${escapeHtml(m.sender)} ・ 写真${m.photoCount}枚</p>
          <p class="text-xs text-gray-400">${receivedDate} ・ AI生成中...</p>
        </div>
      </div>
    </div>`;
  }).join('\n');

  const basePath = `/app/${appSecret}`;
  const cards = generated.map(m => renderCard(m, basePath)).join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SNS投稿 承認ダッシュボード</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    textarea { resize: vertical; }
    .status-pending  { background:#FEF3C7; color:#92400E; }
    .status-approved { background:#D1FAE5; color:#065F46; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .animate-spin { display:inline-block; animation: spin 2s linear infinite; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">

  <!-- 拠点名サジェスト用 datalist -->
  <datalist id="branch-list">
    ${datalistOptions}
  </datalist>

  <!-- ヘッダー -->
  <header class="bg-white shadow sticky top-0 z-10">
    <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
      <h1 class="text-lg font-bold text-gray-800">SNS投稿 承認ダッシュボード</h1>
      <div class="flex items-center gap-3 text-sm flex-wrap">
        <span class="text-gray-500">未承認: <span class="font-bold text-orange-500">${unapprovedCount}件</span></span>
        ${pendingList.length > 0 ? `<span class="text-yellow-500 font-medium">⏳ 生成中: ${pendingList.length}件</span>` : ''}
        ${failed > 0 ? `<span class="text-red-400">生成失敗: ${failed}件</span>` : ''}
        <button onclick="location.reload()" class="text-xs px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 border">🔄 更新</button>
      </div>
    </div>
  </header>

  <main class="max-w-5xl mx-auto px-4 py-6 space-y-6">
    ${pendingCards}
    ${generated.length === 0 && pendingList.length === 0
      ? '<p class="text-center text-gray-500 py-20">まだコンテンツはありません</p>'
      : cards
    }
  </main>

  <script>
    const BASE_PATH = '/app/${appSecret}';
    // ─── 個別承認 ───
    async function approve(materialId, platform, btn) {
      btn.disabled = true; btn.textContent = '処理中...';
      try {
        const res = await fetch(BASE_PATH + '/api/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ materialId, platform }),
        });
        if (res.ok) {
          markApproved(materialId, platform);
          checkAllApproved(materialId);
        } else {
          btn.disabled = false; btn.textContent = '承認'; alert('エラーが発生しました');
        }
      } catch { btn.disabled = false; btn.textContent = '承認'; alert('通信エラー'); }
    }

    // ─── 全プラットフォーム一括承認 ───
    async function approveAll(materialId, btn) {
      if (!confirm('すべてのSNSを一括承認しますか？')) return;
      btn.disabled = true; btn.textContent = '処理中...';
      try {
        const res = await fetch(BASE_PATH + '/api/approve-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ materialId }),
        });
        if (res.ok) {
          ['facebook','instagram','tiktok','x'].forEach(p => markApproved(materialId, p));
          btn.textContent = '✅ 全て承認済み';
          btn.classList.replace('bg-indigo-600','bg-green-600');
          btn.classList.remove('hover:bg-indigo-700');
        } else {
          btn.disabled = false; btn.textContent = '全て承認'; alert('エラーが発生しました');
        }
      } catch { btn.disabled = false; btn.textContent = '全て承認'; alert('通信エラー'); }
    }

    // 承認済みUIに切り替えるヘルパー
    function markApproved(materialId, platform) {
      const badge = document.getElementById('status-' + materialId + '-' + platform);
      if (badge) { badge.className = 'text-xs px-2 py-0.5 rounded-full status-approved'; badge.textContent = '✅ 承認済み'; }
      const btn = document.getElementById('approve-btn-' + materialId + '-' + platform);
      if (btn) {
        btn.disabled = true; btn.textContent = '承認済み';
        btn.className = 'text-xs px-3 py-1 rounded text-white bg-green-600 cursor-default';
      }
    }

    // 全プラットフォーム承認済みなら一括ボタンも更新
    function checkAllApproved(materialId) {
      const allDone = ['facebook','instagram','tiktok','x'].every(p => {
        const badge = document.getElementById('status-' + materialId + '-' + p);
        return badge && badge.textContent.includes('承認済み');
      });
      if (allDone) {
        const allBtn = document.getElementById('approve-all-btn-' + materialId);
        if (allBtn) { allBtn.disabled = true; allBtn.textContent = '✅ 全て承認済み'; allBtn.className = 'text-sm px-4 py-2 rounded text-white bg-green-600 cursor-default'; }
      }
    }

    // ─── 拠点名編集 ───
    function editBranch(materialId) {
      const el = document.getElementById('branch-edit-' + materialId);
      el.classList.remove('hidden'); el.classList.add('flex');
    }
    function cancelBranchEdit(materialId) {
      const el = document.getElementById('branch-edit-' + materialId);
      el.classList.add('hidden'); el.classList.remove('flex');
    }
    async function saveBranch(materialId, btn) {
      const input = document.getElementById('branch-input-' + materialId);
      const branch = input.value.trim();
      btn.disabled = true; btn.textContent = '保存中...';
      try {
        const res = await fetch(BASE_PATH + '/api/branch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ materialId, branch }),
        });
        if (res.ok) {
          document.getElementById('branch-label-' + materialId).textContent = branch || '（拠点不明）';
          cancelBranchEdit(materialId);
        } else {
          btn.disabled = false; btn.textContent = '保存'; alert('エラーが発生しました');
        }
      } catch { btn.disabled = false; btn.textContent = '保存'; alert('通信エラー'); }
    }

    // ─── 投稿文編集・保存 ───
    async function saveEdit(materialId, platform, btn) {
      const ta = document.getElementById('text-' + materialId + '-' + platform);
      if (!ta) return;
      btn.disabled = true; btn.textContent = '保存中...';
      try {
        const res = await fetch(BASE_PATH + '/api/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ materialId, platform, text: ta.value }),
        });
        if (res.ok) {
          btn.textContent = '✅ 保存しました';
          setTimeout(() => { btn.disabled = false; btn.textContent = '保存'; }, 2000);
        } else {
          btn.disabled = false; btn.textContent = '保存'; alert('エラーが発生しました');
        }
      } catch { btn.disabled = false; btn.textContent = '保存'; alert('通信エラー'); }
    }

    // 生成中の素材がある場合は30秒後に自動更新
    ${pendingList.length > 0 ? 'setTimeout(() => location.reload(), 30000);' : ''}
  </script>
</body>
</html>`;
}

// ─────────────────────────────────────────
// 素材カード HTML
// ─────────────────────────────────────────
function renderCard(m: Material, basePath: string): string {
  const receivedDate = new Date(m.receivedAt).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const allApproved = (['facebook', 'instagram', 'tiktok', 'x'] as const)
    .every(p => m[p]?.status === 'approved');

  // 写真サムネイル
  const images = (m.gcsImagePaths || []).slice(0, 4).map(gcsPath => {
    const encoded = encodeGcsPath(gcsPath);
    return `<img src="${basePath}/image?p=${encoded}" class="w-full h-32 object-cover rounded" loading="lazy" onerror="this.style.display='none'">`;
  }).join('');

  // 動画プレビュー
  const videoSection = m.videoGcsPath ? (() => {
    const encoded = encodeGcsPath(m.videoGcsPath);
    return `
    <div>
      <div class="text-xs font-semibold text-gray-500 mb-1">🎬 生成動画（Instagram / TikTok 用）</div>
      <video
        src="${basePath}/video?p=${encoded}"
        controls playsinline
        class="rounded-lg w-full max-w-[200px] bg-black"
        style="aspect-ratio:9/16"
        preload="metadata"
      ></video>
    </div>`;
  })() : '';

  // SNS投稿文エリア（個別承認付き）
  const platforms = (['facebook', 'instagram', 'tiktok', 'x'] as const).map(p => {
    const post = m[p] as PlatformPost;
    const { label, color, icon } = PLATFORM_LABELS[p];
    const displayText = post.editedText ?? post.text;
    const isApproved = post.status === 'approved';

    return `
    <div class="border rounded-lg p-4 space-y-2">
      <div class="flex items-center gap-2">
        <span class="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0" style="background:${color}">${icon}</span>
        <span class="font-semibold text-sm">${label}</span>
        <span id="status-${m.materialId}-${p}" class="text-xs px-2 py-0.5 rounded-full ${isApproved ? 'status-approved' : 'status-pending'}">
          ${isApproved ? '✅ 承認済み' : '⏳ 未承認'}
        </span>
      </div>
      <textarea id="text-${m.materialId}-${p}"
        class="w-full text-sm border rounded p-2 bg-gray-50 min-h-[80px]">${escapeHtml(displayText)}</textarea>
      <div class="flex gap-2">
        <button onclick="saveEdit('${m.materialId}','${p}',this)"
          class="text-xs px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700">保存</button>
        <button id="approve-btn-${m.materialId}-${p}"
          onclick="approve('${m.materialId}','${p}',this)"
          ${isApproved ? 'disabled' : ''}
          class="text-xs px-3 py-1 rounded text-white ${isApproved ? 'bg-green-600 cursor-default' : 'bg-blue-600 hover:bg-blue-700'}">
          ${isApproved ? '承認済み' : '承認'}
        </button>
      </div>
    </div>`;
  }).join('\n');

  return `
  <div class="bg-white rounded-xl shadow p-5 space-y-4">

    <!-- ヘッダー情報 -->
    <div class="space-y-1">
      <div class="flex items-center gap-2 flex-wrap">
        <span id="branch-label-${m.materialId}" class="font-bold text-gray-800">${escapeHtml(m.detectedBranch || '（拠点不明）')}</span>
        ${!m.detectedBranch || m.detectedBranch === '未判別'
          ? `<button onclick="editBranch('${m.materialId}')" class="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700 hover:bg-orange-200">✏️ 拠点名を設定</button>`
          : `<button onclick="editBranch('${m.materialId}')" class="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200">✏️ 修正</button>`
        }
        ${m.hasFacePermission
          ? '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">顔出しOK記載あり</span>'
          : '<span class="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">顔出し記載なし・要確認</span>'
        }
      </div>
      <div id="branch-edit-${m.materialId}" class="hidden gap-2 items-center mt-1">
        <input id="branch-input-${m.materialId}" type="text"
          list="branch-list"
          value="${escapeHtml(m.detectedBranch || '')}"
          placeholder="例: あおぞら博多"
          class="text-sm border rounded px-2 py-1 w-48">
        <button onclick="saveBranch('${m.materialId}', this)" class="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">保存</button>
        <button onclick="cancelBranchEdit('${m.materialId}')" class="text-xs px-3 py-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300">キャンセル</button>
      </div>
      <p class="text-xs text-gray-500">${receivedDate} ・ ${escapeHtml(m.sender)} ・ 写真${m.photoCount}枚</p>
      ${m.comment ? `<p class="text-sm text-gray-700 bg-gray-50 rounded p-2 mt-1">${escapeHtml(m.comment)}</p>` : ''}
    </div>

    <!-- 写真サムネイル ＋ 動画プレビュー -->
    <div class="flex gap-4 flex-wrap items-start">
      ${(m.gcsImagePaths || []).length > 0 ? `
      <div class="grid grid-cols-4 gap-2 flex-1 min-w-0">
        ${images}
      </div>` : ''}
      ${videoSection}
    </div>

    <!-- 全プラットフォーム一括承認ボタン -->
    <div class="flex justify-end">
      <button id="approve-all-btn-${m.materialId}"
        onclick="approveAll('${m.materialId}', this)"
        ${allApproved ? 'disabled' : ''}
        class="text-sm px-4 py-2 rounded text-white font-medium ${allApproved ? 'bg-green-600 cursor-default' : 'bg-indigo-600 hover:bg-indigo-700'}">
        ${allApproved ? '✅ 全て承認済み' : '✅ 全て承認'}
      </button>
    </div>

    <!-- SNS投稿文（4プラットフォーム） -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${platforms}
    </div>

  </div>`;
}

function escapeHtml(str: string): string {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
