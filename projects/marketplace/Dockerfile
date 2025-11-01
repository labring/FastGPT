# --------- install dependence -----------
FROM node:20.14.0-alpine AS maindeps
WORKDIR /app

ARG proxy

RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache libc6-compat && npm install -g pnpm@9.4.0

# copy packages and one project
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ./packages ./packages
COPY ./projects/marketplace/package.json ./projects/marketplace/package.json

RUN [ -f pnpm-lock.yaml ] || (echo "Lockfile not found." && exit 1)

# if proxy exists, set proxy
RUN if [ -z "$proxy" ]; then \
        pnpm i; \
    else \
        pnpm i --registry=https://registry.npmmirror.com; \
    fi

# --------- builder -----------
FROM node:20.14.0-alpine AS builder
WORKDIR /app

ARG proxy
ARG base_url

# copy common node_modules and one project node_modules
COPY package.json pnpm-workspace.yaml .npmrc tsconfig.json ./
COPY --from=maindeps /app/node_modules ./node_modules
COPY --from=maindeps /app/packages ./packages
COPY ./projects/marketplace ./projects/marketplace
COPY --from=maindeps /app/projects/marketplace/node_modules ./projects/marketplace/node_modules

RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories

RUN apk add --no-cache libc6-compat && npm install -g pnpm@9.4.0

ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV NEXT_PUBLIC_BASE_URL=$base_url
RUN pnpm --filter=marketplace build

# --------- runner -----------
FROM node:20.14.0-alpine AS runner
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
COPY --from=builder /app/projects/marketplace/public /app/projects/marketplace/public
COPY --from=builder /app/projects/marketplace/next.config.js /app/projects/marketplace/next.config.js
COPY --from=builder --chown=nextjs:nodejs /app/projects/marketplace/.next/standalone /app/
COPY --from=builder --chown=nextjs:nodejs /app/projects/marketplace/.next/static /app/projects/marketplace/.next/static
# copy server chunks
COPY --from=builder --chown=nextjs:nodejs /app/projects/marketplace/.next/server/chunks /app/projects/marketplace/.next/server/chunks

# copy package.json to version file
COPY --from=builder /app/projects/marketplace/package.json ./package.json

RUN chown -R nextjs:nodejs /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV NEXT_PUBLIC_BASE_URL=$base_url

EXPOSE 3000

USER nextjs

ENV serverPath=./projects/marketplace/server.js

ENTRYPOINT ["sh","-c","node --max-old-space-size=4096 ${serverPath}"]
