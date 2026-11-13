# Build from repository root:
#   docker build -f projects/volume-manager/Dockerfile -t fastgpt-volume-manager:latest .

FROM node:24.22.3-alpine AS builder

WORKDIR /app

ARG proxy

RUN npm install -g pnpm@10.33.4

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/global/ ./packages/global/
COPY sdk/otel/ ./sdk/otel/
COPY projects/volume-manager/ ./projects/volume-manager/

RUN if [ -z "$proxy" ]; then \
      pnpm install --frozen-lockfile --ignore-scripts --filter @fastgpt/volume-manager...; \
    else \
      pnpm install --frozen-lockfile --ignore-scripts --filter @fastgpt/volume-manager... --registry=https://registry.npmmirror.com; \
    fi

RUN pnpm --filter @fastgpt-sdk/otel build && \
    cd /app/projects/volume-manager && pnpm build

FROM node:24.22.3-trixie-slim AS runner

WORKDIR /app

ARG JUICEFS_VERSION=1.4.2
ARG JUICEFS_SHA256_AMD64=79648a0a67145bf42ca4e8336578c13a5bbc9a0bd34df340b3b93dac1e975247
ARG JUICEFS_SHA256_ARM64=19f72a30d3642a2f7971c8c4a31d2647de62f19520716e85c3a777de5f4c9036

# ARM64 官方客户端依赖 glibc；runner 使用 Debian 13 (trixie-slim)，避免 Alpine 缺少动态加载器并降低基础系统漏洞面。
# 下载并完成 SHA256 完整性校验后立即清理压缩包与 curl，收敛运行时镜像攻击面。
RUN apt-get update && \
    apt-get install -y --no-install-recommends fuse3 curl ca-certificates && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
      JFS_ARCH="amd64"; \
      JFS_SHA256="${JUICEFS_SHA256_AMD64}"; \
    elif [ "$ARCH" = "aarch64" ]; then \
      JFS_ARCH="arm64"; \
      JFS_SHA256="${JUICEFS_SHA256_ARM64}"; \
    else \
      echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    curl --proto '=https' --tlsv1.2 -fsSL "https://github.com/juicedata/juicefs/releases/download/v${JUICEFS_VERSION}/juicefs-${JUICEFS_VERSION}-linux-${JFS_ARCH}.tar.gz" \
      -o /tmp/juicefs.tar.gz && \
    echo "${JFS_SHA256}  /tmp/juicefs.tar.gz" | sha256sum -c - && \
    tar -xzf /tmp/juicefs.tar.gz -C /usr/local/bin juicefs && \
    rm -f /tmp/juicefs.tar.gz && \
    chmod 0755 /usr/local/bin/juicefs && \
    apt-get purge -y --auto-remove curl && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /var/lib/fastgpt/sandbox-mounts

ENV NODE_ENV=production

COPY --from=builder /app/projects/volume-manager/dist ./dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["node", "dist/index.js"]
