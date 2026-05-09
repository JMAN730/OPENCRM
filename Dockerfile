# Stage 1: install dependencies + generate Prisma client
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Generate Prisma client in the same stage as npm ci so the correct
# platform binaries (linux-musl) are used without any npx resolution issues
COPY prisma ./prisma
COPY prisma.config.ts ./
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN ./node_modules/.bin/prisma generate

# Stage 2: build Next.js app
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

RUN npm run build

# Stage 3: minimal runtime image
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Standalone Next.js output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma schema + generated client for runtime db push
COPY --from=deps   --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=deps   --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps   --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=deps   --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
