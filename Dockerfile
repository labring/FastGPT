# --------- install dependence -----------
FROM node:18.17-alpine AS appDeps
WORKDIR /app

ARG name
ARG proxy

RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache libc6-compat && npm install -g pnpm@8.6.0
# if proxy exists, set proxy
RUN [ -z "$proxy" ] || pnpm config set registry https://registry.npm.taobao.org

# copy packages and one project
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ./packages ./packages
COPY ./projects/$name/package.json ./projects/$name/package.json

RUN [ -f pnpm-lock.yaml ] || (echo "Lockfile not found." && exit 1)

RUN pnpm i

# --------- install worker dependence -----------
FROM node:18.17-alpine AS workdersDeps
WORKDIR /app

ARG proxy

RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache libc6-compat && npm install -g pnpm@8.6.0
RUN [ -z "$proxy" ] || pnpm config set registry https://registry.npm.taobao.org

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY ./worker/package.json ./worker/package.json

RUN pnpm i --production --filter @node/worker

# --------- builder -----------
FROM node:18.17-alpine AS builder
WORKDIR /app

ARG name
ARG proxy

# copy common node_modules and one project node_modules
COPY package.json pnpm-workspace.yaml ./
COPY --from=appDeps /app/node_modules ./node_modules
COPY --from=appDeps /app/packages ./packages
COPY ./projects/$name ./projects/$name
COPY --from=appDeps /app/projects/$name/node_modules ./projects/$name/node_modules

RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories

RUN apk add --no-cache libc6-compat && npm install -g pnpm@8.6.0
RUN pnpm --filter=$name build

# --------- runner -----------
FROM node:18.17-alpine AS runner
WORKDIR /app

ARG name
ARG proxy

# create user and use it
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache curl ca-certificates \
  && update-ca-certificates

# copy running files
COPY --from=builder /app/projects/$name/public ./projects/$name/public
COPY --from=builder /app/projects/$name/next.config.js ./projects/$name/next.config.js
COPY --from=builder --chown=nextjs:nodejs /app/projects/$name/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/projects/$name/.next/static ./projects/$name/.next/static
# copy package.json to version file
COPY --from=builder /app/projects/$name/package.json ./package.json 
# copy woker
COPY --from=workdersDeps /app/node_modules ./node_modules
COPY ./worker ./worker

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV PORT=3000

EXPOSE 3000

USER nextjs

ENV serverPath=./projects/$name/server.js


ENTRYPOINT ["sh","-c","node ${serverPath}"]