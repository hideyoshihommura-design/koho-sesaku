#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  SNS自動投稿システム セットアップスクリプト（完全自動）
#  使い方: bash scripts/setup.sh
# ═══════════════════════════════════════════════════════════════
set -e

PROJECT_ID="ozora-sns-auto"
REGION="asia-northeast1"
IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/sns-auto-post/app:latest"
FB_CHANNEL_ID="a4fe7798-6a1f-34e4-b864-2ef1ce370109"
IG_CHANNEL_ID="11f18f58-5a26-32a8-983c-9db401d5e0a7"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  SNS自動投稿システム セットアップ開始     ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "プロジェクトID : $PROJECT_ID"
echo "リージョン     : $REGION"
echo ""

# ──────────────────────────────────────────────
# Step 1: プロジェクト設定
# ──────────────────────────────────────────────
echo "▶ Step 1/5: GCPプロジェクトを設定中..."
gcloud config set project "$PROJECT_ID" --quiet
gcloud config set run/region "$REGION" --quiet
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 2: 必要なAPIを有効化
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 2/5: APIを有効化中（数分かかります）..."
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
# Step 3: terraform.tfvars を生成
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 3/5: 設定ファイルを生成中..."
cat > terraform/terraform.tfvars <<TFVARS
project_id                   = "${PROJECT_ID}"
region                       = "${REGION}"
wordpress_base_url           = "https://aozora-cg.com"
wordpress_username           = "your-wp-username"
hubspot_facebook_channel_id  = "${FB_CHANNEL_ID}"
hubspot_instagram_channel_id = "${IG_CHANNEL_ID}"
hubspot_x_channel_id         = ""
hubspot_tiktok_channel_id    = ""
image_url                    = "${IMAGE_URL}"
TFVARS
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 4: Terraform でインフラ構築
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 4/5: インフラを構築中（数分かかります）..."
cd terraform
terraform init -upgrade -input=false
terraform apply -auto-approve -input=false
cd ..
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 5: Dockerイメージをビルド＆デプロイ
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 5/5: アプリをビルド中（5〜10分かかります）..."
gcloud builds submit cloud-run-app/ \
  --tag "$IMAGE_URL" \
  --project="$PROJECT_ID" \
  --quiet
echo "✅ ビルド完了"

echo ""
echo "▶ Cloud Run にデプロイ中..."
gcloud run services update sns-auto-post \
  --image "$IMAGE_URL" \
  --region "$REGION" \
  --quiet
echo "✅ デプロイ完了"

# ──────────────────────────────────────────────
# 完了
# ──────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe sns-auto-post \
  --region "$REGION" \
  --format="value(status.url)" 2>/dev/null || echo "")

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ セットアップ完了！                    ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "サービスURL: $SERVICE_URL"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " 最後にHubSpotトークンを登録してください"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " bash scripts/register-token.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
