terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ──────────────────────────────────────────────────────
# 必要なAPIの有効化
# ──────────────────────────────────────────────────────
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "cloudscheduler.googleapis.com",
    "pubsub.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "aiplatform.googleapis.com",
    "drive.googleapis.com",
    "artifactregistry.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}

# ──────────────────────────────────────────────────────
# Artifact Registry（Dockerイメージ管理）
# ──────────────────────────────────────────────────────
resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = "sns-auto-post"
  format        = "DOCKER"
  description   = "SNS自動投稿システム Dockerイメージ"
  depends_on    = [google_project_service.apis]
}

# ──────────────────────────────────────────────────────
# Cloud Storage（動画バックアップ）
# ──────────────────────────────────────────────────────
resource "google_storage_bucket" "videos" {
  name          = "${var.project_id}-sns-videos"
  location      = var.region
  force_destroy = false

  lifecycle_rule {
    condition { age = 30 } # 30日後に自動削除
    action { type = "Delete" }
  }
}

# ──────────────────────────────────────────────────────
# Cloud Storage（フローB: 投稿済みURL管理）
# ──────────────────────────────────────────────────────
resource "google_storage_bucket" "state" {
  name          = "${var.project_id}-sns-state"
  location      = var.region
  force_destroy = false
}

# ──────────────────────────────────────────────────────
# Secret Manager（APIキー管理）
# ──────────────────────────────────────────────────────
locals {
  secret_names = [
    "wordpress-app-password",
    "hubspot-access-token",
    "tiktok-access-token",
    "google-drive-service-account",
    "lifull-login-email",      # 別フロー（LIFULL介護）用
    "lifull-login-password",   # 別フロー（LIFULL介護）用
    "sendgrid-api-key",        # メール通知（任意）
  ]
}

resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(local.secret_names)
  secret_id = each.value
  replication { auto {} }
  depends_on = [google_project_service.apis]
}

# ──────────────────────────────────────────────────────
# Cloud Run サービスアカウント
# ──────────────────────────────────────────────────────
resource "google_service_account" "cloud_run" {
  account_id   = "sns-auto-post-runner"
  display_name = "SNS自動投稿 Cloud Run SA"
}

# Cloud Run SA に必要な権限を付与
resource "google_project_iam_member" "cloud_run_roles" {
  for_each = toset([
    "roles/secretmanager.secretAccessor",   # Secret Manager 読み取り
    "roles/storage.objectAdmin",            # GCS 動画保存
    "roles/aiplatform.user",                # Vertex AI 使用
    "roles/logging.logWriter",             # Cloud Logging
    "roles/monitoring.metricWriter",        # Cloud Monitoring
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# ──────────────────────────────────────────────────────
# Cloud Run サービス
# ──────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "app" {
  name     = "sns-auto-post"
  location = var.region

  template {
    service_account = google_service_account.cloud_run.email

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = var.image_url

      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi" # Playwright + 動画処理のため多めに確保
        }
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "WORDPRESS_BASE_URL"
        value = var.wordpress_base_url
      }
      env {
        name  = "WORDPRESS_USERNAME"
        value = var.wordpress_username
      }
      env {
        name  = "HUBSPOT_FACEBOOK_CHANNEL_ID"
        value = var.hubspot_facebook_channel_id
      }
      env {
        name  = "HUBSPOT_INSTAGRAM_CHANNEL_ID"
        value = var.hubspot_instagram_channel_id
      }
      env {
        name  = "HUBSPOT_X_CHANNEL_ID"
        value = var.hubspot_x_channel_id
      }
      env {
        name  = "HUBSPOT_TIKTOK_CHANNEL_ID"
        value = var.hubspot_tiktok_channel_id
      }
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.videos.name
      }
      env {
        name  = "GCS_STATE_BUCKET"
        value = google_storage_bucket.state.name
      }
      env {
        name  = "OSHIRASE_PAGE_URL"
        value = "https://aozora-cg.com/news/"
      }
      # Slack通知（任意）
      dynamic "env" {
        for_each = var.slack_webhook_url != "" ? [1] : []
        content {
          name  = "SLACK_WEBHOOK_URL"
          value = var.slack_webhook_url
        }
      }
      # メール通知先（任意）
      dynamic "env" {
        for_each = var.notify_email != "" ? [1] : []
        content {
          name  = "NOTIFY_EMAIL_TO"
          value = var.notify_email
        }
      }
    }

    timeout = "600s" # Veo 3.1 動画生成に時間がかかるため10分
  }

  depends_on = [google_project_service.apis]
}

# Cloud Run への未認証アクセスを禁止（Scheduler SA のみ許可）
resource "google_cloud_run_v2_service_iam_member" "no_public_access" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.cloud_run.email}"
}

# ──────────────────────────────────────────────────────
# Cloud Scheduler（フローA: 毎朝9:00）
# ──────────────────────────────────────────────────────
resource "google_service_account" "scheduler" {
  account_id   = "sns-scheduler"
  display_name = "SNS自動投稿 Scheduler SA"
}

resource "google_cloud_run_v2_service_iam_member" "scheduler_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

resource "google_cloud_scheduler_job" "daily_queue" {
  name             = "sns-daily-queue-processor"
  description      = "毎朝9:00にフローAのキュー処理を実行"
  schedule         = "0 9 * * *"
  time_zone        = "Asia/Tokyo"
  attempt_deadline = "600s"

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.app.uri}/queue/process"

    oidc_token {
      service_account_email = google_service_account.scheduler.email
    }
  }

  depends_on = [google_project_service.apis]
}

# ──────────────────────────────────────────────────────
# Cloud Scheduler（フローB: 30分ごとにお知らせページをポーリング）
# ──────────────────────────────────────────────────────
resource "google_cloud_scheduler_job" "news_poll" {
  name             = "sns-news-poller"
  description      = "30分ごとにaozora-cg.comのお知らせページをチェックしてSNS投稿"
  schedule         = "*/30 * * * *"
  time_zone        = "Asia/Tokyo"
  attempt_deadline = "600s"

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.app.uri}/poll/news"

    oidc_token {
      service_account_email = google_service_account.scheduler.email
    }
  }

  depends_on = [google_project_service.apis]
}

# ──────────────────────────────────────────────────────
# Cloud Monitoring アラート（エラー通知）
# ──────────────────────────────────────────────────────
resource "google_monitoring_alert_policy" "error_alert" {
  display_name = "SNS自動投稿 エラーアラート"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run エラーログ"
    condition_matched_log {
      filter = <<-EOT
        resource.type="cloud_run_revision"
        resource.labels.service_name="sns-auto-post"
        severity="ERROR"
      EOT
    }
  }

  notification_channels = []  # メール通知を追加する場合はここにチャンネルIDを設定

  alert_strategy {
    notification_rate_limit { period = "300s" } # 5分に1回
  }
}
