#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Cloud Run 再デプロイスクリプト（コード更新時に使用）
# 使い方: bash scripts/deploy.sh
# ─────────────────────────────────────────────────────────────
set -e

echo "========================================"
echo " SNS自動投稿システム 再デプロイスクリプト"
echo "========================================"

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION=$(gcloud config get-value run/region 2>/dev/null)
REGION=${REGION:-"asia-northeast1"}

if [ -z "$PROJECT_ID" ]; then
  echo "❌ GCPプロジェクトが設定されていません"
  echo "  実行してください: gcloud config set project aozora-sns-auto"
  exit 1
fi

IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/sns-auto-post/app:latest"

echo "✅ プロジェクト : $PROJECT_ID"
echo "✅ リージョン   : $REGION"
echo "✅ イメージURL  : $IMAGE_URL"
echo ""
read -rp "上記の設定でデプロイを開始しますか？ (y/N): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "キャンセルしました"
  exit 0
fi

# ─────────────────────────────────
# Step 1: Cloud Build でイメージをビルド＆プッシュ
# ─────────────────────────────────
echo ""
echo "▶ Step 1/2: Dockerイメージをビルド中（5〜10分かかります）..."
gcloud builds submit cloud-run-app/ \
  --tag "$IMAGE_URL" \
  --project="$PROJECT_ID" \
  --quiet
echo "✅ ビルド・プッシュ完了"

# ─────────────────────────────────
# Step 2: Cloud Run サービスを更新
# ─────────────────────────────────
echo ""
echo "▶ Step 2/2: Cloud Run を更新中..."
gcloud run services update sns-auto-post \
  --image "$IMAGE_URL" \
  --region "$REGION" \
  --quiet
echo "✅ Cloud Run 更新完了"

# ─────────────────────────────────
# 結果表示
# ─────────────────────────────────
SERVICE_URL=$(gcloud run services describe sns-auto-post \
  --region "$REGION" \
  --format="value(status.url)")

echo ""
echo "========================================"
echo " ✅ デプロイ完了！"
echo "========================================"
echo ""
echo "サービスURL  : $SERVICE_URL"
echo "ポーリングURL: ${SERVICE_URL}/poll/news"
echo ""
echo "動作確認:"
echo "  curl -X POST ${SERVICE_URL}/poll/news \\"
echo "    -H \"Authorization: Bearer \$(gcloud auth print-identity-token)\""
