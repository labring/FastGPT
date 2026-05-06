# --------- Build Stage -----------
FROM node:24-alpine AS builder
WORKDIR /app

ARG proxy

RUN npm install -g pnpm@10.33.2

# Workspace + dependent packages
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/global ./packages/global
COPY packages/service ./packages/service
COPY sdk ./sdk
COPY projects/sandbox-proxy/ ./projects/sandbox-proxy/

RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache curl ca-certificates && update-ca-certificates

RUN if [ -z "$proxy" ]; then \
        pnpm install --frozen-lockfile --ignore-scripts; \
    else \
        pnpm install --frozen-lockfile --ignore-scripts --registry=https://registry.npmmirror.com; \
    fi

# Bundle the proxy entry — tsdown noExternal:[/.*/] inlines all npm deps, so the
# runner stage doesn't need a node_modules tree.
RUN cd /app/projects/sandbox-proxy && pnpm build

# ===== Runner Stage =====
FROM node:24-alpine AS runner
WORKDIR /app

ARG proxy
RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories

COPY --from=builder /app/projects/sandbox-proxy/dist /app

RUN addgroup -S sandbox && adduser -S sandbox -G sandbox && \
    chown -R sandbox:sandbox /app
USER sandbox

ENV NODE_ENV=production
ENV SANDBOX_PROXY_PORT=3006

EXPOSE 3006

CMD ["node", "/app/index.js"]
