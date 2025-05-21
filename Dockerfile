# Step 1: Build source
FROM node:22-alpine3.20 AS base
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --force

COPY . .

# Step 2: Create final runtime image
FROM node:22-alpine3.20 AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

COPY --from=base /app/public ./public
COPY --from=base --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=base --chown=nextjs:nodejs /app/.next/static ./.next/static

EXPOSE 3000

CMD HOSTNAME=0.0.0.0 node server.js
