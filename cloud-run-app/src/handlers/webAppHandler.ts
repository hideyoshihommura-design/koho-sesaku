// Webアプリのルートハンドラ
// コーディネーターが生成結果を確認・承認・編集する画面

import { Router } from 'express';
import { Storage } from '@google-cloud/storage';
import { getAllMaterials, approvePlatform, editPostText, updateBranch, Platform } from './firestoreHandler';
import { getVideoSignedUrl } from './videoHandler';
import { logger } from '../utils/logger';

const storage = new Storage();

function getBucketName(): string {
  return `${process.env.GOOGLE_CLOUD_PROJECT}-sns-videos`;
}

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
      res.send(renderDashboard(materials));
    } catch (err) {
      logger.error('ダッシュボード表示エラー', { error: String(err) });
      res.status(500).send('エラーが発生しました');
    }
  });

  // ─────────────────────────────────────────
  // 画像プロキシ（GCS から取得してブラウザに返す）
  // ?p=<base64エンコードされたGCSパス>
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
  // ?p=<base64エンコードされたGCSパス>
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
  // 承認 API
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
  gcsImagePaths: string[];       // GCS パス（Drive → GCS 移行）
  videoGcsPath: string | null;   // 生成動画の GCS パス
  generationStatus: string;      // pending / generated / failed
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

// ─────────────────────────────────────────
// GCS パスを base64 エンコード（URL に埋め込むため）
// ─────────────────────────────────────────
function encodeGcsPath(gcsPath: string): string {
  return Buffer.from(gcsPath).toString('base64');
}

// ─────────────────────────────────────────
// ダッシュボード HTML
// ─────────────────────────────────────────
function renderDashboard(materials: Material[]): string {
  // 生成済みのみ表示（pending / failed は除外）
  const generated = materials.filter(m => m.generationStatus === 'generated');
  const pending   = materials.filter(m => m.generationStatus === 'pending').length;
  const failed    = materials.filter(m => m.generationStatus === 'failed').length;

  const unapprovedCount = generated.filter(m =>
    (['facebook', 'instagram', 'tiktok', 'x'] as const).some(
      p => m[p]?.status === 'pending'
    )
  ).length;

  const cards = generated.map(m => renderCard(m)).join('\n');

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
  </style>
</head>
<body class="bg-gray-100 min-h-screen">

  <!-- ヘッダー -->
  <header class="bg-white shadow sticky top-0 z-10">
    <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
      <h1 class="text-lg font-bold text-gray-800">SNS投稿 承認ダッシュボード</h1>
      <div class="flex gap-3 text-sm flex-wrap">
        <span class="text-gray-500">未承認: <span class="font-bold text-orange-500">${unapprovedCount}件</span></span>
        ${pending > 0 ? `<span class="text-gray-400">生成待ち: ${pending}件</span>` : ''}
        ${failed  > 0 ? `<span class="text-red-400">生成失敗: ${failed}件</span>` : ''}
      </div>
    </div>
  </header>

  <main class="max-w-5xl mx-auto px-4 py-6 space-y-6">
    ${generated.length === 0
      ? '<p class="text-center text-gray-500 py-20">まだ生成されたコンテンツはありません</p>'
      : cards
    }
  </main>

  <script>
    async function approve(materialId, platform, btn) {
      btn.disabled = true;
      btn.textContent = '処理中...';
      try {
        const res = await fetch('api/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ materialId, platform }),
        });
        if (res.ok) {
          const badge = document.getElementById('status-' + materialId + '-' + platform);
          if (badge) { badge.className = 'text-xs px-2 py-0.5 rounded-full status-approved'; badge.textContent = '✅ 承認済み'; }
          btn.textContent = '承認済み';
          btn.classList.replace('bg-blue-600', 'bg-green-600');
          btn.classList.remove('hover:bg-blue-700');
          btn.classList.add('cursor-default');
        } else {
          btn.disabled = false; btn.textContent = '承認'; alert('エラーが発生しました');
        }
      } catch { btn.disabled = false; btn.textContent = '承認'; alert('通信エラー'); }
    }

    function editBranch(materialId) {
      document.getElementById('branch-edit-' + materialId).classList.remove('hidden');
      document.getElementById('branch-edit-' + materialId).classList.add('flex');
    }
    function cancelBranchEdit(materialId) {
      document.getElementById('branch-edit-' + materialId).classList.add('hidden');
      document.getElementById('branch-edit-' + materialId).classList.remove('flex');
    }
    async function saveBranch(materialId, btn) {
      const input = document.getElementById('branch-input-' + materialId);
      const branch = input.value.trim();
      btn.disabled = true; btn.textContent = '保存中...';
      try {
        const res = await fetch('api/branch', {
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

    async function saveEdit(materialId, platform, btn) {
      const ta = document.getElementById('text-' + materialId + '-' + platform);
      if (!ta) return;
      btn.disabled = true; btn.textContent = '保存中...';
      try {
        const res = await fetch('api/edit', {
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
  </script>
</body>
</html>`;
}

// ─────────────────────────────────────────
// 素材カード HTML
// ─────────────────────────────────────────
function renderCard(m: Material): string {
  const receivedDate = new Date(m.receivedAt).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // 写真サムネイル（GCS パスを base64 エンコードして /image?p=... に渡す）
  const images = (m.gcsImagePaths || []).slice(0, 4).map(gcsPath => {
    const encoded = encodeGcsPath(gcsPath);
    return `<img src="image?p=${encoded}" class="w-full h-32 object-cover rounded" loading="lazy" onerror="this.style.display='none'">`;
  }).join('');

  // 動画プレビュー（videoGcsPath がある場合のみ表示）
  const videoSection = m.videoGcsPath ? (() => {
    const encoded = encodeGcsPath(m.videoGcsPath);
    return `
    <div>
      <div class="text-xs font-semibold text-gray-500 mb-1">🎬 生成動画（Instagram / TikTok 用）</div>
      <video
        src="video?p=${encoded}"
        controls
        playsinline
        class="rounded-lg w-full max-w-[200px] bg-black"
        style="aspect-ratio:9/16"
        preload="metadata"
      ></video>
    </div>`;
  })() : '';

  // SNS投稿文エリア
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
        <button onclick="approve('${m.materialId}','${p}',this)"
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
        ${m.hasFacePermission ? '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">顔出しOK記載あり</span>' : '<span class="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">顔出し記載なし・要確認</span>'}
      </div>
      <div id="branch-edit-${m.materialId}" class="hidden flex gap-2 items-center mt-1">
        <input id="branch-input-${m.materialId}" type="text" value="${escapeHtml(m.detectedBranch || '')}"
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

    <!-- SNS投稿文（4プラットフォーム） -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${platforms}
    </div>

  </div>`;
}

function escapeHtml(str: string): string {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
