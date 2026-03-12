#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Cloud Run デプロイ自動化スクリプト
# 使い方: bash scripts/deploy.sh
# ─────────────────────────────────────────────────────────────
set -e

echo "========================================"
echo " SNS自動投稿システム デプロイスクリプト"
echo "========================================"

# ─────────────────────────────────
# 設定の確認
# ─────────────────────────────────
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION=$(gcloud config get-value run/region 2>/dev/null || echo "asia-northeast1")

if [ -z "$PROJECT_ID" ]; then
  echo "❌ GCPプロジェクトが設定されていません"
  echo "  実行してください: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

echo "✅ プロジェクト: $PROJECT_ID"
echo "✅ リージョン:   $REGION"
echo ""

IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/sns-auto-post/app:latest"
echo "Dockerイメージ: $IMAGE_URL"
echo ""

read -rp "上記の設定でデプロイを開始しますか？ (y/N): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "キャンセルしました"
  exit 0
fi

# ─────────────────────────────────
# Step 1: Artifact Registry 認証
# ─────────────────────────────────
echo ""
echo "▶ Step 1: Artifact Registry に認証中..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
echo "✅ 認証完了"

# ─────────────────────────────────
# Step 2: TypeScript ビルド
# ─────────────────────────────────
echo ""
echo "▶ Step 2: TypeScript をビルド中..."
cd cloud-run-app
npm run build
echo "✅ ビルド完了"

# ─────────────────────────────────
# Step 3: Dockerイメージをビルド
# ─────────────────────────────────
echo ""
echo "▶ Step 3: Dockerイメージをビルド中..."
docker build -t "$IMAGE_URL" .
echo "✅ イメージビルド完了"

# ─────────────────────────────────
# Step 4: Artifact Registry にプッシュ
# ─────────────────────────────────
echo ""
echo "▶ Step 4: Artifact Registry にプッシュ中..."
docker push "$IMAGE_URL"
echo "✅ プッシュ完了"

# ─────────────────────────────────
# Step 5: Cloud Run サービスを更新
# ─────────────────────────────────
echo ""
echo "▶ Step 5: Cloud Run を更新中..."
gcloud run services update sns-auto-post \
  --image "$IMAGE_URL" \
  --region "$REGION" \
  --quiet
echo "✅ Cloud Run 更新完了"

# ─────────────────────────────────
# デプロイ結果の表示
# ─────────────────────────────────
echo ""
SERVICE_URL=$(gcloud run services describe sns-auto-post \
  --region "$REGION" \
  --format="value(status.url)")

echo "========================================"
echo " ✅ デプロイ完了！"
echo "========================================"
echo ""
echo "サービスURL: $SERVICE_URL"
echo "Webhook URL: ${SERVICE_URL}/webhook/wordpress"
echo ""
echo "ヘルスチェック確認:"
curl -s "${SERVICE_URL}/health" || echo "（認証が必要な場合はブラウザで確認してください）"
echo ""
echo "次のステップ:"
echo "  1. WP Webhooks プラグインに以下を設定"
echo "     URL: ${SERVICE_URL}/webhook/wordpress"
echo "  2. Google Drive に「投稿素材_キュー」フォルダを作成"
echo "  3. テスト投稿を実行してください"
