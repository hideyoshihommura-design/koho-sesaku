#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Secret Manager 一括登録スクリプト
# 使い方: bash scripts/setup-secrets.sh
# ─────────────────────────────────────────────────────────────
set -e

echo "========================================"
echo " Secret Manager 登録スクリプト"
echo "========================================"

# プロジェクトIDの確認
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
  echo "❌ GCPプロジェクトが設定されていません"
  echo "  実行してください: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi
echo "✅ プロジェクト: $PROJECT_ID"
echo ""

# シークレットを登録する関数
register_secret() {
  local SECRET_NAME=$1
  local PROMPT_MSG=$2
  local IS_PASSWORD=${3:-false}

  # すでに存在するか確認
  if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
    echo "⏭ $SECRET_NAME は登録済みです（スキップ）"
    return
  fi

  echo "📝 $PROMPT_MSG"
  if [ "$IS_PASSWORD" = "true" ]; then
    read -rs VALUE
    echo ""
  else
    read -r VALUE
  fi

  if [ -z "$VALUE" ]; then
    echo "⚠ 入力がないためスキップしました: $SECRET_NAME"
    return
  fi

  echo -n "$VALUE" | gcloud secrets create "$SECRET_NAME" \
    --project="$PROJECT_ID" \
    --data-file=- \
    --replication-policy="automatic"
  echo "✅ 登録完了: $SECRET_NAME"
  echo ""
}

# ─────────────────────────────────
# 各シークレットの登録
# ─────────────────────────────────

echo "【1/7】WordPress アプリケーションパスワード"
echo "  取得場所: WordPress管理画面 → ユーザー → プロフィール → アプリケーションパスワード"
register_secret "wordpress-app-password" "パスワードを入力（スペース区切りのまま）:" true

echo "【2/7】HubSpot プライベートアプリトークン"
echo "  取得場所: HubSpot → 設定 → インテグレーション → プライベートアプリ"
register_secret "hubspot-access-token" "トークンを入力 (pat-na1-xxx):" true

echo "【3/7】TikTok アクセストークン"
echo "  取得場所: TikTok for Developers → My Apps → 審査通過後に発行"
echo "  ※審査中の場合は 'skip' と入力してください"
register_secret "tiktok-access-token" "トークンを入力（審査中なら skip）:" true

echo "【4/7】LIFULL介護 ログイン情報"
register_secret "lifull-login-email" "ログインメールアドレスを入力:"
register_secret "lifull-login-password" "ログインパスワードを入力:" true

echo "【5/7】Google Drive サービスアカウントキー"
echo "  取得場所: GCP → IAM → サービスアカウント → キーを作成（JSON）"
echo "  JSONファイルのパスを入力してください"
read -r SA_KEY_PATH
if [ -f "$SA_KEY_PATH" ]; then
  if gcloud secrets describe "google-drive-service-account" --project="$PROJECT_ID" &>/dev/null; then
    echo "⏭ google-drive-service-account は登録済みです（スキップ）"
  else
    gcloud secrets create "google-drive-service-account" \
      --project="$PROJECT_ID" \
      --data-file="$SA_KEY_PATH" \
      --replication-policy="automatic"
    echo "✅ 登録完了: google-drive-service-account"
  fi
else
  echo "⚠ ファイルが見つかりません。スキップします"
fi
echo ""

echo "【6/7】Webhook認証トークン（自動生成）"
WEBHOOK_SECRET=$(openssl rand -hex 32)
if gcloud secrets describe "webhook-secret" --project="$PROJECT_ID" &>/dev/null; then
  echo "⏭ webhook-secret は登録済みです（スキップ）"
else
  echo -n "$WEBHOOK_SECRET" | gcloud secrets create "webhook-secret" \
    --project="$PROJECT_ID" \
    --data-file=- \
    --replication-policy="automatic"
  echo "✅ 登録完了: webhook-secret"
  echo "  ⚠ このトークンをWP Webhooksの認証ヘッダーに設定してください:"
  echo "    X-Webhook-Secret: $WEBHOOK_SECRET"
fi
echo ""

echo "【7/7】SendGrid APIキー（メール通知用・任意）"
echo "  不要な場合はそのままEnterを押してください"
register_secret "sendgrid-api-key" "APIキーを入力（任意・スキップ可）:" true

echo ""
echo "========================================"
echo " ✅ Secret Manager の登録が完了しました"
echo "========================================"
echo ""
echo "次のステップ: bash scripts/deploy.sh を実行してください"
