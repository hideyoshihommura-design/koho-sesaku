// Webアプリのルートハンドラ
// コーディネーターが生成結果を確認・承認・編集する画面

import { Request, Response, Router } from 'express';
import { getAllMaterials, approvePlatform, editPostText, Platform } from './firestoreHandler';
import { downloadImagesAsBase64 } from './driveHandler';
import { logger } from '../utils/logger';

export function createWebAppRouter(appSecret: string): Router {
  const router = Router();

  // 秘密URLの検証ミドルウェア
  router.use((req, res, next) => {
    if (req.path.startsWith(`/${appSecret}`) || req.path === `/${appSecret}`) {
      next();
    } else {
      res.status(404).send('Not Found');
    }
  });

  // ダッシュボード
  router.get(`/${appSecret}`, async (_req, res) => {
    try {
      const materials = await getAllMaterials();
      res.send(renderDashboard(materials));
    } catch (err) {
      logger.error('ダッシュボード表示エラー', { error: String(err) });
      res.status(500).send('エラーが発生しました');
    }
  });

  // 画像プロキシ（Drive から画像を取得してブラウザに返す）
  router.get(`/${appSecret}/image/:fileId`, async (req, res) => {
    try {
      const { fileId } = req.params;
      const images = await downloadImagesAsBase64([fileId]);
      if (images.length === 0) {
        res.status(404).send('画像が見つかりません');
        return;
      }
      const { base64, mimeType } = images[0];
      const buffer = Buffer.from(base64, 'base64');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'max-age=3600');
      res.send(buffer);
    } catch (err) {
      logger.error('画像取得エラー', { error: String(err) });
      res.status(500).send('画像の取得に失敗しました');
    }
  });

  // 承認 API
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

  // 編集 API
  router.post(`/${appSecret}/api/edit`, async (req, res) => {
    const { materialId, platform, text } = req.body as {
      materialId: string;
      platform: string;
      text: string;
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

  return router;
}

// ─────────────────────────────────────────
// HTML レンダリング
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
  driveImageFileIds: string[];
  generatedAt: Date;
  facebook: PlatformPost;
  instagram: PlatformPost;
  tiktok: PlatformPost;
  x: PlatformPost;
}

const PLATFORM_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  facebook:  { label: 'Facebook',  color: '#1877F2', icon: 'F' },
  instagram: { label: 'Instagram', color: '#E1306C', icon: 'I' },
  tiktok:    { label: 'TikTok',    color: '#010101', icon: 'T' },
  x:         { label: 'X',         color: '#14171A', icon: 'X' },
};

function renderDashboard(materials: Material[]): string {
  const pendingCount = materials.filter(m =>
    ['facebook', 'instagram', 'tiktok', 'x'].some(p =>
      m[p as keyof Material] && (m[p as keyof Material] as PlatformPost).status === 'pending'
    )
  ).length;

  const cards = materials.map(m => renderCard(m)).join('\n');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SNS投稿 承認ダッシュボード</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    textarea { resize: vertical; }
    .status-pending  { background: #FEF3C7; color: #92400E; }
    .status-approved { background: #D1FAE5; color: #065F46; }
    .fade-out { opacity: 0; transition: opacity 0.5s; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">

  <!-- ヘッダー -->
  <header class="bg-white shadow sticky top-0 z-10">
    <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
      <h1 class="text-lg font-bold text-gray-800">SNS投稿 承認ダッシュボード</h1>
      <span class="text-sm text-gray-500">未承認: <span class="font-bold text-orange-500">${pendingCount}件</span></span>
    </div>
  </header>

  <main class="max-w-5xl mx-auto px-4 py-6 space-y-6">
    ${materials.length === 0
      ? '<p class="text-center text-gray-500 py-20">まだ生成されたコンテンツはありません</p>'
      : cards
    }
  </main>

  <script>
    // 承認ボタン
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
          btn.className = btn.className.replace('bg-blue-600 hover:bg-blue-700', 'bg-green-600 cursor-default');
        } else {
          btn.disabled = false;
          btn.textContent = '承認';
          alert('エラーが発生しました');
        }
      } catch(e) {
        btn.disabled = false;
        btn.textContent = '承認';
        alert('通信エラー');
      }
    }

    // 編集保存
    async function saveEdit(materialId, platform, btn) {
      const textarea = document.getElementById('text-' + materialId + '-' + platform);
      if (!textarea) return;
      const text = textarea.value;
      btn.disabled = true;
      btn.textContent = '保存中...';
      try {
        const res = await fetch('api/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ materialId, platform, text }),
        });
        if (res.ok) {
          btn.textContent = '✅ 保存しました';
          setTimeout(() => { btn.disabled = false; btn.textContent = '保存'; }, 2000);
        } else {
          btn.disabled = false;
          btn.textContent = '保存';
          alert('エラーが発生しました');
        }
      } catch(e) {
        btn.disabled = false;
        btn.textContent = '保存';
        alert('通信エラー');
      }
    }
  </script>
</body>
</html>`;
}

function renderCard(m: Material): string {
  const receivedDate = new Date(m.receivedAt).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const images = m.driveImageFileIds.slice(0, 4).map(id =>
    `<img src="image/${id}" class="w-full h-32 object-cover rounded" loading="lazy" onerror="this.style.display='none'">`
  ).join('');

  const platforms = (['facebook', 'instagram', 'tiktok', 'x'] as const).map(p => {
    const post = m[p] as PlatformPost;
    const { label, color, icon } = PLATFORM_LABELS[p];
    const displayText = post.editedText ?? post.text;
    const isApproved = post.status === 'approved';
    const statusClass = isApproved ? 'status-approved' : 'status-pending';
    const statusText = isApproved ? '✅ 承認済み' : '⏳ 未承認';

    return `
    <div class="border rounded-lg p-4 space-y-2">
      <div class="flex items-center gap-2">
        <span class="w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0" style="background:${color}">${icon}</span>
        <span class="font-semibold text-sm">${label}</span>
        <span id="status-${m.materialId}-${p}" class="text-xs px-2 py-0.5 rounded-full ${statusClass}">${statusText}</span>
      </div>
      <textarea id="text-${m.materialId}-${p}" class="w-full text-sm border rounded p-2 bg-gray-50 min-h-[80px]">${escapeHtml(displayText)}</textarea>
      <div class="flex gap-2">
        <button onclick="saveEdit('${m.materialId}', '${p}', this)"
          class="text-xs px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700">
          保存
        </button>
        <button onclick="approve('${m.materialId}', '${p}', this)"
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
    <div class="flex items-start justify-between gap-4">
      <div class="space-y-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-bold text-gray-800">${escapeHtml(m.detectedBranch)}</span>
          ${m.hasFacePermission ? '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">顔出しOK記載あり</span>' : ''}
        </div>
        <p class="text-xs text-gray-500">${receivedDate} ・ ${escapeHtml(m.sender)} ・ 写真${m.photoCount}枚</p>
        ${m.comment ? `<p class="text-sm text-gray-700 bg-gray-50 rounded p-2 mt-1">${escapeHtml(m.comment)}</p>` : ''}
      </div>
    </div>

    <!-- 写真サムネイル -->
    ${m.driveImageFileIds.length > 0 ? `
    <div class="grid grid-cols-4 gap-2">
      ${images}
    </div>` : ''}

    <!-- SNS投稿文（4プラットフォーム） -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${platforms}
    </div>
  </div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
