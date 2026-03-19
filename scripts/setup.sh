#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  SNS自動投稿システム セットアップスクリプト
#  Terraformを使わずgcloudコマンドで直接構築
#  使い方: bash scripts/setup.sh
# ═══════════════════════════════════════════════════════════════
set -e

PROJECT_ID="ozora-sns-auto"
REGION="asia-northeast1"
IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/sns-auto-post/app:latest"
FB_CHANNEL_ID="a4fe7798-6a1f-34e4-b864-2ef1ce370109"
IG_CHANNEL_ID="11f18f58-5a26-32a8-983c-9db401d5e0a7"
SA_NAME="sns-auto-post-runner"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  SNS自動投稿システム セットアップ開始     ║"
echo "╚══════════════════════════════════════════╝"
echo "プロジェクト: $PROJECT_ID"
echo ""

gcloud config set project "$PROJECT_ID" --quiet

# ──────────────────────────────────────────────
# Step 1: API有効化
# ──────────────────────────────────────────────
echo "▶ Step 1/7: APIを有効化中..."
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  aiplatform.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project="$PROJECT_ID"
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 2: Artifact Registry 作成
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 2/7: Artifact Registryを作成中..."
gcloud artifacts repositories create sns-auto-post \
  --repository-format=docker \
  --location="$REGION" \
  --project="$PROJECT_ID" \
  --quiet 2>/dev/null || echo "  （既に存在します）"
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 3: Cloud Storage バケット作成
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 3/7: Cloud Storageバケットを作成中..."
gcloud storage buckets create "gs://${PROJECT_ID}-sns-videos" \
  --location="$REGION" \
  --project="$PROJECT_ID" 2>/dev/null || echo "  （既に存在します）"
gcloud storage buckets create "gs://${PROJECT_ID}-sns-state" \
  --location="$REGION" \
  --project="$PROJECT_ID" 2>/dev/null || echo "  （既に存在します）"
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 4: サービスアカウント作成・権限付与
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 4/7: サービスアカウントを設定中..."
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="SNS自動投稿 Cloud Run SA" \
  --project="$PROJECT_ID" 2>/dev/null || echo "  （既に存在します）"

for ROLE in \
  roles/secretmanager.secretAccessor \
  roles/storage.objectAdmin \
  roles/aiplatform.user \
  roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" \
    --quiet 2>/dev/null
done
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 5: Dockerイメージをビルド＆プッシュ
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 5/7: アプリをビルド中（5〜10分かかります）..."
gcloud builds submit cloud-run-app/ \
  --tag "$IMAGE_URL" \
  --project="$PROJECT_ID"
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 6: Cloud Run デプロイ
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 6/7: Cloud Runにデプロイ中..."
gcloud run deploy sns-auto-post \
  --image="$IMAGE_URL" \
  --region="$REGION" \
  --service-account="$SA_EMAIL" \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT_ID},WORDPRESS_BASE_URL=https://aozora-cg.com,WORDPRESS_USERNAME=your-wp-username,HUBSPOT_FACEBOOK_CHANNEL_ID=${FB_CHANNEL_ID},HUBSPOT_INSTAGRAM_CHANNEL_ID=${IG_CHANNEL_ID},HUBSPOT_X_CHANNEL_ID=,HUBSPOT_TIKTOK_CHANNEL_ID=,GCS_BUCKET=${PROJECT_ID}-sns-videos,GCS_STATE_BUCKET=${PROJECT_ID}-sns-state,OSHIRASE_PAGE_URL=https://aozora-cg.com/news/" \
  --cpu=2 \
  --memory=2Gi \
  --timeout=600 \
  --no-allow-unauthenticated \
  --project="$PROJECT_ID" \
  --quiet
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 7: Cloud Scheduler 設定
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 7/7: 30分ごとの自動実行を設定中..."

SERVICE_URL=$(gcloud run services describe sns-auto-post \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="value(status.url)")

# Scheduler用サービスアカウント
gcloud iam service-accounts create "sns-scheduler" \
  --display-name="SNS自動投稿 Scheduler SA" \
  --project="$PROJECT_ID" 2>/dev/null || echo "  （既に存在します）"

SCHEDULER_SA="sns-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud run services add-iam-policy-binding sns-auto-post \
  --region="$REGION" \
  --member="serviceAccount:${SCHEDULER_SA}" \
  --role="roles/run.invoker" \
  --project="$PROJECT_ID" \
  --quiet

gcloud scheduler jobs create http sns-news-poller \
  --schedule="*/30 * * * *" \
  --uri="${SERVICE_URL}/poll/news" \
  --http-method=POST \
  --oidc-service-account-email="$SCHEDULER_SA" \
  --time-zone="Asia/Tokyo" \
  --location="$REGION" \
  --project="$PROJECT_ID" 2>/dev/null || echo "  （既に存在します）"

echo "✅ 完了"

# ──────────────────────────────────────────────
# 完了
# ──────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ セットアップ完了！                    ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "サービスURL: $SERVICE_URL"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " 最後にHubSpotトークンを登録してください"
echo " bash scripts/register-token.sh 新しいトークン"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
