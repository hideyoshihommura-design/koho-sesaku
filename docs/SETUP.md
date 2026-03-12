# セットアップ手順

## 前提条件

- GCPプロジェクト（課金設定済み）
- HubSpot Marketing Hub Starter 以上
- WordPress にアプリケーションパスワード発行済み
- TikTok Business API 申請済み（または手動投稿で代替）
- Node.js 20 以上
- Docker
- Terraform 1.6 以上
- gcloud CLI

---

## ステップ1: GCP 認証

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

---

## ステップ2: Secret Manager にAPIキーを登録

> **Webhook認証トークンの生成方法（Mac/Linux）：**
> ```bash
> openssl rand -hex 32
> # 出力例: a3f9c2b1e4d78f0123456789abcdef01...（これをコピーしておく）
> ```

```bash
# WordPress アプリケーションパスワード
# WordPress管理画面 → ユーザー → プロフィール → アプリケーションパスワード で発行
echo -n "your-wp-app-password" | \
  gcloud secrets create wordpress-app-password --data-file=-

# HubSpot プライベートアプリトークン
# HubSpot → 設定 → インテグレーション → プライベートアプリ で発行
echo -n "pat-na1-xxxxxxxx" | \
  gcloud secrets create hubspot-access-token --data-file=-

# TikTok Content Posting API トークン
echo -n "your-tiktok-token" | \
  gcloud secrets create tiktok-access-token --data-file=-

# LIFULL介護 ログイン情報
echo -n "you@example.com" | \
  gcloud secrets create lifull-login-email --data-file=-
echo -n "your-password" | \
  gcloud secrets create lifull-login-password --data-file=-

# Webhook認証トークン（openssl rand -hex 32 で生成した値）
echo -n "your-webhook-secret" | \
  gcloud secrets create webhook-secret --data-file=-

# SendGrid APIキー（任意・メール通知を使う場合）
echo -n "SG.xxxx" | \
  gcloud secrets create sendgrid-api-key --data-file=-

# Google Drive サービスアカウントキー（JSON）
gcloud secrets create google-drive-service-account \
  --data-file=path/to/service-account-key.json
```

---

## ステップ3: Terraform でGCPインフラを構築

```bash
cd terraform

# terraform.tfvars を作成
cp terraform.tfvars.example terraform.tfvars
# ← ファイルを編集して実際の値を入力

terraform init
terraform plan
terraform apply
```

出力から以下の値を控えてください：
- `cloud_run_url`
- `webhook_url`  ← WP Webhooks に設定する
- `artifact_registry_url`  ← Dockerイメージのプッシュ先

---

## ステップ4: Dockerイメージをビルド・プッシュ

```bash
# Artifact Registry へ認証
gcloud auth configure-docker asia-northeast1-docker.pkg.dev

# ビルドとプッシュ（ARTIFACT_REGISTRY_URL は terraform output で確認）
ARTIFACT_REGISTRY_URL=$(cd terraform && terraform output -raw artifact_registry_url)

cd cloud-run-app
docker build -t $ARTIFACT_REGISTRY_URL .
docker push $ARTIFACT_REGISTRY_URL

# Cloud Run イメージを更新
gcloud run services update sns-auto-post \
  --image $ARTIFACT_REGISTRY_URL \
  --region asia-northeast1
```

---

## ステップ4.5: terraform.tfvars に通知設定を追加（任意）

```hcl
# Slack通知を使う場合
slack_webhook_url = "https://hooks.slack.com/services/xxx/yyy/zzz"

# メール通知を使う場合
notify_email = "yoriko.kikunaga@aozora-cg.com"
```

## ステップ5: WordPress に WP Webhooks プラグインを設定

1. WordPress管理画面 → プラグイン → 新規追加 → 「WP Webhooks」を検索・インストール
2. WP Webhooks → 設定 → 送信 → 「Add Webhook URL」
3. 以下を設定：
   - **URL**: `terraform output webhook_url` の値
   - **Action**: `post_published`（記事公開時）
   - **HTTP Method**: POST
   - **Content Type**: application/json
4. **認証ヘッダーを設定**（セキュリティ）：
   - Header Name: `X-Webhook-Secret`
   - Header Value: Secret Managerに登録した `webhook-secret` の値

---

## ステップ6: Google Drive にキューフォルダを作成

1. Google Drive に「投稿素材_キュー」フォルダを作成
2. その中に「処理済み」サブフォルダを作成
3. 素材を以下の形式で投入：

```
投稿素材_キュー/
├── 001_スタッフ紹介/
│   ├── メモ.txt      ← 投稿に関する情報（何を書いてほしいか）
│   └── 写真.jpg      ← アイキャッチ画像（任意）
├── 002_イベント告知/
│   └── メモ.txt
└── 処理済み/         ← 処理後に自動移動される
```

---

## ステップ7: 動作確認

```bash
# ヘルスチェック
curl https://YOUR_CLOUD_RUN_URL/health

# フローA手動テスト（キュー処理）
curl -X POST https://YOUR_CLOUD_RUN_URL/queue/process \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)"

# ログ確認
gcloud logging read 'resource.type="cloud_run_revision"' \
  --limit=50 --format=json | jq '.[].jsonPayload'
```

---

## HubSpot チャンネルID の確認方法

1. HubSpot → マーケティング → ソーシャル → アカウントを接続
2. Facebook Page・Instagram Business アカウントを接続
3. HubSpot API で確認：
```bash
curl https://api.hubapi.com/broadcast/v1/channels/setting/publish/current \
  -H "Authorization: Bearer YOUR_HUBSPOT_TOKEN" | jq '.[].channelGuid'
```

---

## よくあるトラブル

### Cloud Run がタイムアウトする
Veo 2 動画生成は最大5分かかります。Terraform の `timeout = "600s"` が設定されていることを確認してください。

### LIFULL介護 Playwright が失敗する
ログに `/tmp/lifull-error-*.png` のパスが表示されます。Cloud Logging でスクリーンショットの保存先を確認し、セレクターが変わっていないか `lifullHandler.ts` を更新してください。

### TikTok API の審査が通っていない場合
`tiktokHandler.ts` を無効化するか、手動投稿に切り替えてください。フローBの `webhookHandler.ts` で TikTok 処理をコメントアウトできます。
