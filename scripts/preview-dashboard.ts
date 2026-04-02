// ダッシュボードのプレビュー用スクリプト
// モックデータでHTMLを生成して preview.html に出力する
// 実行: npx ts-node scripts/preview-dashboard.ts

import * as fs from 'fs';
import * as path from 'path';

// ─── webAppHandler の描画関数をそのまま複製 ───

const PLATFORM_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  facebook:  { label: 'Facebook',  color: '#1877F2', icon: 'F' },
  instagram: { label: 'Instagram', color: '#E1306C', icon: 'I' },
  tiktok:    { label: 'TikTok',    color: '#010101', icon: 'T' },
  x:         { label: 'X',         color: '#14171A', icon: 'X' },
};

const KNOWN_BRANCHES = ['あおぞら博多','七福の里','下荒田','東千石','梅ヶ丘'];

function escapeHtml(str: string): string {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// モックデータ
const mockMaterials = [
  // ① 生成済み・未承認（拠点判別あり）
  {
    materialId: 'mock-001',
    receivedAt: new Date('2026-04-01T09:30:00+09:00'),
    sender: '田中 花子',
    comment: 'あおぞら博多 本日の折り紙レクリエーションの様子です！皆さんとても楽しそうでした。顔出しOK',
    detectedBranch: 'あおぞら博多',
    hasFacePermission: true,
    photoCount: 3,
    gcsImagePaths: [],
    videoGcsPath: null,
    generationStatus: 'generated',
    generatedAt: new Date('2026-04-01T18:05:00+09:00'),
    facebook: {
      text: 'あおぞら博多では、本日も賑やかな折り紙レクリエーションが行われました✨\n利用者様が色とりどりの折り紙を手に、笑顔で取り組まれている様子が印象的でした。\n日々の活動を通して、皆様の生き生きとした姿が私たちのやりがいです😊\n\n#あおぞら博多 #介護 #デイサービス #レクリエーション #折り紙',
      editedText: null, status: 'pending', approvedAt: null,
    },
    instagram: {
      text: '今日のあおぞら博多はみんなで折り紙🎨✨\n笑顔いっぱいの時間をお届けします😊\n写真3枚あるよ！\n\n#あおぞら博多 #介護施設 #デイサービス #折り紙 #レクリエーション #笑顔 #福岡介護 #介護士 #高齢者 #日常 #癒し #温かい',
      editedText: null, status: 'approved', approvedAt: new Date(),
    },
    tiktok: {
      text: '折り紙で大盛り上がり🎉 #あおぞら博多 #介護 #レクリエーション',
      editedText: null, status: 'pending', approvedAt: null,
    },
    x: {
      text: 'あおぞら博多の折り紙レク、皆さんの集中した姿が素敵です✨ #あおぞら #介護',
      editedText: null, status: 'pending', approvedAt: null,
    },
  },
  // ② 生成済み・全承認済み（拠点判別あり）
  {
    materialId: 'mock-002',
    receivedAt: new Date('2026-03-30T14:00:00+09:00'),
    sender: '山田 太郎',
    comment: '七福の里 お花見イベントを開催しました。桜がきれいでした。',
    detectedBranch: '七福の里',
    hasFacePermission: false,
    photoCount: 4,
    gcsImagePaths: [],
    videoGcsPath: null,
    generationStatus: 'generated',
    generatedAt: new Date('2026-03-30T18:05:00+09:00'),
    facebook: {
      text: '七福の里でお花見イベントを開催しました🌸\n満開の桜の下で、利用者様と素敵なひとときを過ごしました。\n#七福の里 #介護 #お花見 #桜',
      editedText: null, status: 'approved', approvedAt: new Date(),
    },
    instagram: {
      text: '🌸お花見イベント開催しました！\n桜がとってもきれいでした😊 写真4枚！\n#七福の里 #お花見 #桜 #介護施設 #デイサービス #春 #福岡 #介護 #笑顔 #高齢者 #日常 #癒し',
      editedText: null, status: 'approved', approvedAt: new Date(),
    },
    tiktok: {
      text: '桜満開のお花見🌸 #七福の里 #介護 #春',
      editedText: null, status: 'approved', approvedAt: new Date(),
    },
    x: {
      text: '七福の里でお花見🌸 満開の桜の下、利用者様と素敵な時間を #七福の里 #介護',
      editedText: null, status: 'approved', approvedAt: new Date(),
    },
  },
  // ③ 生成済み・拠点未判別
  {
    materialId: 'mock-003',
    receivedAt: new Date('2026-04-02T08:00:00+09:00'),
    sender: '佐藤 次郎',
    comment: '今日の体操の様子です',
    detectedBranch: '未判別',
    hasFacePermission: false,
    photoCount: 2,
    gcsImagePaths: [],
    videoGcsPath: null,
    generationStatus: 'generated',
    generatedAt: new Date('2026-04-02T18:05:00+09:00'),
    facebook: {
      text: '本日も元気に体操を行いました！利用者様と一緒に体を動かす時間は、私たちにとっても大切な時間です。\n#介護 #デイサービス #体操 #健康',
      editedText: null, status: 'pending', approvedAt: null,
    },
    instagram: {
      text: '今日も体操で元気いっぱい💪✨\n写真2枚！\n#介護施設 #デイサービス #体操 #健康 #笑顔 #介護士 #高齢者 #日常 #元気 #福岡',
      editedText: null, status: 'pending', approvedAt: null,
    },
    tiktok: {
      text: '体操で元気チャージ💪 #介護 #デイサービス #体操',
      editedText: null, status: 'pending', approvedAt: null,
    },
    x: {
      text: '今日も元気に体操！利用者様の笑顔が一番のやりがいです😊 #介護 #デイサービス',
      editedText: null, status: 'pending', approvedAt: null,
    },
  },
  // ④ 生成待ち中
  {
    materialId: 'mock-004',
    receivedAt: new Date('2026-04-02T10:30:00+09:00'),
    sender: '鈴木 一郎',
    comment: '東千石 昼食の様子です',
    detectedBranch: '',
    hasFacePermission: false,
    photoCount: 2,
    gcsImagePaths: [],
    videoGcsPath: null,
    generationStatus: 'pending',
    generatedAt: null,
    facebook:  { text: '', editedText: null, status: 'pending', approvedAt: null },
    instagram: { text: '', editedText: null, status: 'pending', approvedAt: null },
    tiktok:    { text: '', editedText: null, status: 'pending', approvedAt: null },
    x:         { text: '', editedText: null, status: 'pending', approvedAt: null },
  },
];

// ─── HTML生成（webAppHandler.ts と同じロジック） ───

function renderCard(m: typeof mockMaterials[0]): string {
  const receivedDate = new Date(m.receivedAt).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const allApproved = (['facebook','instagram','tiktok','x'] as const)
    .every(p => m[p]?.status === 'approved');

  const platforms = (['facebook','instagram','tiktok','x'] as const).map(p => {
    const post = m[p];
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
      <textarea id="text-${m.materialId}-${p}" class="w-full text-sm border rounded p-2 bg-gray-50 min-h-[80px]">${escapeHtml(displayText)}</textarea>
      <div class="flex gap-2">
        <button onclick="saveEdit('${m.materialId}','${p}',this)" class="text-xs px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700">保存</button>
        <button id="approve-btn-${m.materialId}-${p}" onclick="approve('${m.materialId}','${p}',this)"
          ${isApproved ? 'disabled' : ''}
          class="text-xs px-3 py-1 rounded text-white ${isApproved ? 'bg-green-600 cursor-default' : 'bg-blue-600 hover:bg-blue-700'}">
          ${isApproved ? '承認済み' : '承認'}
        </button>
      </div>
    </div>`;
  }).join('\n');

  return `
  <div class="bg-white rounded-xl shadow p-5 space-y-4">
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
        <input id="branch-input-${m.materialId}" type="text" list="branch-list"
          value="${escapeHtml(m.detectedBranch || '')}" placeholder="例: あおぞら博多"
          class="text-sm border rounded px-2 py-1 w-48">
        <button onclick="saveBranch('${m.materialId}', this)" class="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">保存</button>
        <button onclick="cancelBranchEdit('${m.materialId}')" class="text-xs px-3 py-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300">キャンセル</button>
      </div>
      <p class="text-xs text-gray-500">${receivedDate} ・ ${escapeHtml(m.sender)} ・ 写真${m.photoCount}枚</p>
      ${m.comment ? `<p class="text-sm text-gray-700 bg-gray-50 rounded p-2 mt-1">${escapeHtml(m.comment)}</p>` : ''}
    </div>
    <div class="flex justify-end">
      <button id="approve-all-btn-${m.materialId}" onclick="approveAll('${m.materialId}', this)"
        ${allApproved ? 'disabled' : ''}
        class="text-sm px-4 py-2 rounded text-white font-medium ${allApproved ? 'bg-green-600 cursor-default' : 'bg-indigo-600 hover:bg-indigo-700'}">
        ${allApproved ? '✅ 全て承認済み' : '✅ 全て承認'}
      </button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      ${platforms}
    </div>
  </div>`;
}

const generated = mockMaterials.filter(m => m.generationStatus === 'generated');
const pendingList = mockMaterials.filter(m => m.generationStatus === 'pending');
const unapprovedCount = generated.filter(m =>
  (['facebook','instagram','tiktok','x'] as const).some(p => m[p]?.status === 'pending')
).length;
const datalistOptions = KNOWN_BRANCHES.map(b => `<option value="${escapeHtml(b)}">`).join('');

const pendingCards = pendingList.map(m => {
  const receivedDate = new Date(m.receivedAt).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  return `
  <div class="bg-white rounded-xl shadow p-5 border-l-4 border-yellow-400">
    <div class="flex items-center gap-3">
      <span class="text-yellow-500 text-xl">⏳</span>
      <div>
        <p class="font-semibold text-gray-700">${escapeHtml(m.sender)} ・ 写真${m.photoCount}枚</p>
        <p class="text-xs text-gray-400">${receivedDate} ・ AI生成中...</p>
        ${m.comment ? `<p class="text-xs text-gray-500 mt-1">${escapeHtml(m.comment)}</p>` : ''}
      </div>
    </div>
  </div>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SNS投稿 承認ダッシュボード（プレビュー）</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    textarea { resize: vertical; }
    .status-pending  { background:#FEF3C7; color:#92400E; }
    .status-approved { background:#D1FAE5; color:#065F46; }
  </style>
</head>
<body class="bg-gray-100 min-h-screen">
  <datalist id="branch-list">${datalistOptions}</datalist>

  <!-- プレビュー注意バナー -->
  <div class="bg-blue-600 text-white text-center text-sm py-2">
    📋 これはプレビュー用のモックデータです。ボタンの保存・承認はデモ動作のみ（実際のDBには書き込みません）
  </div>

  <header class="bg-white shadow sticky top-0 z-10">
    <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-2">
      <h1 class="text-lg font-bold text-gray-800">SNS投稿 承認ダッシュボード</h1>
      <div class="flex items-center gap-3 text-sm flex-wrap">
        <span class="text-gray-500">未承認: <span class="font-bold text-orange-500">${unapprovedCount}件</span></span>
        ${pendingList.length > 0 ? `<span class="text-yellow-500 font-medium">⏳ 生成中: ${pendingList.length}件</span>` : ''}
        <button onclick="location.reload()" class="text-xs px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 border">🔄 更新</button>
      </div>
    </div>
  </header>

  <main class="max-w-5xl mx-auto px-4 py-6 space-y-6">
    ${pendingCards}
    ${generated.map(m => renderCard(m as typeof mockMaterials[0])).join('\n')}
  </main>

  <script>
    function markApproved(materialId, platform) {
      const badge = document.getElementById('status-' + materialId + '-' + platform);
      if (badge) { badge.className = 'text-xs px-2 py-0.5 rounded-full status-approved'; badge.textContent = '✅ 承認済み'; }
      const btn = document.getElementById('approve-btn-' + materialId + '-' + platform);
      if (btn) { btn.disabled = true; btn.textContent = '承認済み'; btn.className = 'text-xs px-3 py-1 rounded text-white bg-green-600 cursor-default'; }
    }
    function checkAllApproved(materialId) {
      const allDone = ['facebook','instagram','tiktok','x'].every(p => {
        const b = document.getElementById('status-' + materialId + '-' + p);
        return b && b.textContent.includes('承認済み');
      });
      if (allDone) {
        const btn = document.getElementById('approve-all-btn-' + materialId);
        if (btn) { btn.disabled = true; btn.textContent = '✅ 全て承認済み'; btn.className = 'text-sm px-4 py-2 rounded text-white bg-green-600 cursor-default'; }
      }
    }
    async function approve(materialId, platform, btn) {
      btn.disabled = true; btn.textContent = '処理中...';
      await new Promise(r => setTimeout(r, 500));
      markApproved(materialId, platform);
      checkAllApproved(materialId);
    }
    async function approveAll(materialId, btn) {
      if (!confirm('すべてのSNSを一括承認しますか？')) return;
      btn.disabled = true; btn.textContent = '処理中...';
      await new Promise(r => setTimeout(r, 800));
      ['facebook','instagram','tiktok','x'].forEach(p => markApproved(materialId, p));
      btn.textContent = '✅ 全て承認済み';
      btn.classList.replace('bg-indigo-600','bg-green-600');
      btn.classList.remove('hover:bg-indigo-700');
    }
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
      await new Promise(r => setTimeout(r, 500));
      document.getElementById('branch-label-' + materialId).textContent = branch || '（拠点不明）';
      cancelBranchEdit(materialId);
    }
    async function saveEdit(materialId, platform, btn) {
      btn.disabled = true; btn.textContent = '保存中...';
      await new Promise(r => setTimeout(r, 500));
      btn.textContent = '✅ 保存しました';
      setTimeout(() => { btn.disabled = false; btn.textContent = '保存'; }, 2000);
    }
  </script>
</body>
</html>`;

const outPath = path.join(__dirname, '../docs/dashboard-preview.html');
fs.writeFileSync(outPath, html, 'utf-8');
console.log('✅ プレビューHTMLを生成しました:', outPath);
