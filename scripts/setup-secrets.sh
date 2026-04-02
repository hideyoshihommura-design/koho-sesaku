#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Secret Manager 登録スクリプト（Phase A 用）
# 使い方: bash scripts/setup-secrets.sh
#
# Drive 廃止により登録項目が 4件 → 3件 に削減
# ─────────────────────────────────────────────────────────────
set -e

echo "========================================"
echo " Secret Manager 登録スクリプト (Phase A) - 登録項目: 3件"
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

# 以下は不要になりました（自動化済み）:
# - Anthropic API キー → Vertex AI 経由のため不要
# - Google サービスアカウント JSON → Workload Identity で自動処理
# - Google Drive フォルダ ID → GCS に移行したため不要

echo "【1/3】Google Chat 通知用 Incoming Webhook URL（必須）"
echo "  Google Chat のスペース → アプリと統合 → Webhook で取得"
register_secret "chat-webhook-url" "Webhook URLを入力:" false

echo "【2/3】Webアプリの秘密パス（必須）"
echo "  承認ダッシュボードのURLの一部になります（英数字16文字以上推奨）"
SUGGESTED_PATH=$(openssl rand -hex 12 2>/dev/null || echo "ランダム文字列を入力してください")
echo "  自動生成例: $SUGGESTED_PATH"
register_secret "app-secret-path" "秘密パスを入力:" true

echo "【3/3】Cloud Scheduler 認証トークン（必須）"
echo "  任意の文字列（英数字32文字以上推奨）"
echo "  自動生成例: $(openssl rand -hex 16 2>/dev/null || echo 'ランダム文字列を入力')"
register_secret "scheduler-secret" "トークンを入力:" true

echo "========================================"
echo " ✅ Secret Manager の登録が完了しました（3件）"
echo "========================================"
echo ""
echo "次のステップ: bash scripts/setup.sh でデプロイ"
