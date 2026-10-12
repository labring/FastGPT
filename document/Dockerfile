FROM node:24.16.0-alpine AS base

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

ARG FASTGPT_HOME_DOMAIN
ARG DOC_TRACK_SRC
ARG DOC_TRACK_SITE_ID
# Docs domain variant: io (doc.fastgpt.io, default en) | cn (doc.fastgpt.cn, default zh-CN)
ARG DOC_SITE_VARIANT
# Optional per-domain search-engine verification / analytics (no-op when empty)
ARG GOOGLE_VERIFICATION_ID
ARG BING_VERIFICATION_ID
ARG GOOGLE_ANALYTICS_ID
ARG BAIDU_VERIFICATION_ID
ARG BAIDU_TONGJI_ID

ENV FASTGPT_HOME_DOMAIN=$FASTGPT_HOME_DOMAIN
ENV NEXT_PUBLIC_FASTGPT_HOME_DOMAIN=$FASTGPT_HOME_DOMAIN
ENV NEXT_PUBLIC_DOC_TRACK_SRC=$DOC_TRACK_SRC
ENV NEXT_PUBLIC_DOC_TRACK_SITE_ID=$DOC_TRACK_SITE_ID
ENV NEXT_PUBLIC_DOC_SITE_VARIANT=$DOC_SITE_VARIANT
ENV NEXT_PUBLIC_GOOGLE_VERIFICATION_ID=$GOOGLE_VERIFICATION_ID
ENV NEXT_PUBLIC_BING_VERIFICATION_ID=$BING_VERIFICATION_ID
ENV NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=$GOOGLE_ANALYTICS_ID
ENV NEXT_PUBLIC_BAIDU_VERIFICATION_ID=$BAIDU_VERIFICATION_ID
ENV NEXT_PUBLIC_BAIDU_TONGJI_ID=$BAIDU_TONGJI_ID

COPY . .
RUN corepack enable
RUN pnpm install
RUN pnpm build


FROM base AS runner
RUN apk add --no-cache curl
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/data ./data
USER nextjs

ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
