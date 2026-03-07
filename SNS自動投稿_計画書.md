# SNS・LIFULL介護 自動投稿 計画書

作成日: 2026-03-07
担当: Hideyoshi Hommura

---

## 1. プロジェクト概要

### 目的
自社HPのお知らせ記事を更新した際に、Facebook・Instagram・TikTok・LIFULL介護へ自動または半自動で投稿する仕組みを構築する。HubSpotをMAツールの中心に置き、投稿の管理・分析・効果測定を一元化する。

### 対象プラットフォーム

| プラットフォーム | 連携方法 | 自動化レベル |
|----------------|---------|------------|
| Facebook | HubSpot Social（公式連携） | 完全自動 |
| Instagram | HubSpot Social（公式連携） | 完全自動 |
| TikTok | Make（旧Integromat）経由 | 半自動 |
| LIFULL介護 | Make経由 or 手動 | 半自動 |

---

## 2. システム構成図

```
WordPress（お知らせ更新）
        ↓
   RSSフィード / Webhook
        ↓
      HubSpot
    ├─ Facebook（自動投稿）
    ├─ Instagram（自動投稿）
    └─ Make（旧Integromat）
         ├─ TikTok（動画コンテンツがある場合）
         └─ LIFULL介護（担当者確認後に投稿）
```

---

## 3. 各プラットフォームの連携詳細

### 3-1. WordPress → HubSpot 連携

**方法：RSS フィードを HubSpot で監視**

- WordPressのRSSフィード（`https://自社ドメイン/feed/`）をHubSpotのワークフローで定期チェック
- 新規記事が検出されたら自動でワークフローを起動
- 必要なWordPressプラグイン：**WP Webhooks**（無料）

**設定手順：**
1. WordPressに「WP Webhooks」プラグインをインストール
2. 新規投稿公開時にHubSpotへWebhookを送信するよう設定
3. HubSpot側でWebhookを受信するワークフローを作成

---

### 3-2. Facebook 自動投稿

**HubSpot Social 機能を使用（追加費用なし※）**

※HubSpot Marketing Hub Starterプラン以上が必要

**設定手順：**
1. HubSpot → マーケティング → ソーシャル → 「アカウントを接続」
2. Facebookページを接続
3. ワークフローで「ソーシャル投稿を作成」アクションを追加
4. 投稿テンプレートを設定（タイトル＋記事URL＋アイキャッチ画像）

**投稿テンプレート例：**
```
【お知らせ】{{記事タイトル}}

{{記事の冒頭100文字}}...

詳しくはこちら → {{記事URL}}
```

---

### 3-3. Instagram 自動投稿

**HubSpot Social 機能を使用**

**注意事項：**
- Instagramはビジネスアカウントが必須
- 画像が必須（アイキャッチ画像を自動で使用）
- ハッシュタグはテンプレートに固定で設定

**投稿テンプレート例：**
```
{{記事タイトル}}

{{記事の冒頭80文字}}...

プロフィールのリンクから詳細をご覧ください。

#ハッシュタグ1 #ハッシュタグ2 #ハッシュタグ3
```

---

### 3-4. TikTok 半自動投稿

**Make（旧Integromat）を使用**

TikTokはHubSpotの公式連携対象外のため、Makeを中継ツールとして使用する。
テキスト投稿は不可のため、**動画ファイルが必要**。

**フロー：**
```
HubSpot Webhook → Make → TikTok Business API → 投稿
```

**運用方針：**
- WordPress記事更新時に担当者へ通知（メール or Slack）
- 担当者が動画を準備してMakeのシナリオを手動実行
- 完全自動化は動画制作ツール（CapCut API等）との連携が必要なため、当面は半自動運用

---

### 3-5. LIFULL介護 半自動投稿

**現状：LIFULL介護はパートナー向けAPIを公開していない**

**運用方針（2段階）：**

**フェーズ1（当面）：通知＋手動投稿**
- WordPress記事更新時に担当者へ自動通知
- 担当者がLIFULL介護の管理画面から手動投稿
- HubSpotで投稿日時・内容を記録・管理

**フェーズ2（将来）：LIFULL介護に直接問い合わせ**
- LIFULL介護のパートナーサポートにAPI連携の可否を確認
- 対応可能であればMake経由で自動化

---

## 4. HubSpot ワークフロー設計

### メインワークフロー

```
トリガー：WordPressからWebhookを受信
    ↓
条件分岐：カテゴリが「お知らせ」か確認
    ↓ Yes
Facebook に投稿（HubSpot Social）
    ↓
Instagram に投稿（HubSpot Social）
    ↓
担当者にメール通知（TikTok・LIFULL介護の対応依頼）
    ↓
HubSpot CRM にコンテンツ記録（投稿管理）
```

### 投稿管理用カスタムプロパティ（HubSpot）

| プロパティ名 | 内容 |
|------------|------|
| 記事URL | WordPressの記事URL |
| 投稿日時 | WordPress公開日時 |
| Facebook投稿済み | Yes / No |
| Instagram投稿済み | Yes / No |
| TikTok投稿済み | Yes / No |
| LIFULL介護投稿済み | Yes / No |

---

## 5. 必要なツール・費用

| ツール | 用途 | 費用 |
|--------|------|------|
| HubSpot Marketing Hub Starter | SNS管理・ワークフロー | 約$20/月〜 |
| Make（旧Integromat） | TikTok・LIFULL介護連携 | 無料プラン〜$9/月 |
| WP Webhooks（WordPress） | WordPress→HubSpot連携 | 無料 |

---

## 6. 実装フェーズ

### フェーズ1：基盤構築（1〜2週間）
- [ ] HubSpotとFacebook・Instagramの連携設定
- [ ] WordPressにWP Webhooksプラグインを導入
- [ ] HubSpotでWebhook受信ワークフローを作成
- [ ] 投稿テンプレートの作成
- [ ] テスト投稿・動作確認

### フェーズ2：TikTok連携（2〜3週間）
- [ ] MakeアカウントとTikTok Business APIの設定
- [ ] HubSpot → Make → TikTok のシナリオ構築
- [ ] 担当者への運用マニュアル作成

### フェーズ3：LIFULL介護対応（並行実施）
- [ ] LIFULL介護パートナーサポートへAPI連携の問い合わせ
- [ ] API連携不可の場合：通知フローの構築
- [ ] API連携可能の場合：Make経由で自動化

### フェーズ4：運用・改善（継続）
- [ ] HubSpotのレポートで投稿効果を月次確認
- [ ] エンゲージメント率をもとにテンプレートを改善
- [ ] 投稿時間帯の最適化

---

## 7. リスクと対策

| リスク | 対策 |
|--------|------|
| InstagramのAPIが突然変更される | HubSpotが公式パートナーのため影響が最小限 |
| TikTokのAPIアクセスが制限される | 手動投稿フローへ即時切り替え |
| WordPressのWebhookが失敗する | HubSpotでエラー通知メールを設定 |
| LIFULL介護がAPI非対応 | 通知フローで手動投稿を徹底 |

---

## 8. 成功指標（KPI）

| 指標 | 目標 |
|------|------|
| 投稿作業時間の削減 | 1記事あたり30分 → 5分以内 |
| 投稿漏れ | 0件 |
| SNSエンゲージメント率 | 現状比120%以上 |
| LIFULL介護からの問い合わせ数 | 月次で計測・改善 |

---

## 9. 次のアクション

1. **HubSpotのプラン確認** — Marketing Hub Starterプラン以上か確認
2. **Facebookビジネスアカウント・Instagramビジネスアカウントの準備**
3. **TikTok Business APIの申請**（審査に時間がかかるため早めに対応）
4. **LIFULL介護パートナーサポートへ問い合わせ**
5. **フェーズ1の実装開始**
