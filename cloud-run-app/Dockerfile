# ──────────────────────────────────
# ビルドステージ
# ──────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ──────────────────────────────────
# 本番ステージ
# ──────────────────────────────────
FROM node:20-slim AS runner

# Playwright 用のシステム依存ライブラリをインストール
# （LIFULL介護 Playwright 方針B に必要）
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-noto-cjk \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Playwright が自前でダウンロードしないように Chromium パスを指定
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Cloud Run はポート 8080 を使用
ENV PORT=8080
EXPOSE 8080

# 非rootユーザーで実行（セキュリティ）
RUN useradd -m -u 1001 appuser
USER appuser

CMD ["node", "dist/index.js"]
