# SNS・LIFULL介護 自動投稿 計画書 v3.2
## 〜 GCP + Claude AI による記事自動生成〜WordPress投稿〜全SNS完全自動展開 〜

作成日: 2026-03-07
担当: Hideyoshi Hommura

---

## 1. プロジェクト概要

### 目的
2つのフローを組み合わせ、あらゆる状況で全プラットフォームへの投稿を完全自動化する。
インフラはすべて **Google Cloud Platform（GCP）** 上に構築する。

### 2つの自動化フロー

| | フローA | フローB |
|--|---------|---------|
| **用途** | 新規記事を作成したいとき | 既存のHP記事をSNSに展開したいとき |
| **起点** | Google Driveに素材を投入 | WordPressで記事を公開するだけ |
| **Claudeの役割** | 記事本文＋SNS投稿文を生成 | SNS投稿文のみ生成（記事は既存） |
| **WordPress** | 下書きを自動作成 → 担当者が公開 | 担当者が直接公開（トリガーになる） |
| **SNS投稿** | 完全自動 | 完全自動 |

### 自動化レベル（全プラットフォーム完全自動）

| プラットフォーム | 自動化方式 | 自動化レベル |
|----------------|----------|------------|
| WordPress | REST API（フローAのみ） | 完全自動 |
| Facebook | HubSpot Social API | 完全自動 |
| Instagram | HubSpot Social API | 完全自動 |
| TikTok | Veo 2（動画生成）+ TikTok Content Posting API | 完全自動 |
| LIFULL介護 | パートナーAPI（優先）/ Playwright自動操作（代替） | 完全自動 |

---

## 2. システム構成図

```
【フローA：新規記事作成】
Google Drive（投稿素材_キュー）
テキスト / 画像 / PDF / URL
        ↓ キュー方式：1日1件ずつ自動処理
        ↓
【フローB：既存記事からSNS展開】
WordPressで記事を公開
        ↓ WP Webhooks で即時通知
        ↓
【共通：GCP インフラ】
┌────────────────────────────────────────────────┐
│                                                │
│  Cloud Run（オーケストレーター）                │
│  ├─ Vertex AI Claude claude-sonnet-4-6         │ ← 記事・投稿文生成
│  ├─ Vertex AI Veo 2                            │ ← TikTok用動画自動生成
│  ├─ WordPress REST API（フローAのみ）           │ ← 下書き投稿
│  ├─ WordPress REST API（フローB）              │ ← 記事内容の取得
│  ├─ HubSpot API                                │ ← Facebook・Instagram
│  ├─ TikTok Content Posting API                 │ ← 動画自動投稿
│  └─ LIFULL介護 API / Playwright                │ ← 記事自動投稿
│                                                │
│  Secret Manager / Cloud Logging / Monitoring   │
│                                                │
└────────────────────────────────────────────────┘
        ↓
【出力】全プラットフォームへ完全自動投稿
Facebook / Instagram / TikTok / LIFULL介護
```

---

## 3. GCP サービス構成詳細

| GCPサービス | 役割 | 備考 |
|------------|------|------|
| **Cloud Run** | 自動化処理の中心 | Node.js 18+ |
| **Vertex AI（Claude claude-sonnet-4-6）** | 記事・SNS投稿文の生成 | GCP内でAnthropicモデルを利用 |
| **Vertex AI（Veo 2）** | TikTok用動画の自動生成 | 画像＋テキストから動画を生成 |
| **Cloud Pub/Sub** | イベントキューイング | フローA・B両方のイベントを受信 |
| **Cloud Scheduler** | フローA：毎朝9:00に定期実行 | cron形式で設定 |
| **Secret Manager** | 全APIキーを安全に管理 | |
| **Cloud Storage** | 生成動画・素材のバックアップ | |
| **Cloud Logging** | 全処理のログを記録 | |
| **Cloud Monitoring** | エラー発生時にアラート通知 | |
| **Artifact Registry** | DockerイメージをGCP内で管理 | |

---

## 4. フローA：新規記事作成の詳細

### 処理フロー
```
担当者が好きなタイミングで素材をGoogle Driveに投入
（001_内容・002_内容... と番号順に格納）
        ↓
毎朝 9:00 Cloud Scheduler が起動
        ↓
キューの先頭素材を1つ取り出す
        ↓
Claude claude-sonnet-4-6
記事タイトル・本文・メタ情報・全SNS投稿文を一括生成
        ↓
WordPress に下書きとして自動投稿
        ↓
担当者が確認・公開（約5〜10分）
        ↓
WordPress公開 → フローBへ引き継ぎ（SNS自動投稿）
```

### Google Drive フォルダ構成
```
広報施策/
└── 📁 投稿素材_キュー/
    ├── 📁 001_スタッフ紹介/    ← 本日処理
    │   ├── メモ.txt
    │   └── 写真.jpg
    ├── 📁 002_イベント告知/    ← 明日以降
    ├── 📁 003_介護費用/
    └── 📁 処理済み/           ← 投稿完了後に自動移動
```

---

## 5. フローB：既存記事からSNS展開の詳細

### 処理フロー
```
WordPressで記事を公開
（フローAの下書きを公開する場合も、直接書いて公開する場合も両方対応）
        ↓
WP Webhooks が即時に Cloud Run へ通知
        ↓
WordPress REST API で記事内容を自動取得
（タイトル・本文・アイキャッチ画像）
        ↓
Claude claude-sonnet-4-6
記事内容をもとに各SNS用の投稿文を最適化して生成
        ↓
並列で全プラットフォームへ自動投稿
├─ Facebook（HubSpot経由）
├─ Instagram（HubSpot経由）
├─ TikTok（Veo 2で動画生成 → Content Posting API）
└─ LIFULL介護（パートナーAPI / Playwright）
```

### フローBのポイント
- WordPressに記事を公開するだけで、残りは**すべて自動**
- フローAで作成した記事でも、直接WordPressで書いた記事でも動作する
- 過去の記事を再公開（更新）した場合にも対応可能

---

## 6. TikTok 完全自動化の仕組み

### 課題と解決策
TikTokはテキスト・画像投稿に対応しておらず**動画が必須**。
→ **Vertex AI の Veo 2** で動画を自動生成することで完全自動化を実現。

### 処理フロー
```
記事のアイキャッチ画像＋本文テキスト
        ↓
Vertex AI Veo 2
画像＋テキストから15〜60秒の動画を自動生成
（テロップ・トランジション付き）
        ↓
Cloud Storage に一時保存
        ↓
TikTok Content Posting API
動画＋Claudeが生成したキャプション・ハッシュタグを投稿
```

---

## 7. LIFULL介護 完全自動化の仕組み

**方針A：パートナーAPI（優先）**
- LIFULL介護のパートナーサポートにAPI提供の可否を問い合わせ
- API対応の場合 → Cloud Run から直接REST APIで記事を投稿

**方針B：Playwright自動操作（API非対応の場合）**
- Cloud Run 上で Playwright（ブラウザ自動操作）を動作
- LIFULL介護のパートナー管理画面にログイン → 記事投稿を自動実行
- ログイン情報は Secret Manager で安全に管理

---

## 8. Cloud Run アプリケーション設計

### アプリ構成（Node.js）

```
cloud-run-app/
├── src/
│   ├── index.ts              # エントリーポイント・ルーティング
│   ├── handlers/
│   │   ├── queueHandler.ts   # フローA：Google Drive キュー管理
│   │   ├── webhookHandler.ts # フローB：WordPress Webhook受信
│   │   ├── claudeHandler.ts  # Vertex AI / Claude 呼び出し
│   │   ├── veoHandler.ts     # Vertex AI / Veo 2 動画生成
│   │   ├── wpHandler.ts      # WordPress REST API
│   │   ├── hubspotHandler.ts # HubSpot（Facebook・Instagram）
│   │   ├── tiktokHandler.ts  # TikTok Content Posting API
│   │   └── lifullHandler.ts  # LIFULL介護 API / Playwright
│   ├── prompts/
│   │   ├── articlePrompt.ts  # フローA：記事生成プロンプト
│   │   └── snsPrompt.ts      # フローB：SNS投稿文最適化プロンプト
│   └── utils/
│       └── secretManager.ts  # Secret Manager からキー取得
├── Dockerfile
└── package.json
```

### 処理フロー（Cloud Run 内部）

```typescript
// フローA：新規記事作成
async function processQueue() {
  const source = await queueHandler.getNext();
  if (!source) { await notify('ストックがなくなりました'); return; }

  const imageDesc = await claudeHandler.analyzeImages(source.images);
  const generated = await claudeHandler.generateArticle({ source, imageDesc });
  const video = await veoHandler.generateVideo({ images: source.images, caption: generated.tiktokCaption });

  await wpHandler.createDraft(generated);  // WordPressに下書き
  // WordPress公開後にフローBへ引き継ぎ

  await queueHandler.markDone(source);
  await notify(`下書き作成完了。残りストック: ${await queueHandler.count()}件`);
}

// フローB：WordPress公開をトリガーにSNS自動投稿
async function handleWordPressPublish(postId: string) {
  const article = await wpHandler.getPost(postId);  // 記事内容を取得

  const snsContent = await claudeHandler.generateSNSPosts(article);
  const video = await veoHandler.generateVideo({ images: [article.thumbnail], caption: snsContent.tiktokCaption });

  await Promise.all([
    hubspotHandler.postFacebook(snsContent.facebookPost, article.url),
    hubspotHandler.postInstagram(snsContent.instagramPost, article.thumbnail),
    tiktokHandler.post(video, snsContent.tiktokCaption),
    lifullHandler.post(snsContent.lifullPost),
  ]);
}
```

---

## 9. Vertex AI（Claude）プロンプト設計

### フローA：記事生成プロンプト
```
あなたは介護業界の専門ライターです。
以下の情報をもとに、SEOを意識した記事と各SNS投稿文を生成してください。

【提供情報】${sourceText} ${imageDescriptions}

【出力形式（JSON）】
{
  "title": "記事タイトル",
  "content": "本文（Markdown）",
  "metaDescription": "120文字以内",
  "facebookPost": "300文字以内",
  "instagramPost": "150文字以内＋ハッシュタグ",
  "tiktokCaption": "100文字以内＋ハッシュタグ",
  "lifullPost": "200文字以内"
}
```

### フローB：SNS投稿文最適化プロンプト
```
以下のWordPress記事をもとに、各SNSに最適化した投稿文を生成してください。
記事の内容を変えず、各プラットフォームのトーン・文字数に合わせること。

【記事タイトル】${title}
【記事本文】${content}
【記事URL】${url}

【出力形式（JSON）】
{
  "facebookPost": "300文字以内＋URL",
  "instagramPost": "150文字以内＋ハッシュタグ",
  "tiktokCaption": "100文字以内＋ハッシュタグ",
  "lifullPost": "200文字以内"
}
```

---

## 10. Secret Manager 管理するAPIキー一覧

| シークレット名 | 内容 |
|--------------|------|
| `wordpress-app-password` | WordPress アプリケーションパスワード |
| `hubspot-access-token` | HubSpot プライベートアプリトークン |
| `tiktok-access-token` | TikTok Content Posting API トークン |
| `lifull-login-email` | LIFULL介護パートナーログインID |
| `lifull-login-password` | LIFULL介護パートナーログインパスワード |
| `google-drive-service-account` | Google Drive 読み取り用サービスアカウントキー |

---

## 11. 実装フェーズ

### フェーズ1：GCP基盤構築（1週間）
- [ ] GCPプロジェクトの作成・IAM設定
- [ ] 必要なAPIの有効化
- [ ] Secret Manager に全APIキーを登録
- [ ] Cloud Logging・Monitoring の設定

### フェーズ2：フローB実装（優先・1〜2週間）
- [ ] WP Webhooks プラグインの設定
- [ ] WordPress REST API で記事取得の実装
- [ ] Claude による SNS投稿文最適化プロンプトのチューニング
- [ ] HubSpot・Facebook・Instagram への自動投稿テスト

### フェーズ3：TikTok完全自動化（1〜2週間）
- [ ] TikTok Business API の申請（審査2〜4週間のため最優先）
- [ ] Vertex AI Veo 2 での動画生成テスト
- [ ] Cloud Run → TikTok Content Posting API の接続

### フェーズ4：LIFULL介護完全自動化（1〜2週間）
- [ ] LIFULL介護パートナーサポートへAPI提供の問い合わせ
- [ ] API対応：REST API接続を実装
- [ ] API非対応：Playwright自動操作を実装

### フェーズ5：フローA実装（1〜2週間）
- [ ] Vertex AI で Claude claude-sonnet-4-6 の動作確認
- [ ] 記事生成プロンプトのチューニング（10本テスト）
- [ ] Google Drive キュー処理・ストック通知の実装

### フェーズ6：テスト運用・改善（2週間）
- [ ] 全プラットフォームの動作確認
- [ ] KPI計測の開始

---

## 12. 費用試算（月次）

| サービス | 費用目安 |
|---------|---------|
| Cloud Run（毎日実行） | 約$3〜5/月 |
| Vertex AI / Claude claude-sonnet-4-6（月30記事） | 約$15〜20/月 |
| Vertex AI / Veo 2（月30動画） | 約$15〜30/月 |
| Cloud Pub/Sub・Scheduler・Logging | ほぼ無料 |
| Secret Manager | 約$0.06/月 |
| HubSpot Marketing Starter | $20/月〜 |
| **合計** | **約$53〜75/月（約8,000〜11,000円）** |

---

## 13. リスクと対策

| リスク | 対策 |
|--------|------|
| Claude の生成内容が不正確 | 担当者が確認後に公開（下書きフロー） |
| Veo 2 の動画品質が低い | Cloud Storageに保存し担当者が確認・差し替えも可能 |
| TikTok APIの審査が遅れる | 審査中は担当者が手動投稿（半自動で対応） |
| LIFULL介護がAPI非対応 | Playwright自動操作で代替 |
| Playwrightの操作がUIChangeで壊れる | Cloud MonitoringでエラーをキャッチしてSlack通知 |

---

## 14. 今すぐ始めるべきアクション（優先順）

| 優先 | アクション | 担当 |
|------|----------|------|
| 1 | TikTok Business APIの申請（審査2〜4週間のため最優先） | Hommuraさん |
| 2 | LIFULL介護パートナーサポートへAPI提供の問い合わせ | Hommuraさん |
| 3 | GCPプロジェクトの作成・課金設定 | Hommuraさん |
| 4 | HubSpotのプラン確認（Marketing Hub Starter以上か） | Hommuraさん |
| 5 | WordPressのアプリケーションパスワード発行 | Hommuraさん |
| 6 | Cloud Run アプリの開発開始（フローBから着手） | Claude Code |
