#!/bin/bash
# ─────────────────────────────────────────────────────────────
# HubSpotトークン登録スクリプト
# 使い方: bash scripts/register-token.sh トークン
# 例: bash scripts/register-token.sh pat-na2-xxxx
# ─────────────────────────────────────────────────────────────
PROJECT_ID="ozora-sns-auto"

TOKEN=$1

if [ -z "$TOKEN" ]; then
  echo "使い方: bash scripts/register-token.sh トークン"
  echo "例: bash scripts/register-token.sh pat-na2-xxxx"
  exit 1
fi

echo "HubSpotトークンを登録中..."

if gcloud secrets describe "hubspot-access-token" --project="$PROJECT_ID" &>/dev/null; then
  echo -n "$TOKEN" | gcloud secrets versions add "hubspot-access-token" \
    --project="$PROJECT_ID" --data-file=-
  echo "✅ トークンを更新しました"
else
  echo -n "$TOKEN" | gcloud secrets create "hubspot-access-token" \
    --project="$PROJECT_ID" \
    --data-file=- \
    --replication-policy="automatic"
  echo "✅ トークンを登録しました"
fi
