# --------- Install -----------
FROM node:20.14.0-alpine AS install
WORKDIR /app

RUN npm install -g pnpm@9.4.0

# 复制package.json
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/global ./packages/global
COPY projects/mcp_server/package.json ./projects/mcp_server/package.json

RUN apk add --no-cache\
    curl ca-certificates\
    && update-ca-certificates

# 安装依赖
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

COPY package.json pnpm-workspace.yaml .npmrc tsconfig.json ./
COPY ./projects/mcp_server /app/projects/mcp_server
COPY --from=install /app/packages /app/packages
COPY --from=install /app/node_modules /app/node_modules
COPY --from=install /app/projects/mcp_server/node_modules /app/projects/mcp_server/node_modules

RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache libc6-compat curl bash && npm install -g pnpm@9.4.0

# Install curl and bash, then install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

RUN pnpm --filter=mcp_server build

# runner
FROM node:20.14.0-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libffi libffi-dev strace bash

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/projects/mcp_server /app/projects/mcp_server

ENV NODE_ENV=production
ENV PORT=3000

ENTRYPOINT ["sh","-c","node /app/projects/mcp_server/dist/index.js"]
