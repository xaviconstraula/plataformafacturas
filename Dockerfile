FROM node:22-bookworm-slim AS base

# Native deps required by canvas and pdf-to-png-converter
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# ── deps stage: install all node_modules ────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── builder stage: generate Prisma client and build Next.js ─────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ── runner stage: production image ──────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Re-install only production deps (skip devDeps)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy build artifacts and generated Prisma client
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY next.config.ts ./

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1
CMD ["npm", "start"]
