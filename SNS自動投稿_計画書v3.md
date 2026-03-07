# SNS・LIFULL介護 自動投稿 計画書 v3.0
## 〜 GCP + Claude AI による記事自動生成〜WordPress投稿〜SNS展開 〜

作成日: 2026-03-07
担当: Hideyoshi Hommura

---

## 1. プロジェクト概要

### 目的
画像や根拠となる情報を提供するだけで、Claude AI が記事を自動生成し、WordPressへの投稿・Facebook・Instagram・TikTok・LIFULL介護への展開まで全工程を自動化する。インフラはすべて **Google Cloud Platform（GCP）** 上に構築し、セキュリティ・スケーラビリティ・コスト管理を一元化する。

---

## 2. システム構成図

```
【入力】
Google Drive（素材フォルダ）
テキスト / 画像 / PDF / URL
        ↓
        ↓ Drive API通知
        ↓
【GCP インフラ】
┌──────────────────────────────────────────┐
│                                          │
│  Cloud Pub/Sub（イベントキュー）          │
│        ↓                                 │
│  Cloud Run（オーケストレーター）          │
│  ├─ Vertex AI（Claude claude-sonnet-4-6）│  ← 記事・SNS投稿文の生成
│  ├─ WordPress REST API                   │  ← 下書き投稿
│  ├─ HubSpot API                          │  ← Facebook・Instagram投稿
│  └─ TikTok Business API                  │  ← キャプション送信
│                                          │
│  Secret Manager（APIキー管理）            │
│  Cloud Scheduler（毎週定期チェック）      │
│  Cloud Logging（全ログ記録）             │
│  Cloud Monitoring（エラーアラート）       │
│                                          │
└──────────────────────────────────────────┘
        ↓
【出力】
WordPress（下書き） → 担当者確認 → 公開
        ↓
Facebook / Instagram（自動投稿）
TikTok / LIFULL介護（担当者通知 → 半自動）
```

---

## 3. GCP サービス構成詳細

### 使用するGCPサービス一覧

| GCPサービス | 役割 | 備考 |
|------------|------|------|
| **Cloud Run** | 自動化処理の中心となるサーバーレスアプリ | Node.js 18+ |
| **Vertex AI** | Claude claude-sonnet-4-6 の呼び出し | GCP内でAnthropicモデルを利用 |
| **Cloud Pub/Sub** | Google Driveの更新イベントを受信・キューイング | 処理の取りこぼしを防止 |
| **Cloud Scheduler** | 毎週定期的にGoogle Driveをチェック | cron形式で設定 |
| **Secret Manager** | 全APIキーを安全に管理 | WordPress・HubSpot・TikTokのトークン等 |
| **Cloud Storage** | 処理済み素材・生成記事のバックアップ | Google Driveと連携 |
| **Cloud Logging** | 全処理のログを記録 | 投稿履歴・エラーログ |
| **Cloud Monitoring** | エラー発生時にアラート通知 | メール・Slack通知 |
| **Artifact Registry** | Cloud RunのDockerイメージを管理 | |

### Vertex AI 上の Claude について

2026年現在、AnthropicのClaudeモデルは **Google Cloud Vertex AI** 上で利用可能。
GCP内で完結するため、請求がGCPにまとまり、IAMによるアクセス制御も適用される。

```
利用可能モデル（Vertex AI）:
- claude-opus-4-6      ← 最高品質（コスト高）
- claude-sonnet-4-6    ← 品質・コストのベスト選択
- claude-haiku-4-5     ← 高速・低コスト（SNS投稿文など）
```

---

## 4. Cloud Run アプリケーション設計

### アプリ構成（Node.js）

```
cloud-run-app/
├── src/
│   ├── index.ts            # エントリーポイント・ルーティング
│   ├── handlers/
│   │   ├── driveHandler.ts  # Google Drive ファイル取得
│   │   ├── claudeHandler.ts # Vertex AI / Claude API 呼び出し
│   │   ├── wpHandler.ts     # WordPress REST API 投稿
│   │   └── snsHandler.ts    # HubSpot・TikTok・LIFULL投稿
│   ├── prompts/
│   │   └── articlePrompt.ts # 記事生成プロンプト
│   └── utils/
│       └── secretManager.ts # Secret Manager からキー取得
├── Dockerfile
└── package.json
```

### 処理フロー（Cloud Run 内部）

```typescript
// 大まかな処理の流れ
async function processContent(driveFileId: string) {

  // 1. Google Driveからソース素材を取得
  const sources = await driveHandler.getFiles(driveFileId);

  // 2. 画像があればVertex AI（Vision）で解析
  const imageDescriptions = await claudeHandler.analyzeImages(sources.images);

  // 3. Claude claude-sonnet-4-6 で記事・SNS投稿文を一括生成
  const generated = await claudeHandler.generateArticle({
    text: sources.text,
    imageDescriptions,
    urls: sources.urls,
  });
  // generated には以下が含まれる:
  // - title, content, metaDescription
  // - facebookPost, instagramPost, tiktokCaption, lifullPost

  // 4. WordPressに下書きとして投稿
  const wpPost = await wpHandler.createDraft(generated);

  // 5. 担当者に確認通知
  await notify(`下書きを作成しました: ${wpPost.editUrl}`);
}
```

---

## 5. Vertex AI（Claude）プロンプト設計

### 記事生成プロンプト

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
  "tiktokCaption": "TikTokキャプション（100文字以内）",
  "lifullPost": "LIFULL介護向け投稿文（200文字以内）"
}
```

---

## 6. Secret Manager 管理するAPIキー一覧

| シークレット名 | 内容 |
|--------------|------|
| `wordpress-app-password` | WordPress アプリケーションパスワード |
| `hubspot-access-token` | HubSpot プライベートアプリトークン |
| `tiktok-access-token` | TikTok Business API トークン |
| `google-drive-service-account` | Google Drive 読み取り用サービスアカウントキー |

※ Vertex AI（Claude）はGCPのサービスアカウントで認証するためAPIキー不要

---

## 7. Google Drive フォルダ構成（運用時）

```
広報施策/
├── 📁 投稿素材_入力/        ← ここに素材を入れるだけでOK
│   ├── 2026-03-07_イベント告知/
│   │   ├── メモ.txt
│   │   ├── 写真1.jpg
│   │   └── 参考URL.txt
│   └── 2026-03-14_お知らせ/
│
├── 📁 生成済み記事/          ← Claudeが生成した内容を自動保存
└── 📁 公開済み/             ← WordPress公開後に自動移動
```

---

## 8. 実装フェーズ

### フェーズ1：GCP基盤構築（1週間）

- [ ] GCPプロジェクトの作成・IAM設定
- [ ] Artifact Registry・Cloud Run の有効化
- [ ] Secret Manager にAPIキーを登録
- [ ] Cloud Logging・Monitoring の設定

### フェーズ2：Claude 記事生成の実装（1〜2週間）

- [ ] Vertex AI で Claude claude-sonnet-4-6 の動作確認
- [ ] 記事生成プロンプトのチューニング（10本テスト）
- [ ] 画像解析（Vision）の動作確認
- [ ] 生成コンテンツのJSON出力を安定化

### フェーズ3：WordPress自動投稿（1週間）

- [ ] WordPress アプリケーションパスワードを Secret Manager に登録
- [ ] Cloud Run → WordPress REST API の接続実装
- [ ] 下書き投稿・画像アップロードのテスト
- [ ] 担当者への確認通知（メール）の設定

### フェーズ4：SNS自動投稿（1〜2週間）

- [ ] HubSpot と Facebook・Instagram の連携設定
- [ ] WordPress公開 → HubSpot Webhook のフロー構築
- [ ] TikTok Business API の申請・接続
- [ ] LIFULL介護 API連携の可否確認・対応

### フェーズ5：Google Drive トリガーの整備（1週間）

- [ ] Cloud Scheduler による定期チェック設定
- [ ] Google Drive → Cloud Pub/Sub → Cloud Run のフロー完成
- [ ] 担当者向け運用マニュアル作成

### フェーズ6：テスト運用・改善（2週間）

- [ ] 実際の記事10本で品質確認
- [ ] Cloud Monitoring でエラー監視の確認
- [ ] KPI計測の開始

---

## 9. GCPデプロイコマンド（主要手順）

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

# 4. DockerイメージをビルドしてArtifact Registryにプッシュ
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/REPO/koho-app

# 5. Cloud Runにデプロイ
gcloud run deploy koho-app \
  --image REGION-docker.pkg.dev/PROJECT_ID/REPO/koho-app \
  --platform managed \
  --region asia-northeast1 \
  --set-secrets WORDPRESS_PASSWORD=wordpress-app-password:latest \
  --set-secrets HUBSPOT_TOKEN=hubspot-access-token:latest \
  --cpu 1 \
  --memory 512Mi \
  --min-instances 0 \
  --max-instances 5

# 6. Cloud Schedulerで毎週月曜9時に実行
gcloud scheduler jobs create http check-drive-job \
  --schedule="0 9 * * 1" \
  --uri="https://koho-app-xxxx.run.app/check-drive" \
  --time-zone="Asia/Tokyo"
```

---

## 10. 費用試算（月次）

| サービス | 費用目安 |
|---------|---------|
| Cloud Run（週1回実行） | ほぼ無料（無料枠内） |
| Vertex AI / Claude claude-sonnet-4-6（週4記事） | 約$2〜5/月 |
| Cloud Pub/Sub | ほぼ無料（無料枠内） |
| Secret Manager | 約$0.06/月 |
| Cloud Scheduler | 無料（3ジョブまで） |
| Cloud Logging | 無料（50GB/月まで） |
| HubSpot Marketing Starter | $20/月〜 |
| **合計** | **約$22〜26/月（約3,300〜4,000円）** |

---

## 11. リスクと対策

| リスク | 対策 |
|--------|------|
| Claude の生成内容が不正確 | 必ず担当者確認後に「公開」（下書きフロー） |
| Cloud Run が停止する | min-instances=0でコスト最適化、エラー時はCloud Monitoringで即通知 |
| Secret が漏洩する | Secret Managerで管理・定期ローテーション |
| TikTok API 制限 | 手動投稿フローへ即時切り替え |
| LIFULL介護 API非対応 | 自動通知＋手動投稿で対応 |

---

## 12. 今すぐ始めるべきアクション（優先順）

| 優先 | アクション | 担当 |
|------|----------|------|
| 1 | GCPプロジェクトの作成・課金設定 | Hommuraさん |
| 2 | TikTok Business APIの申請（審査2〜4週間） | Hommuraさん |
| 3 | LIFULL介護パートナーサポートへAPI連携問い合わせ | Hommuraさん |
| 4 | HubSpotのプラン確認（Marketing Hub Starter以上か） | Hommuraさん |
| 5 | WordPressのアプリケーションパスワード発行 | Hommuraさん |
| 6 | Cloud Run アプリの開発開始 | Claude Code |
