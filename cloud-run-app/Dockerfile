# ──────────────────────────────────
# ビルドステージ（BGM生成 + TypeScript コンパイル）
# ──────────────────────────────────
FROM node:20-bookworm AS builder

# ffmpeg（BGM自動生成用）をインストール
RUN apt-get update && apt-get install -y ffmpeg --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/generate-bgm.sh ./scripts/

# BGM を自動生成（public/music/bgm1〜3.mp3）
RUN bash scripts/generate-bgm.sh

# TypeScript コンパイル
RUN npm run build

# ──────────────────────────────────
# 本番ステージ（ffmpeg で動画生成・日本語フォント対応）
# ──────────────────────────────────
FROM node:20-bookworm AS runner

# ffmpeg・日本語フォントをインストール
RUN apt-get update && apt-get install -y \
    ffmpeg \
    fonts-noto-cjk \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# TypeScript コンパイル済みコードをコピー
COPY --from=builder /app/dist ./dist

# BGM ファイルをコピー（ffmpeg 動画生成時に使用）
COPY --from=builder /app/public ./public

# Cloud Run はポート 8080 を使用
ENV PORT=8080

EXPOSE 8080

# 非rootユーザーで実行（セキュリティ）
RUN useradd -m -u 1001 appuser \
    && chown -R appuser:appuser /app
USER appuser

CMD ["node", "dist/index.js"]
