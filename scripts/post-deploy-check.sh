#!/bin/bash
# ─────────────────────────────────────────────────────────────
# デプロイ後チェックスクリプト
# setup.sh 実行後にこのスクリプトを実行して動作確認する
#
# 使い方: bash scripts/post-deploy-check.sh
# ─────────────────────────────────────────────────────────────
set -e

export PATH="$PATH:/tmp/google-cloud-sdk/bin"

PROJECT_ID="ozora-sns-auto"
REGION="asia-northeast1"
SERVICE_NAME="sns-auto-post"
PASS=0
FAIL=0

echo "========================================"
echo " デプロイ後チェック"
echo " プロジェクト: $PROJECT_ID"
echo "========================================"
echo ""

check() {
  local name="$1"; local result="$2"; local expected="$3"
  if [ "$result" = "$expected" ]; then
    echo "  ✅ $name"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name"
    echo "     期待値: $expected"
    echo "     実際値: $result"
    FAIL=$((FAIL+1))
  fi
}

# ──────────────────────────────────────────────
# 1. Cloud Run サービスの確認
# ──────────────────────────────────────────────
echo "【1】Cloud Run サービス"
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format="value(status.url)" 2>/dev/null || echo "")

if [ -z "$SERVICE_URL" ]; then
  echo "  ❌ Cloud Run サービスが見つかりません"
  FAIL=$((FAIL+1))
else
  echo "  ✅ サービスURL: $SERVICE_URL"
  PASS=$((PASS+1))
fi
echo ""

# ──────────────────────────────────────────────
# 2. ヘルスチェック
# ──────────────────────────────────────────────
echo "【2】ヘルスチェック (/health)"
if [ -n "$SERVICE_URL" ]; then
  TOKEN=$(gcloud auth print-identity-token 2>/dev/null || echo "")
  if [ -n "$TOKEN" ]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer $TOKEN" "$SERVICE_URL/health")
    check "/health → 200" "$STATUS" "200"
    BODY=$(curl -s -H "Authorization: Bearer $TOKEN" "$SERVICE_URL/health")
    echo "     レスポンス: $BODY"
  else
    echo "  ⚠️  IDトークン取得失敗（gcloud auth login が必要かもしれません）"
  fi
fi
echo ""

# ──────────────────────────────────────────────
# 3. Secret Manager の確認
# ──────────────────────────────────────────────
echo "【3】Secret Manager"
for SECRET in "chat-webhook-url" "app-secret-path" "scheduler-secret"; do
  RESULT=$(gcloud secrets versions access latest \
    --secret="$SECRET" --project="$PROJECT_ID" 2>/dev/null | wc -c | tr -d ' ')
  if [ "$RESULT" -gt "0" ]; then
    echo "  ✅ $SECRET（登録済み）"
    PASS=$((PASS+1))
  else
    echo "  ❌ $SECRET（未登録または空）"
    FAIL=$((FAIL+1))
  fi
done
echo ""

# ──────────────────────────────────────────────
# 4. GCS バケットの確認
# ──────────────────────────────────────────────
echo "【4】GCS バケット"
BUCKET="${PROJECT_ID}-sns-videos"
if gcloud storage buckets describe "gs://$BUCKET" --project="$PROJECT_ID" &>/dev/null; then
  echo "  ✅ gs://$BUCKET（存在します）"
  PASS=$((PASS+1))
else
  echo "  ❌ gs://$BUCKET（見つかりません）"
  FAIL=$((FAIL+1))
fi
echo ""

# ──────────────────────────────────────────────
# 5. Firestore インデックスの確認
# ──────────────────────────────────────────────
echo "【5】Firestore インデックス"
INDEX_COUNT=$(gcloud firestore indexes composite list \
  --project="$PROJECT_ID" 2>/dev/null | grep -c "generationStatus" || echo "0")
if [ "$INDEX_COUNT" -ge "1" ]; then
  echo "  ✅ 複合インデックスが作成されています（${INDEX_COUNT}件）"
  PASS=$((PASS+1))
else
  echo "  ❌ 複合インデックスが見つかりません"
  echo "     → setup.sh を再実行してください"
  FAIL=$((FAIL+1))
fi
echo ""

# ──────────────────────────────────────────────
# 6. Cloud Scheduler の確認
# ──────────────────────────────────────────────
echo "【6】Cloud Scheduler"
for JOB in "sns-process-1800" "sns-process-2300" "sns-remind-1000"; do
  STATE=$(gcloud scheduler jobs describe "$JOB" \
    --location="$REGION" --project="$PROJECT_ID" \
    --format="value(state)" 2>/dev/null || echo "NOT_FOUND")
  if [ "$STATE" = "ENABLED" ]; then
    echo "  ✅ $JOB（ENABLED）"
    PASS=$((PASS+1))
  else
    echo "  ❌ $JOB（$STATE）"
    FAIL=$((FAIL+1))
  fi
done
echo ""

# ──────────────────────────────────────────────
# 7. Webアプリ URL の表示
# ──────────────────────────────────────────────
echo "【7】Webアプリ URL"
if [ -n "$SERVICE_URL" ]; then
  SECRET_PATH=$(gcloud secrets versions access latest \
    --secret="app-secret-path" --project="$PROJECT_ID" 2>/dev/null || echo "（取得失敗）")
  echo "  承認ダッシュボード:"
  echo "  👉 $SERVICE_URL/app/$SECRET_PATH"
fi
echo ""

# ──────────────────────────────────────────────
# 8. Google Chat Webhook 登録確認
# ──────────────────────────────────────────────
echo "【8】Google Chat Bot 設定"
if [ -n "$SERVICE_URL" ]; then
  echo "  以下のURLをGoogle Chat APIに登録してください:"
  echo "  👉 $SERVICE_URL/webhook/google-chat"
fi
echo ""

# ──────────────────────────────────────────────
# 結果サマリ
# ──────────────────────────────────────────────
echo "========================================"
echo " チェック結果: ✅ ${PASS}件OK / ❌ ${FAIL}件NG"
echo "========================================"

if [ $FAIL -eq 0 ]; then
  echo ""
  echo "🎉 全チェック通過！システムは正常に動作しています。"
  echo ""
  echo "次のステップ:"
  echo "  1. Google Chat のテスト用スペースに写真を送ってみる"
  echo "  2. 18:00 または 23:00 の自動処理を待つ（または手動トリガー）"
  echo "  3. 承認ダッシュボードで結果を確認する"
else
  echo ""
  echo "⚠️  ${FAIL}件の問題があります。上記のエラーを確認してください。"
  exit 1
fi
