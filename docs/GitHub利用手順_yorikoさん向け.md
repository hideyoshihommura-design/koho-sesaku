# GitHub 利用手順（yorikoさん向け）

作成日: 2026-03-12

---

## はじめに

このドキュメントは、yorikoさんが `koho-sesaku` リポジトリを使って作業するための手順書です。
**ファイルの確認・編集・追加** をGitHubで行えるようになります。

---

## ステップ0: 招待を承認する

1. GitHubからの招待メールを開く
2. 「**Accept invitation**」ボタンをクリック
3. `https://github.com/hideyoshihommura-design/koho-sesaku` にアクセスできればOK

---

## ステップ1: 環境セットアップ（初回のみ）

### 1-1. Gitをインストール

**Mac の場合：**
```bash
# Homebrew がある場合
brew install git

# ない場合は以下からインストーラーをダウンロード
# https://git-scm.com/download/mac
```

**Windows の場合：**
- https://git-scm.com/download/win からインストーラーをダウンロード・実行

### 1-2. Gitの初期設定

ターミナル（Macはターミナル.app、Windowsは Git Bash）を開いて実行：

```bash
git config --global user.name "Yoriko Kikunaga"
git config --global user.email "yoriko.kikunaga@aozora-cg.com"
```

### 1-3. リポジトリをクローン（ダウンロード）

```bash
# 作業フォルダに移動（例: デスクトップ）
cd ~/Desktop

# リポジトリをクローン
git clone https://github.com/hideyoshihommura-design/koho-sesaku.git

# フォルダに入る
cd koho-sesaku
```

これで `koho-sesaku` フォルダがデスクトップに作成されます。

---

## ステップ2: 日常の作業フロー

### 作業を始める前に（毎回必ず実行）

最新の状態を取得してから作業開始します：

```bash
cd ~/Desktop/koho-sesaku
git pull
```

### ファイルを編集・追加する

- フォルダ内のファイルを普通に編集・追加するだけでOKです
- テキストエディタ（VSCode推奨）で直接開いて編集できます

### 変更をGitHubに保存する

編集が終わったら以下の3つのコマンドを実行します：

```bash
# ① 変更したファイルを「保存準備」に追加
git add .

# ② 変更内容にコメントをつけて保存（コメントは日本語でOK）
git commit -m "○○を更新しました"

# ③ GitHubにアップロード
git push
```

---

## よく使うコマンド一覧

| やりたいこと | コマンド |
|------------|---------|
| 最新版を取得 | `git pull` |
| 変更状況を確認 | `git status` |
| 変更内容を確認 | `git diff` |
| 変更を保存準備 | `git add .` |
| コメント付きで保存 | `git commit -m "コメント"` |
| GitHubにアップロード | `git push` |

---

## VSCode（推奨エディタ）を使う場合

VSCode を使うと、コマンドを使わずにマウス操作だけで同じことができます。

1. https://code.visualstudio.com/ からVSCodeをインストール
2. VSCodeで `koho-sesaku` フォルダを開く（ファイル → フォルダを開く）
3. 左側のアイコン「ソース管理（Y字マーク）」から変更の管理が可能
   - `+` ボタン = `git add`
   - コメント入力 → チェックマーク = `git commit`
   - `...` → プッシュ = `git push`

---

## 困ったときは

### エラー: `Please enter a commit message`
→ `git commit -m "コメント"` のように `-m "..."` を忘れずに

### エラー: `rejected ... non-fast-forward`
→ 先に `git pull` を実行してから再度 `git push`

### 誰かの変更と自分の変更がぶつかった（コンフリクト）
→ Hommuraさんに連絡してください

---

## ファイル構成

```
koho-sesaku/
├── README.md                    # リポジトリの説明
├── sync.sh                      # 同期スクリプト（Hommuraさんが使用）
├── 作業履歴.md                  # 作業記録
├── 会話履歴.md                  # Claude Codeとのやり取り記録
├── SNS自動投稿_計画書v4.md      # システム設計書（最新）
├── コンテンツ素材_準備フロー.md  # 素材準備の手順
├── cloud-run-app/               # 自動投稿システムのコード
├── terraform/                   # GCPインフラ設定
└── docs/                        # 手順書類
```
