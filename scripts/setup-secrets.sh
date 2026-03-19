#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Secret Manager 登録スクリプト（個別追加・更新用）
# 使い方: bash scripts/setup-secrets.sh
# ─────────────────────────────────────────────────────────────
set -e

echo "========================================"
echo " Secret Manager 登録スクリプト"
echo "========================================"

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
  echo "❌ GCPプロジェクトが設定されていません"
  echo "  実行してください: gcloud config set project aozora-sns-auto"
  exit 1
fi
echo "✅ プロジェクト: $PROJECT_ID"
echo ""

# シークレットを登録する関数
register_secret() {
  local SECRET_NAME=$1
  local PROMPT_MSG=$2
  local IS_PASSWORD=${3:-false}

  echo "📝 $PROMPT_MSG"
  if [ "$IS_PASSWORD" = "true" ]; then
    read -rs VALUE
    echo ""
  else
    read -r VALUE
  fi

  if [ -z "$VALUE" ]; then
    echo "⚠ 入力がないためスキップしました: $SECRET_NAME"
    echo ""
    return
  fi

  if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
    echo -n "$VALUE" | gcloud secrets versions add "$SECRET_NAME" \
      --project="$PROJECT_ID" --data-file=-
    echo "✅ 更新完了: $SECRET_NAME"
  else
    echo -n "$VALUE" | gcloud secrets create "$SECRET_NAME" \
      --project="$PROJECT_ID" \
      --data-file=- \
      --replication-policy="automatic"
    echo "✅ 登録完了: $SECRET_NAME"
  fi
  echo ""
}

echo "【1/3】HubSpot プライベートアプリトークン（必須）"
echo "  取得場所: HubSpot → 設定 → 連携 → 非公開アプリ"
register_secret "hubspot-access-token" "トークンを入力 (pat-na2-xxx):" true

echo "【2/3】WordPress アプリケーションパスワード（フローAで必要）"
echo "  取得場所: WordPress管理画面 → ユーザー → プロフィール → アプリケーションパスワード"
echo "  フローBのみ使う場合はそのままEnterでスキップ"
register_secret "wordpress-app-password" "パスワードを入力（スキップ可）:" true

echo "【3/3】SendGrid APIキー（メール通知用・任意）"
echo "  Slack通知を使う場合は不要です。スキップ可。"
register_secret "sendgrid-api-key" "APIキーを入力（スキップ可）:" true

echo "========================================"
echo " ✅ Secret Manager の登録が完了しました"
echo "========================================"
