# ──────────────────────────────────
# ビルドステージ（BGM生成 + TypeScript コンパイル + Remotion バンドル）
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
# Remotion バンドル前に実行することでバンドルに含まれる
RUN bash scripts/generate-bgm.sh

# TypeScript コンパイル + Remotion 合成を webpack でバンドル（BGM込み）
RUN npm run build

# ──────────────────────────────────
# 本番ステージ（Chromium + ffmpeg で Remotion レンダリングに対応）
# ──────────────────────────────────
FROM node:20-bookworm AS runner

# Remotion レンダリングに必要な Chromium・ffmpeg・日本語フォントをインストール
RUN apt-get update && apt-get install -y \
    chromium \
    ffmpeg \
    fonts-noto-cjk \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# TypeScript コンパイル済みコード + Remotion バンドル（BGM含む）をコピー
COPY --from=builder /app/dist ./dist

# Cloud Run はポート 8080 を使用
ENV PORT=8080
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 8080

# 非rootユーザーで実行（セキュリティ）
RUN useradd -m -u 1001 appuser \
    && mkdir -p /app/node_modules/.remotion \
    && chown -R appuser:appuser /app/node_modules/.remotion
USER appuser

CMD ["node", "dist/index.js"]
