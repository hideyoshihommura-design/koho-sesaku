output "cloud_run_url" {
  description = "Cloud Run サービスのURL"
  value       = google_cloud_run_v2_service.app.uri
}

output "webhook_url" {
  description = "WP Webhooks プラグインに設定するURL"
  value       = "${google_cloud_run_v2_service.app.uri}/webhook/wordpress"
}

output "artifact_registry_url" {
  description = "Dockerイメージのプッシュ先URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}/app"
}

output "gcs_bucket_name" {
  description = "動画保存用GCSバケット名"
  value       = google_storage_bucket.videos.name
}

output "cloud_run_sa_email" {
  description = "Cloud Run サービスアカウントのメールアドレス"
  value       = google_service_account.cloud_run.email
}
