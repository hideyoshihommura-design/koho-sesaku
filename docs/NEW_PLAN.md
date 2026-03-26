# SNS自動投稿システム 新計画

## 概要

Google Driveの素材をもとに、AI（Claude API・Vertex AI Veo）で文章・動画を自動生成し、
担当者の承認を経てWordPress・Facebook・Instagram・TikTokへ自動投稿するシステム。
投稿後は各SNSの分析データを収集し、Claude APIで次の投稿を最適化する。

## 全体フロー

```
Google Drive（テキスト・画像・PDF素材）
  ↓
Claude API（文章自動生成）+ Vertex AI Veo（動画自動生成）
  ↓
Firestore（承認待ち保存）
  ↓
管理画面（担当者が確認・承認）
  ↓
各プラットフォームへ投稿
  ├─ WordPress（お知らせ記事）
  ├─ Facebook（Graph API）
  ├─ Instagram（Graph API）
  └─ TikTok（Content Posting API）
  ↓
分析データ収集
  ↓
Claude APIで最適化提案 → 管理画面にレポート表示
```

---

## フェーズ詳細

### フェーズ1: 素材取得・文章生成・保存

#### 1-1. Google Drive 素材取得
- 「投稿素材」フォルダを監視
- テキスト・画像・PDFを自動取得
- PDF → テキスト変換
- 画像 → Claude Vision で内容解析

#### 1-2. Claude API 文章生成
- WordPress記事用（タイトル・本文・メタ説明）
- Facebook用（300文字以内）
- Instagram用（150文字＋ハッシュタグ）
- TikTok用キャプション（100文字）

#### 1-3. Firestore 保存
- 生成した全文章を承認待ちとして保存
- Slack/メールで担当者に通知

---

### フェーズ2: 動画自動生成

#### 2-1. Vertex AI Veo 動画生成
- 素材画像 → TikTok用縦型動画（9:16）
- 素材画像 → Instagram Reels用縦型動画（9:16）
- キャプションをもとにテロップ生成
- それぞれCloud Storageに保存

#### 2-2. Firestoreに紐付け
- フェーズ1の承認待ちデータにTikTok・Instagram両動画URLを追加

---

### フェーズ3: 管理画面

#### 3-1. 一覧画面
- 承認待ち投稿の一覧表示
- ステータス管理（承認待ち・承認済み・却下・投稿済み）

#### 3-2. 詳細・編集画面
- 各プラットフォームの投稿文プレビュー
- 投稿文の編集機能
- 動画・画像のプレビュー

#### 3-3. 承認・投稿操作
- 承認ボタン → 即時投稿
- 却下ボタン → 理由を記録
- 誰がいつ承認したか履歴保存

#### 3-4. アクセス管理
- Google OAuth でログイン
- 複数担当者が使用可能

---

### フェーズ4: 各SNS API連携

#### 4-1. WordPress
- REST API で記事を下書き/公開投稿
- アイキャッチ画像のアップロード

#### 4-2. Facebook
- Facebook Graph API
- Page Access Token 認証
- 画像付き投稿対応

#### 4-3. Instagram
- Instagram Graph API（Facebook経由）
- 2ステップ投稿（メディア作成 → 公開）
- 動画あり → Reels投稿
- 動画なし → 画像投稿（画像もなければスキップ）

#### 4-4. TikTok
- TikTok Content Posting API
- 動画アップロード → 投稿
- 動画生成失敗時はスキップ

---

### フェーズ5: 分析・最適化

#### 5-1. データ収集
- Facebook Insights API
- Instagram Insights API
- TikTok Analytics API
- いいね・リーチ・エンゲージメント率をFirestoreに保存

#### 5-2. Claude APIで分析
- 過去の投稿データをもとに傾向を分析
- 最適投稿時間の提案
- 反応が良かった文章パターンの抽出
- 次回投稿への改善提案

#### 5-3. 管理画面にレポート表示
- プラットフォーム別パフォーマンス比較
- 投稿ごとの効果グラフ
- 改善提案の表示

---

## 技術スタック

| 用途 | 技術 |
|---|---|
| 実行環境 | GCP Cloud Run |
| スケジューラ | GCP Cloud Scheduler |
| DB | Cloud Firestore |
| ストレージ | Cloud Storage |
| 文章生成 | Claude API（claude-sonnet-4-6） |
| 動画生成 | Vertex AI Veo |
| 管理画面 | Next.js 14（App Router） |
| 秘密管理 | GCP Secret Manager |

## 対象プラットフォーム

- WordPress
- Facebook
- Instagram
- TikTok
