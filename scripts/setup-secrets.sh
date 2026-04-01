#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Secret Manager 登録スクリプト（Phase A 用）
# 使い方: bash scripts/setup-secrets.sh
# ─────────────────────────────────────────────────────────────
set -e

echo "========================================"
echo " Secret Manager 登録スクリプト (Phase A)"
echo "========================================"

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
  echo "❌ GCPプロジェクトが設定されていません"
  echo "  実行してください: gcloud config set project ozora-sns-auto"
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

echo "【1/6】Anthropic APIキー（必須）"
echo "  取得場所: https://console.anthropic.com → API Keys"
register_secret "anthropic-api-key" "APIキーを入力 (sk-ant-xxx):" true

echo "【2/6】Google サービスアカウント JSON（必須）"
echo "  Google Cloud Console → IAM → サービスアカウント → キー → JSONで作成"
echo "  Drive / Sheets 両方のアクセス権を付与してください"
echo "  ファイルパスを入力してください（例: ~/Downloads/sa-key.json）:"
read -r SA_FILE_PATH
SA_FILE_PATH="${SA_FILE_PATH/#\~/$HOME}"
if [ -f "$SA_FILE_PATH" ]; then
  if gcloud secrets describe "google-service-account" --project="$PROJECT_ID" &>/dev/null; then
    gcloud secrets versions add "google-service-account" \
      --project="$PROJECT_ID" --data-file="$SA_FILE_PATH"
  else
    gcloud secrets create "google-service-account" \
      --project="$PROJECT_ID" \
      --data-file="$SA_FILE_PATH" \
      --replication-policy="automatic"
  fi
  echo "✅ 登録完了: google-service-account"
else
  echo "⚠ ファイルが見つかりません。スキップしました。"
fi
echo ""

echo "【3/6】Google Chat 通知用 Incoming Webhook URL（必須）"
echo "  Google Chat のスペースで設定 → アプリと統合 → Webhook"
register_secret "chat-webhook-url" "Webhook URLを入力:" false

echo "【4/6】Google Drive フォルダID（必須）"
echo "  素材を保存するフォルダのURL末尾の文字列"
echo "  例: https://drive.google.com/drive/folders/[ここ]"
register_secret "drive-folder-id" "DriveフォルダIDを入力:" false

echo "【5/6】Webアプリの秘密パス（必須）"
echo "  承認ダッシュボードのURLの一部になります（英数字16文字以上推奨）"
SUGGESTED_PATH=$(openssl rand -hex 12 2>/dev/null || echo "ランダム文字列を入力してください")
echo "  例: $SUGGESTED_PATH"
register_secret "app-secret-path" "秘密パスを入力:" true

echo "【6/6】Cloud Scheduler 認証トークン（必須）"
echo "  任意の文字列（英数字32文字以上推奨）を設定してください"
echo "  例: openssl rand -hex 32 で生成した文字列"
register_secret "scheduler-secret" "トークンを入力:" true

echo "========================================"
echo " ✅ Secret Manager の登録が完了しました"
echo "========================================"
echo ""
echo "次のステップ: Cloud Run を再デプロイしてシークレットを反映"
echo "  bash scripts/setup.sh"
