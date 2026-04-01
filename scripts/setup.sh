#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  SNS自動投稿システム Phase A セットアップスクリプト
#  使い方: bash scripts/setup.sh
# ═══════════════════════════════════════════════════════════════
set -e

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ★ここを環境に合わせて変更してください
PROJECT_ID="ozora-sns-auto"
REGION="asia-northeast1"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/sns-auto-post/app:latest"
SA_NAME="sns-auto-post-runner"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  SNS自動投稿 Phase A セットアップ開始     ║"
echo "╚══════════════════════════════════════════╝"
echo "プロジェクト: $PROJECT_ID"
echo ""

gcloud config set project "$PROJECT_ID" --quiet

# ──────────────────────────────────────────────
# Step 1: API有効化
# ──────────────────────────────────────────────
echo "▶ Step 1/6: APIを有効化中..."
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  drive.googleapis.com \
  chat.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project="$PROJECT_ID"
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 2: Artifact Registry 作成
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 2/6: Artifact Registryを作成中..."
gcloud artifacts repositories create sns-auto-post \
  --repository-format=docker \
  --location="$REGION" \
  --project="$PROJECT_ID" \
  --quiet 2>/dev/null || echo "  （既に存在します）"
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 3: サービスアカウント作成・権限付与
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 3/6: サービスアカウントを設定中..."
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="SNS自動投稿 Cloud Run SA" \
  --project="$PROJECT_ID" 2>/dev/null || echo "  （既に存在します）"

for ROLE in \
  roles/secretmanager.secretAccessor \
  roles/datastore.user \
  roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$ROLE" \
    --quiet 2>/dev/null
done
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 4: Dockerイメージをビルド＆プッシュ
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 4/6: アプリをビルド中（5〜10分かかります）..."
gcloud builds submit cloud-run-app/ \
  --tag "$IMAGE_URL" \
  --project="$PROJECT_ID"
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 5: Cloud Run デプロイ
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 5/6: Cloud Runにデプロイ中..."
gcloud run deploy sns-auto-post \
  --image="$IMAGE_URL" \
  --region="$REGION" \
  --service-account="$SA_EMAIL" \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${PROJECT_ID}" \
  --cpu=1 \
  --memory=512Mi \
  --timeout=300 \
  --concurrency=80 \
  --min-instances=0 \
  --max-instances=10 \
  --no-allow-unauthenticated \
  --project="$PROJECT_ID" \
  --quiet
echo "✅ 完了"

# ──────────────────────────────────────────────
# Step 6: Cloud Scheduler 設定
# ──────────────────────────────────────────────
echo ""
echo "▶ Step 6/6: スケジューラーを設定中..."

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

# 処理実行: 18:00 と 23:00（日本時間）
gcloud scheduler jobs create http sns-process-1800 \
  --schedule="0 18 * * *" \
  --uri="${SERVICE_URL}/process" \
  --http-method=POST \
  --oidc-service-account-email="$SCHEDULER_SA" \
  --time-zone="Asia/Tokyo" \
  --location="$REGION" \
  --project="$PROJECT_ID" 2>/dev/null || \
gcloud scheduler jobs update http sns-process-1800 \
  --schedule="0 18 * * *" \
  --uri="${SERVICE_URL}/process" \
  --http-method=POST \
  --oidc-service-account-email="$SCHEDULER_SA" \
  --time-zone="Asia/Tokyo" \
  --location="$REGION" \
  --project="$PROJECT_ID"

gcloud scheduler jobs create http sns-process-2300 \
  --schedule="0 23 * * *" \
  --uri="${SERVICE_URL}/process" \
  --http-method=POST \
  --oidc-service-account-email="$SCHEDULER_SA" \
  --time-zone="Asia/Tokyo" \
  --location="$REGION" \
  --project="$PROJECT_ID" 2>/dev/null || \
gcloud scheduler jobs update http sns-process-2300 \
  --schedule="0 23 * * *" \
  --uri="${SERVICE_URL}/process" \
  --http-method=POST \
  --oidc-service-account-email="$SCHEDULER_SA" \
  --time-zone="Asia/Tokyo" \
  --location="$REGION" \
  --project="$PROJECT_ID"

# リマインダー: 毎日10:00（3日未承認チェック）
gcloud scheduler jobs create http sns-remind-1000 \
  --schedule="0 10 * * *" \
  --uri="${SERVICE_URL}/remind" \
  --http-method=POST \
  --oidc-service-account-email="$SCHEDULER_SA" \
  --time-zone="Asia/Tokyo" \
  --location="$REGION" \
  --project="$PROJECT_ID" 2>/dev/null || \
gcloud scheduler jobs update http sns-remind-1000 \
  --schedule="0 10 * * *" \
  --uri="${SERVICE_URL}/remind" \
  --http-method=POST \
  --oidc-service-account-email="$SCHEDULER_SA" \
  --time-zone="Asia/Tokyo" \
  --location="$REGION" \
  --project="$PROJECT_ID"

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
echo " 次のステップ:"
echo " 1. bash scripts/setup-secrets.sh でシークレットを登録"
echo " 2. Google Chat App の設定で以下のURLを登録:"
echo "    ${SERVICE_URL}/webhook/google-chat"
echo " 3. ヘルスチェック確認:"
echo "    curl ${SERVICE_URL}/health"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
