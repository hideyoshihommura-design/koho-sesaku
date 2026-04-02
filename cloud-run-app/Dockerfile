# ──────────────────────────────────
# ビルドステージ（TypeScript コンパイル + Remotion バンドル）
# ──────────────────────────────────
FROM node:20-bookworm AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

# TypeScript コンパイル + Remotion 合成を webpack でバンドル
RUN npm run build

# ──────────────────────────────────
# 本番ステージ（Chromium + ffmpeg で Remotion レンダリングに対応）
# ──────────────────────────────────
FROM node:20-bookworm AS runner

# Remotion レンダリングに必要な Chromium と ffmpeg をインストール
RUN apt-get update && apt-get install -y \
    chromium \
    ffmpeg \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# TypeScript コンパイル済みコード + Remotion バンドルをコピー
COPY --from=builder /app/dist ./dist

# Cloud Run はポート 8080 を使用
ENV PORT=8080
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 8080

# 非rootユーザーで実行（セキュリティ）
RUN useradd -m -u 1001 appuser
USER appuser

CMD ["node", "dist/index.js"]
