variable "project_id" {
  description = "GCP プロジェクトID"
  type        = string
}

variable "region" {
  description = "Cloud Run デプロイリージョン"
  type        = string
  default     = "asia-northeast1" # 東京
}

variable "wordpress_base_url" {
  description = "WordPress サイトのURL（例: https://example.com）"
  type        = string
}

variable "wordpress_username" {
  description = "WordPress ユーザー名"
  type        = string
}

variable "hubspot_facebook_channel_id" {
  description = "HubSpot Facebook チャンネルGUID"
  type        = string
}

variable "hubspot_instagram_channel_id" {
  description = "HubSpot Instagram チャンネルGUID"
  type        = string
}

variable "lifull_api_base_url" {
  description = "LIFULL介護 パートナーAPI URL（APIが提供された場合のみ）"
  type        = string
  default     = ""
}

variable "image_url" {
  description = "Artifact Registry のDockerイメージURL"
  type        = string
  # 例: asia-northeast1-docker.pkg.dev/PROJECT_ID/sns-auto-post/app:latest
}

variable "slack_webhook_url" {
  description = "Slack Incoming Webhook URL（通知用・任意）"
  type        = string
  default     = ""
}

variable "notify_email" {
  description = "エラー・完了通知の送信先メールアドレス（任意）"
  type        = string
  default     = ""
}
