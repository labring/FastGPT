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

ARG FASTGPT_HOME_DOMAIN
ARG DOC_TRACK_SRC
ARG DOC_TRACK_CN
ARG DOC_TRACK_IO

ENV FASTGPT_HOME_DOMAIN=$FASTGPT_HOME_DOMAIN
ENV NEXT_PUBLIC_DOC_TRACK_SRC=$DOC_TRACK_SRC
ENV NEXT_PUBLIC_DOC_TRACK_CN=$DOC_TRACK_CN
ENV NEXT_PUBLIC_DOC_TRACK_IO=$DOC_TRACK_IO

COPY . .
RUN npm install 
RUN npm run build


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
