# SNS・LIFULL介護 自動投稿 計画書 v3.1
## 〜 GCP + Claude AI による記事自動生成〜WordPress投稿〜全SNS完全自動展開 〜

作成日: 2026-03-07
担当: Hideyoshi Hommura

---

## 1. プロジェクト概要

### 目的
画像や根拠となる情報を提供するだけで、Claude AI が記事を自動生成し、WordPress・Facebook・Instagram・TikTok・LIFULL介護への投稿まで**全工程を完全自動化**する。インフラはすべて **Google Cloud Platform（GCP）** 上に構築する。

### 自動化レベル（全プラットフォーム完全自動）

| プラットフォーム | 自動化方式 | 自動化レベル |
|----------------|----------|------------|
| WordPress | REST API | 完全自動 |
| Facebook | HubSpot Social API | 完全自動 |
| Instagram | HubSpot Social API | 完全自動 |
| TikTok | Veo 2（動画生成）+ TikTok Content Posting API | 完全自動 |
| LIFULL介護 | パートナーAPI（優先）/ Playwright自動操作（代替） | 完全自動 |

---

## 2. システム構成図

```
【入力】
Google Drive（投稿素材_キュー）
テキスト / 画像 / PDF / URL
        ↓ キュー方式：1日1件ずつ自動処理
【GCP インフラ】
┌────────────────────────────────────────────────┐
│                                                │
│  Cloud Scheduler（毎朝 9:00）                  │
│        ↓                                       │
│  Cloud Pub/Sub（イベントキュー）                │
│        ↓                                       │
│  Cloud Run（オーケストレーター）                │
│  ├─ Vertex AI Claude claude-sonnet-4-6         │ ← 記事・投稿文生成
│  ├─ Vertex AI Veo 2                            │ ← TikTok用動画自動生成
│  ├─ WordPress REST API                         │ ← 下書き投稿
│  ├─ HubSpot API                                │ ← Facebook・Instagram
│  ├─ TikTok Content Posting API                 │ ← 動画自動投稿
│  └─ LIFULL介護 API / Playwright                │ ← 記事自動投稿
│                                                │
│  Secret Manager / Cloud Logging / Monitoring   │
│                                                │
└────────────────────────────────────────────────┘
        ↓
【出力】全プラットフォームへ完全自動投稿
WordPress / Facebook / Instagram / TikTok / LIFULL介護
```

---

## 3. GCP サービス構成詳細

| GCPサービス | 役割 | 備考 |
|------------|------|------|
| **Cloud Run** | 自動化処理の中心 | Node.js 18+ |
| **Vertex AI（Claude claude-sonnet-4-6）** | 記事・SNS投稿文の生成 | GCP内でAnthropicモデルを利用 |
| **Vertex AI（Veo 2）** | TikTok用動画の自動生成 | 画像＋テキストから動画を生成 |
| **Cloud Pub/Sub** | イベントキューイング | 処理の取りこぼしを防止 |
| **Cloud Scheduler** | 毎朝9:00に定期実行 | cron形式で設定 |
| **Secret Manager** | 全APIキーを安全に管理 | |
| **Cloud Storage** | 生成動画・素材のバックアップ | |
| **Cloud Logging** | 全処理のログを記録 | |
| **Cloud Monitoring** | エラー発生時にアラート通知 | |
| **Artifact Registry** | DockerイメージをGCP内で管理 | |

---

## 4. TikTok 完全自動化の仕組み

### 課題と解決策
TikTokはテキスト・画像投稿に対応しておらず**動画が必須**。
→ **Vertex AI の Veo 2** で動画を自動生成することで完全自動化を実現。

### 処理フロー
```
提供素材（画像・テキスト）
        ↓
Vertex AI Veo 2
画像＋テキストから15〜30秒の動画を自動生成
（テロップ・BGM・トランジション付き）
        ↓
Cloud Storage に一時保存
        ↓
TikTok Content Posting API
動画＋Claudeが生成したキャプション・ハッシュタグを投稿
```

### 生成動画の内容
- 提供画像をスライドショー形式で動画化
- Claude が生成したテキストをテロップとして自動挿入
- 動画の長さ：15〜60秒（素材量に応じて自動調整）

---

## 5. LIFULL介護 完全自動化の仕組み

### 方針（2段階）

**方針A：パートナーAPI（優先）**
- LIFULL介護のパートナーサポートにAPI提供の可否を問い合わせ
- API対応の場合 → Cloud Run から直接REST APIで記事を投稿

**方針B：Playwright自動操作（API非対応の場合）**
- Cloud Run 上で Playwright（ブラウザ自動操作ツール）を動作
- LIFULL介護のパートナー管理画面にログイン → 記事投稿を自動実行
- ログイン情報は Secret Manager で安全に管理

```
Cloud Run
        ↓
Playwright（ヘッドレスブラウザ）
        ↓
LIFULL介護パートナー管理画面にログイン
        ↓
新規記事入力フォームにClaudeの生成文を自動入力
        ↓
投稿ボタンを自動クリック
        ↓
完了確認 → Cloud Logging に記録
```

---

## 6. Cloud Run アプリケーション設計

### アプリ構成（Node.js）

```
cloud-run-app/
├── src/
│   ├── index.ts              # エントリーポイント・ルーティング
│   ├── handlers/
│   │   ├── queueHandler.ts   # Google Drive キュー管理
│   │   ├── claudeHandler.ts  # Vertex AI / Claude 呼び出し
│   │   ├── veoHandler.ts     # Vertex AI / Veo 2 動画生成
│   │   ├── wpHandler.ts      # WordPress REST API 投稿
│   │   ├── hubspotHandler.ts # HubSpot（Facebook・Instagram）
│   │   ├── tiktokHandler.ts  # TikTok Content Posting API
│   │   └── lifullHandler.ts  # LIFULL介護 API / Playwright
│   ├── prompts/
│   │   └── articlePrompt.ts  # 記事・SNS投稿文の生成プロンプト
│   └── utils/
│       └── secretManager.ts  # Secret Manager からキー取得
├── Dockerfile
└── package.json
```

### 処理フロー（Cloud Run 内部）

```typescript
async function processQueue() {

  // 1. キューの先頭素材を取得
  const source = await queueHandler.getNext();
  if (!source) { await notify('ストックがなくなりました'); return; }

  // 2. 画像・PDFを解析
  const imageDesc = await claudeHandler.analyzeImages(source.images);

  // 3. 記事・全SNS投稿文を一括生成
  const generated = await claudeHandler.generateAll({
    text: source.text, imageDesc, urls: source.urls
  });

  // 4. TikTok用動画を自動生成（Veo 2）
  const video = await veoHandler.generateVideo({
    images: source.images,
    caption: generated.tiktokCaption
  });

  // 5. 全プラットフォームへ並列投稿
  await Promise.all([
    wpHandler.createDraft(generated),           // WordPress下書き
    tiktokHandler.post(video, generated),       // TikTok
    lifullHandler.post(generated.lifullPost),   // LIFULL介護
  ]);

  // 6. WordPress公開後にHubSpotがFacebook・Instagramへ自動投稿

  // 7. 処理済みへ移動・残数通知
  await queueHandler.markDone(source);
  await notify(`投稿完了。残りストック: ${await queueHandler.count()}件`);
}
```

---

## 7. Vertex AI（Claude）プロンプト設計

```
あなたは介護業界の専門ライターです。
以下の情報をもとに、SEOを意識した記事と各SNS投稿文を生成してください。

【提供情報】
${sourceText}
${imageDescriptions}

【生成要件】
- ターゲット: 介護施設を探している家族・介護士を目指す方
- トーン: 親しみやすく専門的
- 文字数: 800〜1200文字
- 構成: リード文 → H2見出し（3〜4つ） → まとめ

【出力形式（JSON）】
{
  "title": "記事タイトル",
  "content": "本文（Markdown）",
  "metaDescription": "120文字以内のメタ説明",
  "altText": "アイキャッチ画像のALTテキスト",
  "facebookPost": "Facebook投稿文（300文字以内）",
  "instagramPost": "Instagram投稿文＋ハッシュタグ（150文字以内）",
  "tiktokCaption": "TikTokキャプション＋ハッシュタグ（100文字以内）",
  "lifullPost": "LIFULL介護向け投稿文（200文字以内）"
}
```

---

## 8. Secret Manager 管理するAPIキー一覧

| シークレット名 | 内容 |
|--------------|------|
| `wordpress-app-password` | WordPress アプリケーションパスワード |
| `hubspot-access-token` | HubSpot プライベートアプリトークン |
| `tiktok-access-token` | TikTok Content Posting API トークン |
| `lifull-login-email` | LIFULL介護パートナーログインID |
| `lifull-login-password` | LIFULL介護パートナーログインパスワード |
| `google-drive-service-account` | Google Drive 読み取り用サービスアカウントキー |

※ Vertex AI（Claude・Veo 2）はGCPサービスアカウントで認証するためAPIキー不要

---

## 9. 実装フェーズ

### フェーズ1：GCP基盤構築（1週間）
- [ ] GCPプロジェクトの作成・IAM設定
- [ ] 必要なAPIの有効化（Cloud Run・Vertex AI・Pub/Sub・Scheduler・Secret Manager）
- [ ] Secret Manager に全APIキーを登録
- [ ] Cloud Logging・Monitoring の設定

### フェーズ2：Claude 記事生成の実装（1〜2週間）
- [ ] Vertex AI で Claude claude-sonnet-4-6 の動作確認
- [ ] 記事生成プロンプトのチューニング（10本テスト）
- [ ] 画像解析・JSON出力の安定化

### フェーズ3：WordPress・HubSpot連携（1週間）
- [ ] WordPress REST API の接続・下書き投稿テスト
- [ ] HubSpot と Facebook・Instagram の連携設定
- [ ] WordPress公開 → HubSpot Webhook のフロー構築

### フェーズ4：TikTok完全自動化（1〜2週間）
- [ ] TikTok Business API の申請（審査2〜4週間のため最優先）
- [ ] Vertex AI Veo 2 での動画生成テスト
- [ ] Cloud Run → TikTok Content Posting API の接続

### フェーズ5：LIFULL介護完全自動化（1〜2週間）
- [ ] LIFULL介護パートナーサポートへAPI提供の問い合わせ
- [ ] API対応の場合：REST API接続を実装
- [ ] API非対応の場合：Playwright自動操作を実装・テスト

### フェーズ6：キュー基盤・通知の整備（1週間）
- [ ] Google Drive キュー処理の実装
- [ ] ストック残数の通知機能の実装
- [ ] 担当者向け運用マニュアル作成

### フェーズ7：テスト運用・改善（2週間）
- [ ] 実際の記事10本で全プラットフォームの動作確認
- [ ] KPI計測の開始

---

## 10. GCPデプロイコマンド（主要手順）

```bash
# 1. GCPプロジェクト設定
gcloud config set project YOUR_PROJECT_ID

# 2. 必要なAPIを有効化
gcloud services enable run.googleapis.com \
  pubsub.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com

# 3. Secret Managerにシークレットを登録
gcloud secrets create wordpress-app-password --data-file=-
gcloud secrets create hubspot-access-token --data-file=-
gcloud secrets create tiktok-access-token --data-file=-
gcloud secrets create lifull-login-email --data-file=-
gcloud secrets create lifull-login-password --data-file=-

# 4. DockerイメージをビルドしてArtifact Registryにプッシュ
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/REPO/koho-app

# 5. Cloud Runにデプロイ
gcloud run deploy koho-app \
  --image REGION-docker.pkg.dev/PROJECT_ID/REPO/koho-app \
  --platform managed \
  --region asia-northeast1 \
  --set-secrets WORDPRESS_PASSWORD=wordpress-app-password:latest \
  --set-secrets HUBSPOT_TOKEN=hubspot-access-token:latest \
  --set-secrets TIKTOK_TOKEN=tiktok-access-token:latest \
  --set-secrets LIFULL_EMAIL=lifull-login-email:latest \
  --set-secrets LIFULL_PASSWORD=lifull-login-password:latest \
  --cpu 2 \
  --memory 2Gi \
  --min-instances 0 \
  --max-instances 5

# 6. Cloud Schedulerで毎日9時に実行
gcloud scheduler jobs create http check-queue-job \
  --schedule="0 9 * * *" \
  --uri="https://koho-app-xxxx.run.app/process-queue" \
  --time-zone="Asia/Tokyo"
```

---

## 11. 費用試算（月次）

| サービス | 費用目安 |
|---------|---------|
| Cloud Run（毎日実行・CPU2） | 約$3〜5/月 |
| Vertex AI / Claude claude-sonnet-4-6（月30記事） | 約$15〜20/月 |
| Vertex AI / Veo 2（月30動画・15〜30秒） | 約$15〜30/月 |
| Cloud Pub/Sub・Scheduler・Logging | ほぼ無料 |
| Secret Manager | 約$0.06/月 |
| HubSpot Marketing Starter | $20/月〜 |
| **合計** | **約$53〜75/月（約8,000〜11,000円）** |

---

## 12. リスクと対策

| リスク | 対策 |
|--------|------|
| Claude の生成内容が不正確 | 担当者が確認後に公開（下書きフロー） |
| Veo 2 の動画品質が低い | 生成動画をCloudStorageに保存し担当者が確認・差し替えも可能 |
| TikTok APIの審査が遅れる | 審査中はVeo 2生成動画を担当者が手動投稿（半自動で対応） |
| LIFULL介護がAPI非対応 | Playwright自動操作で代替 |
| Playwrightの操作がUIChange で壊れる | Cloud MonitoringでエラーをキャッチしてSlack通知 |

---

## 13. 今すぐ始めるべきアクション（優先順）

| 優先 | アクション | 担当 |
|------|----------|------|
| 1 | TikTok Business APIの申請（審査2〜4週間のため最優先） | Hommuraさん |
| 2 | LIFULL介護パートナーサポートへAPI提供の問い合わせ | Hommuraさん |
| 3 | GCPプロジェクトの作成・課金設定 | Hommuraさん |
| 4 | HubSpotのプラン確認（Marketing Hub Starter以上か） | Hommuraさん |
| 5 | WordPressのアプリケーションパスワード発行 | Hommuraさん |
| 6 | Cloud Run アプリの開発開始 | Claude Code |
