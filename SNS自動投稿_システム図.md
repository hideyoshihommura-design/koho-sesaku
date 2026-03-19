# SNS自動投稿システム フロー図

更新日: 2026-03-19

---

## フローB：お知らせ → SNS自動投稿

```mermaid
flowchart TD
    A["⏰ Cloud Scheduler\n30分ごと"] -->|POST /poll/news| B["🐳 Cloud Run\nNode.js 20"]

    B --> C["🔍 Scraper\naozora-cg.com/news/\n.post-title a"]
    C --> D["📋 記事URLリスト"]

    D --> E{"🔄 stateStore\n新着チェック\nCloud Storage照合"}
    E -->|新着なし| F["✅ 終了\n次回30分後"]
    E -->|新着あり| G["📄 記事ページ取得\nh1.page-title\n.entry-content\nJSON-LD"]

    G --> H["🤖 Claude Sonnet 4.6\nSNS投稿文を3種生成\nFacebook / Instagram / TikTok"]

    H --> I(["並列処理"])

    I --> J["📘 HubSpot\nFacebook投稿"]
    I --> K["📸 HubSpot\nInstagram投稿"]
    I --> P["𝕏 HubSpot\nX投稿"]
    I --> L["🎬 Vertex AI\nVeo 3.1\nTikTok動画生成\n縦型9:16 / 15秒"]
    L --> M["🎵 HubSpot\nTikTok投稿"]

    J --> N["💾 seen-urls.json更新\nCloud Storage保存"]
    K --> N
    P --> N
    M --> N
    N --> O["🔔 Slack / メール通知\n投稿結果レポート"]

    style A fill:#1d4ed8,color:#fff,stroke:none
    style E fill:#92400e,color:#fff,stroke:none
    style F fill:#065f46,color:#fff,stroke:none
    style H fill:#5b21b6,color:#fff,stroke:none
    style L fill:#92400e,color:#fff,stroke:none
    style O fill:#065f46,color:#fff,stroke:none
```

---

## フローA：素材 → WordPress 下書き作成

```mermaid
flowchart TD
    A["⏰ Cloud Scheduler\n毎朝9:00"] -->|POST /queue/process| B["🐳 Cloud Run\nNode.js 20"]

    B --> C["📂 Google Drive\n投稿素材_キュー"]
    C --> D{"キューは空?"}
    D -->|空| E["🔔 空キュー通知\nSlack / メール"]
    D -->|あり| F["📄 素材ファイル取得\nテキスト / 画像 / PDF"]

    F --> G["🖼️ Claude Sonnet 4.6\n画像解析・説明文生成"]
    G --> H["✍️ Claude Sonnet 4.6\n記事 + SNS投稿文\n一括生成"]

    H --> I(["並列処理"])
    I --> J["🎬 Vertex AI Veo 3.1\nTikTok動画生成"]
    I --> K["📝 WordPress REST API\n下書き保存\n+ SNS文をカスタムフィールドへ"]

    K --> L["🗂️ Google Drive\n処理済みフォルダへ移動"]
    L --> M{"残りストック\n≤ 3件?"}
    M -->|yes| N["⚠️ ストック不足警告"]
    M -->|no| O["✅ 完了通知\nタイトル / 記事ID / 残り件数"]
    N --> O
    J --> P["💾 Cloud Storage\n動画を一時保存"]

    style A fill:#065f46,color:#fff,stroke:none
    style D fill:#92400e,color:#fff,stroke:none
    style E fill:#7f1d1d,color:#fff,stroke:none
    style H fill:#5b21b6,color:#fff,stroke:none
    style J fill:#92400e,color:#fff,stroke:none
    style M fill:#92400e,color:#fff,stroke:none
    style O fill:#065f46,color:#fff,stroke:none
```

---

## GCP インフラ構成

```mermaid
flowchart LR
    subgraph GCP["☁️ Google Cloud Platform"]
        subgraph Run["Cloud Run"]
            APP["🐳 sns-auto-post\nNode.js 20 / 2CPU / 2GB"]
        end
        subgraph Sched["Cloud Scheduler"]
            SA["フローA\n毎朝9:00\n/queue/process"]
            SB["フローB\n30分ごと\n/poll/news"]
        end
        subgraph AI["Vertex AI"]
            CL["Claude Sonnet 4.6\nus-east5"]
            VEO["Veo 3.1\nus-central1"]
        end
        subgraph GCS["Cloud Storage"]
            VS["sns-videos\nTikTok動画（30日削除）"]
            ST["sns-state\nseen-urls.json"]
        end
        SM["🔐 Secret Manager\nAPIキー管理"]
        LOG["📋 Cloud Logging"]
        MON["📊 Cloud Monitoring\nエラーアラート"]
        AR["📦 Artifact Registry\nDockerイメージ"]
    end

    subgraph EXT["外部サービス"]
        WP["🌐 aozora-cg.com\nWordPress"]
        HS["📣 HubSpot\nFacebook / Instagram"]
        TK["🎵 TikTok API"]
        GD["📂 Google Drive\n素材キュー"]
        SL["💬 Slack 通知"]
    end

    SA --> APP
    SB --> APP
    APP --> SM
    APP --> GCS
    APP --> AI
    APP --> LOG
    APP --> MON
    APP <--> WP
    APP --> HS
    APP --> TK
    APP <--> GD
    APP --> SL
    AR --> Run
```

---

## フローB シーケンス図（記事公開〜SNS投稿）

```mermaid
sequenceDiagram
    actor 担当者
    participant WP as 🌐 WordPress
    participant SC as ⏰ Scheduler
    participant CR as 🐳 Cloud Run
    participant GCS as 💾 Cloud Storage
    participant CL as 🤖 Claude
    participant VEO as 🎬 Veo 3.1
    participant HS as 📣 HubSpot
    participant SL as 💬 Slack

    担当者->>WP: 記事を公開
    Note over SC: 最大30分以内に起動
    SC->>CR: POST /poll/news
    CR->>WP: GET /news/ スクレイピング
    WP-->>CR: 記事URLリスト
    CR->>GCS: seen-urls.json 取得
    GCS-->>CR: 投稿済みURLリスト
    Note over CR: 新着URLを検出
    CR->>WP: 記事ページ スクレイピング
    WP-->>CR: タイトル・本文・画像
    CR->>CL: SNS投稿文生成（4種）
    CL-->>CR: Facebook / Instagram / X / TikTok テキスト
    par 並列投稿
        CR->>HS: Facebook 投稿
    and
        CR->>HS: Instagram 投稿
    and
        CR->>HS: X 投稿
    and
        CR->>VEO: TikTok動画生成
    end
    VEO-->>CR: 動画データ（公開URL付き）
    CR->>HS: TikTok 動画投稿（HubSpot経由）
    CR->>GCS: seen-urls.json 更新
    CR->>SL: 完了通知（各結果）
    SL-->>担当者: 投稿結果レポート
```

---

## 1日のスケジュール

```mermaid
gantt
    title 1日の自動実行スケジュール（JST）
    dateFormat HH:mm
    axisFormat %H:%M

    section フローA
    記事生成・下書き作成       :a1, 09:00, 10m

    section フローB
    0:00 チェック             :b1, 00:00, 2m
    0:30 チェック             :b2, 00:30, 2m
    9:00 チェック             :b3, 09:00, 2m
    9:30 チェック             :b4, 09:30, 2m
    12:00 チェック            :b5, 12:00, 2m
    12:30 チェック            :b6, 12:30, 2m
    18:00 チェック            :b7, 18:00, 2m
    21:00 チェック            :b8, 21:00, 2m
```
