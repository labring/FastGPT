FROM node:20-alpine AS base

FROM base AS builder
RUN apk add --no-cache \
    libc6-compat \
    git \
    build-base \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    librsvg-dev \
    freetype-dev \
    harfbuzz-dev \
    fribidi-dev \
    udev \
    ttf-opensans \
    fontconfig
WORKDIR /app

ARG NEXT_PUBLIC_SEARCH_APPKEY
ARG NEXT_PUBLIC_SEARCH_APPID
ARG NEXT_PUBLIC_DOMAIN
ARG NEXT_PUBLIC_SEARCH_APPWRITEKEY

ENV NEXT_PUBLIC_SEARCH_APPKEY=$NEXT_PUBLIC_SEARCH_APPKEY
ENV NEXT_PUBLIC_SEARCH_APPWRITEKEY=$NEXT_PUBLIC_SEARCH_APPWRITEKEY
ENV NEXT_PUBLIC_SEARCH_APPID=$NEXT_PUBLIC_SEARCH_APPID
ENV NEXT_PUBLIC_DOMAIN=$NEXT_PUBLIC_DOMAIN

COPY . .
RUN npm install && npm run build

FROM base AS runner
RUN apk add --no-cache curl
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs

ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
