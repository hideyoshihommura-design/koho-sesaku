#!/bin/bash

# 広報施策 同期スクリプト
# GitHub と Google Drive に自動でアップロードします

FOLDER="/home/hideyoshihommura/広報施策"
cd "$FOLDER"

# コミットメッセージを引数から取得（省略時は日時）
MESSAGE="${1:-$(date '+%Y-%m-%d %H:%M') 更新}"

echo "=== GitHub に同期中 ==="
git add .
git commit -m "$MESSAGE"
git push
echo "GitHub: 完了"

echo ""
echo "=== Google Drive に同期中 ==="
rclone copy "$FOLDER" gdrive:広報施策 --exclude ".git/**" --exclude ".claude/**" -v
echo "Google Drive: 完了"

echo ""
echo "=== 同期完了 ==="
