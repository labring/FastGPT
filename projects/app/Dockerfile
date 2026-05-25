# --------- install dependence -----------
FROM node:24-alpine AS maindeps
WORKDIR /app

ARG proxy

RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache libc6-compat && npm install -g pnpm@10.33.2

# copy packages and one project
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ./packages ./packages
COPY ./sdk ./sdk
COPY ./projects/app/package.json ./projects/app/package.json

RUN [ -f pnpm-lock.yaml ] || (echo "Lockfile not found." && exit 1)

# if proxy exists, set proxy
RUN if [ -z "$proxy" ]; then \
        pnpm i; \
    else \
        pnpm i --registry=https://registry.npmmirror.com; \
    fi

# --------- builder -----------
FROM node:24-alpine AS builder
WORKDIR /app

ARG proxy
ARG base_url

# copy common node_modules and one project node_modules
COPY package.json pnpm-workspace.yaml .npmrc tsconfig.json eslint.config.mjs ./
COPY --from=maindeps /app/node_modules ./node_modules
COPY --from=maindeps /app/packages ./packages
COPY --from=maindeps /app/sdk ./sdk
COPY ./projects/app ./projects/app
COPY --from=maindeps /app/projects/app/node_modules ./projects/app/node_modules

RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories

RUN apk add --no-cache libc6-compat && npm install -g pnpm@10.33.2

ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV NEXT_PUBLIC_BASE_URL=$base_url
# Build SDK workspace packages first so subpath exports like
# @fastgpt-sdk/otel/logger have generated dist type files.
RUN pnpm build:sdks
RUN pnpm --filter=app build

# Remove build-time-only packages from standalone output before copying to runner.
# These are traced into standalone by mistake (rspack bindings, gnu platform binaries, etc.)
RUN rm -rf projects/app/.next/standalone/node_modules/.pnpm/@next+rspack-binding-*/ \
    projects/app/.next/standalone/node_modules/.pnpm/@rspack+binding-*/ \
    projects/app/.next/standalone/node_modules/.pnpm/next-rspack*/ \
    projects/app/.next/standalone/node_modules/.pnpm/typescript@*/ \
    projects/app/.next/standalone/node_modules/.pnpm/*-linux-x64-gnu@*/ \
    projects/app/.next/standalone/node_modules/.pnpm/@img+sharp-libvips-linux-x64@*/

# --------- runner -----------
FROM node:24-alpine AS runner
WORKDIR /app

ARG proxy
ARG base_url

# create user and use it
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache curl ca-certificates \
  && update-ca-certificates

# copy running files
COPY --from=builder /app/projects/app/public /app/projects/app/public
COPY --from=builder /app/projects/app/next.config.ts /app/projects/app/next.config.ts
COPY --from=builder /app/projects/app/next-i18next.config.js /app/projects/app/next-i18next.config.js
COPY --from=builder --chown=nextjs:nodejs /app/projects/app/.next/standalone /app/
COPY --from=builder --chown=nextjs:nodejs /app/projects/app/.next/static /app/projects/app/.next/static
# next-i18next loads locale json files from ../../packages/web/i18n at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/packages/web/i18n /app/packages/web/i18n
# copy server chunks
COPY --from=builder --chown=nextjs:nodejs /app/projects/app/.next/server/chunks /app/projects/app/.next/server/chunks
# copy worker
COPY --from=builder --chown=nextjs:nodejs /app/projects/app/worker /app/projects/app/worker
COPY --from=builder --chown=nextjs:nodejs /app/projects/app/worker /app/worker

COPY --from=maindeps /app/node_modules/@zilliz/milvus2-sdk-node ./node_modules/@zilliz/milvus2-sdk-node

# copy package.json to version file
COPY --from=builder /app/projects/app/package.json ./package.json
# copy config and data files (use --chown to avoid extra layer from chown)
COPY --chown=nextjs:nodejs ./projects/app/data/config.json /app/data/config.json
COPY --chown=nextjs:nodejs ./projects/app/data/test.mp3 /app/data/test.mp3
COPY --chown=nextjs:nodejs ./projects/app/data/GeoLite2-City.mmdb /app/data/GeoLite2-City.mmdb

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV NEXT_PUBLIC_BASE_URL=$base_url

EXPOSE 3000

USER nextjs

ENTRYPOINT ["node","--max-old-space-size=4096","./projects/app/server.js"]
