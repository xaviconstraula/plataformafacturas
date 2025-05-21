# Step 1. Rebuild the source code only when needed
FROM node:22-alpine3.20 AS base

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --force

# Copy the entire application source code, including script.js
COPY . . 

# # Run Prisma commands
RUN npx prisma generate

# Build Next.js application
RUN npm run build

# Step 2. Production image, copy all the files and run the application
FROM node:22-alpine3.20 AS runner

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

# Copy required files from the builder
COPY --from=base /app/public ./public
COPY --from=base --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=base --chown=nextjs:nodejs /app/.next/static ./.next/static

EXPOSE 3000

CMD HOSTNAME=0.0.0.0 node server.js
