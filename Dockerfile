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
# Switched from node:20-alpine to node:20-bookworm-slim because the scraper
# uses Python + Playwright Chromium, which has no maintained Alpine build.
FROM node:20-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates python3 python3-pip python3-venv \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --gid 1001 nextjs

# Standalone Next.js output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma schema + generated client + CLI for runtime db push
COPY --from=deps   --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=deps   --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps   --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=deps   --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

# Python scraper: install deps into a venv (PEP 668 forbids system-wide pip on Debian)
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# Pin browser binaries to a fixed path so they're accessible regardless of
# which user's $HOME the runtime process sees (nextjs user has home=/nonexistent)
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright

COPY --chown=nextjs:nodejs scraper/requirements.txt /app/scraper/requirements.txt
RUN pip install --no-cache-dir --retries 5 --timeout 120 -r /app/scraper/requirements.txt \
 && python3 -m playwright install --with-deps chromium

COPY --chown=nextjs:nodejs src/server/scraper/scraper.py /app/scraper/scraper.py

# Writable output dir for scraper CSVs
RUN mkdir -p /app/scraper-output \
 && chown -R nextjs:nodejs /app/scraper-output /opt/venv /opt/ms-playwright

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
