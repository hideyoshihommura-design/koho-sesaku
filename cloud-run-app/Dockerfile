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
# 本番ステージ（Phase A: ブラウザ不要）
# ──────────────────────────────────
FROM node:20-slim AS runner

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
