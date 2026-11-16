FROM node:24.22.1-alpine AS base

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

ARG DOCS_SITE_VARIANT
ARG FASTGPT_HOME_DOMAIN
ARG DOC_TRACK_SRC
ARG DOC_TRACK_SITE_ID
ARG GOOGLE_SITE_VERIFICATION
ARG BING_SITE_VERIFICATION
ARG BAIDU_SITE_VERIFICATION

ENV DOCS_SITE_VARIANT=$DOCS_SITE_VARIANT
ENV NEXT_PUBLIC_DOCS_SITE_VARIANT=$DOCS_SITE_VARIANT
ENV FASTGPT_HOME_DOMAIN=$FASTGPT_HOME_DOMAIN
ENV NEXT_PUBLIC_FASTGPT_HOME_DOMAIN=$FASTGPT_HOME_DOMAIN
ENV NEXT_PUBLIC_DOC_TRACK_SRC=$DOC_TRACK_SRC
ENV NEXT_PUBLIC_DOC_TRACK_SITE_ID=$DOC_TRACK_SITE_ID
ENV NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=$GOOGLE_SITE_VERIFICATION
ENV NEXT_PUBLIC_BING_SITE_VERIFICATION=$BING_SITE_VERIFICATION
ENV NEXT_PUBLIC_BAIDU_SITE_VERIFICATION=$BAIDU_SITE_VERIFICATION

COPY . .
RUN corepack enable
# The standalone docs context needs shared catalogs, but does not use the app SDK patches.
RUN pnpm config delete patchedDependencies --location=project
RUN pnpm install
RUN pnpm build


FROM base AS runner
RUN apk add --no-cache curl
ENV NODE_ENV=production
ARG DOCS_SITE_VARIANT
ARG FASTGPT_HOME_DOMAIN
ENV DOCS_SITE_VARIANT=$DOCS_SITE_VARIANT
ENV NEXT_PUBLIC_DOCS_SITE_VARIANT=$DOCS_SITE_VARIANT
ENV FASTGPT_HOME_DOMAIN=$FASTGPT_HOME_DOMAIN
ENV NEXT_PUBLIC_FASTGPT_HOME_DOMAIN=$FASTGPT_HOME_DOMAIN
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
