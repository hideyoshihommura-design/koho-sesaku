#!/bin/bash
# ─────────────────────────────────────────────────────────────
# ローカル動作テスト用スクリプト
# Cloud Run にデプロイせずに各エンドポイントの動作を確認する
#
# 使い方:
#   bash scripts/test-webhook.sh [BASE_URL]
#
# 例（ローカル）:
#   bash scripts/test-webhook.sh http://localhost:8080
#
# 例（本番）:
#   bash scripts/test-webhook.sh https://sns-auto-post-ozora-sns-auto.a.run.app
# ─────────────────────────────────────────────────────────────
set -e

BASE_URL="${1:-http://localhost:8080}"
PASS=0
FAIL=0

echo "========================================"
echo " SNS自動投稿システム 動作テスト"
echo " 対象URL: $BASE_URL"
echo "========================================"
echo ""

# ヘルパー関数
check() {
  local name="$1"
  local status="$2"
  local expected="$3"
  if [ "$status" -eq "$expected" ]; then
    echo "  ✅ $name (HTTP $status)"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name (HTTP $status, expected $expected)"
    FAIL=$((FAIL+1))
  fi
}

# ──────────────────────────────────────────────
# 1. ヘルスチェック
# ──────────────────────────────────────────────
echo "【1】ヘルスチェック"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
check "/health" "$STATUS" 200
BODY=$(curl -s "$BASE_URL/health")
echo "     レスポンス: $BODY"
echo ""

# ──────────────────────────────────────────────
# 2. Google Chat Webhook（テキストのみ・添付なし → スキップされる）
# ──────────────────────────────────────────────
echo "【2】Google Chat Webhook - テキストのみ（添付なし）"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/webhook/google-chat" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "MESSAGE",
    "message": {
      "name": "spaces/test/messages/msg1",
      "text": "テストメッセージ",
      "sender": { "displayName": "テストユーザー" },
      "createTime": "2026-01-01T10:00:00Z",
      "attachments": []
    }
  }')
check "/webhook/google-chat (添付なし → 200スキップ)" "$STATUS" 200
echo ""

# ──────────────────────────────────────────────
# 3. Google Chat Webhook（画像添付あり）
# ──────────────────────────────────────────────
echo "【3】Google Chat Webhook - 画像添付あり（GCS保存・Firestore登録）"
echo "  ※ GCS/Firestore への実際の書き込みが発生します"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/webhook/google-chat" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "MESSAGE",
    "message": {
      "name": "spaces/test/messages/msg2",
      "text": "あおぞら博多 本日のレクリエーションの様子です。顔出しOK",
      "sender": { "displayName": "田中スタッフ" },
      "createTime": "2026-01-01T10:00:00Z",
      "attachments": [
        {
          "name": "spaces/test/messages/msg2/attachments/att1",
          "contentName": "photo1.jpg",
          "contentType": "image/jpeg",
          "attachmentDataRef": {
            "resourceName": "spaces/test/messages/msg2/attachments/att1"
          }
        }
      ]
    }
  }')
check "/webhook/google-chat (画像あり → 200即返し)" "$STATUS" 200
echo ""

# ──────────────────────────────────────────────
# 4. ADDED_TO_SPACE イベント
# ──────────────────────────────────────────────
echo "【4】ADDED_TO_SPACE イベント"
BODY=$(curl -s -X POST "$BASE_URL/webhook/google-chat" \
  -H "Content-Type: application/json" \
  -d '{"type": "ADDED_TO_SPACE", "space": {"name": "spaces/test"}}')
echo "  レスポンス: $BODY"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/webhook/google-chat" \
  -H "Content-Type: application/json" \
  -d '{"type": "ADDED_TO_SPACE", "space": {"name": "spaces/test"}}')
check "/webhook/google-chat (ADDED_TO_SPACE)" "$STATUS" 200
echo ""

# ──────────────────────────────────────────────
# 5. 不正なパスは 404
# ──────────────────────────────────────────────
echo "【5】不正なパス → 404"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/unknown-path")
check "不正パス → 404" "$STATUS" 404
echo ""

# ──────────────────────────────────────────────
# 6. /process 認証なし → 401
# ──────────────────────────────────────────────
echo "【6】/process 認証なし → 401"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/process")
check "/process (認証なし → 401)" "$STATUS" 401
echo ""

# ──────────────────────────────────────────────
# 結果サマリ
# ──────────────────────────────────────────────
echo "========================================"
echo " テスト結果: ✅ ${PASS}件成功 / ❌ ${FAIL}件失敗"
echo "========================================"

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "⚠️  失敗したテストがあります。サーバーが起動しているか確認してください。"
  echo "   ローカル起動: cd cloud-run-app && npm run dev"
  exit 1
fi
