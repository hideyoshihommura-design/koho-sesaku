# BGM ファイルの置き場所

このディレクトリに以下の3ファイルを配置してください。
Docker ビルド時に Remotion バンドルへ自動的に含まれます。

```
public/music/
├── bgm1.mp3   ← 1曲目
├── bgm2.mp3   ← 2曲目
└── bgm3.mp3   ← 3曲目
```

## 推奨スペック
- 形式: MP3（128kbps 以上）
- 長さ: 30秒以上（最長動画は4枚×5秒＝約20秒）
- ジャンル: 穏やか・明るい BGM が投稿に合いやすい

## 無料の著作権フリー音源サイト
- **Pixabay Music** — https://pixabay.com/music/
- **Free Music Archive** — https://freemusicarchive.org/
- **DOVA-SYNDROME** — https://dova-s.jp/（日本語サイト）

> ⚠️ MP3 ファイル本体はリポジトリに含めないでください（容量・ライセンス管理のため）。
> デプロイ担当者が上記サイトからダウンロードして配置してください。
