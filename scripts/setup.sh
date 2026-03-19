#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  SNS自動投稿システム セットアップスクリプト
#  対象: Google Cloud Shell
#  使い方: bash scripts/setup.sh
# ═══════════════════════════════════════════════════════════════
set -e

PROJECT_ID="aozora-sns-auto"
REGION="asia-northeast1"
IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/sns-auto-post/app:latest"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  SNS自動投稿システム セットアップ開始     ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "プロジェクトID : $PROJECT_ID"
echo "リージョン     : $REGION"
echo ""
read -rp "上記の設定で開始しますか？ (y/N): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "キャンセルしました"
  exit 0
fi

# ──────────────────────────────────────────────
# Step 1: プロジェクト設定
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 1/7: GCPプロジェクトを設定中..."
gcloud config set project "$PROJECT_ID"
gcloud config set run/region "$REGION"
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 2: 必要なAPIを有効化
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 2/7: APIを有効化中（数分かかります）..."
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  aiplatform.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  --quiet
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 3: HubSpot チャンネルIDの入力
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 3/7: HubSpotチャンネルIDを設定中..."
echo ""
echo "HubSpot管理画面 → Marketing → Social で確認できます"
echo "（接続済みのFacebook・InstagramのGUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx）"
echo ""
read -rp "Facebook チャンネルID: " FB_CHANNEL_ID
read -rp "Instagram チャンネルID: " IG_CHANNEL_ID
echo ""
echo "（XとTikTokは後で設定可能です。今は空のままEnterでスキップ）"
read -rp "X（旧Twitter）チャンネルID（任意）: " X_CHANNEL_ID
read -rp "TikTok チャンネルID（任意）: " TIKTOK_CHANNEL_ID
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 4: terraform.tfvars を生成
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 4/7: terraform.tfvarsを生成中..."
cat > terraform/terraform.tfvars <<EOF
project_id                   = "${PROJECT_ID}"
region                       = "${REGION}"
wordpress_base_url           = "https://aozora-cg.com"
wordpress_username           = "your-wp-username"
hubspot_facebook_channel_id  = "${FB_CHANNEL_ID}"
hubspot_instagram_channel_id = "${IG_CHANNEL_ID}"
hubspot_x_channel_id         = "${X_CHANNEL_ID}"
hubspot_tiktok_channel_id    = "${TIKTOK_CHANNEL_ID}"
image_url                    = "${IMAGE_URL}"
EOF
echo "✅ terraform/terraform.tfvars を生成しました"

# ──────────────────────────────────────────────
# Step 5: Terraform でインフラ構築
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 5/7: Terraformでインフラを構築中（数分かかります）..."
cd terraform
terraform init -upgrade -input=false
terraform apply -auto-approve -input=false
cd ..
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 6: HubSpotトークンをSecret Managerに登録
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 6/7: HubSpotトークンをSecret Managerに登録中..."
echo ""
echo "先ほど取得したHubSpotのアクセストークンを入力してください"
echo "（pat-na2-xxx... の形式）"
read -rs HUBSPOT_TOKEN
echo ""

if [ -n "$HUBSPOT_TOKEN" ]; then
  # 既存バージョンがある場合は新バージョンを追加、なければ作成
  if gcloud secrets describe "hubspot-access-token" --project="$PROJECT_ID" &>/dev/null; then
    echo -n "$HUBSPOT_TOKEN" | gcloud secrets versions add "hubspot-access-token" \
      --project="$PROJECT_ID" --data-file=-
    echo "✅ hubspot-access-token を更新しました"
  else
    echo -n "$HUBSPOT_TOKEN" | gcloud secrets create "hubspot-access-token" \
      --project="$PROJECT_ID" \
      --data-file=- \
      --replication-policy="automatic"
    echo "✅ hubspot-access-token を登録しました"
  fi
else
  echo "⚠ トークンの入力がありませんでした。後で以下のコマンドで登録してください:"
  echo "  bash scripts/setup-secrets.sh"
fi

# ──────────────────────────────────────────────
# Step 7: Dockerイメージをビルド＆デプロイ
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 7/7: Dockerイメージをビルド中（5〜10分かかります）..."
gcloud builds submit cloud-run-app/ \
  --tag "$IMAGE_URL" \
  --project="$PROJECT_ID" \
  --quiet
echo "✅ ビルド・プッシュ完了"

echo ""
echo "▶ Cloud Run にデプロイ中..."
gcloud run services update sns-auto-post \
  --image "$IMAGE_URL" \
  --region "$REGION" \
  --quiet
echo "✅ デプロイ完了"

# ──────────────────────────────────────────────
# 完了メッセージ
# ──────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe sns-auto-post \
  --region "$REGION" \
  --format="value(status.url)" 2>/dev/null || echo "（URLの取得に失敗しました）")

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ セットアップ完了！                    ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "サービスURL : $SERVICE_URL"
echo "ポーリングURL: ${SERVICE_URL}/poll/news"
echo ""
echo "動作確認（手動でフローBを実行）:"
echo "  curl -X POST ${SERVICE_URL}/poll/news \\"
echo "    -H \"Authorization: Bearer \$(gcloud auth print-identity-token)\""
echo ""
echo "Cloud Schedulerが30分ごとに自動実行されます。"
echo ""
