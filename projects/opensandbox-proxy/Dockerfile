# Build from repository root:
#   docker build -f projects/opensandbox-proxy/Dockerfile --target runner -t fastgpt-opensandbox-proxy:latest .

# --------- Runtime Base Stage -----------
FROM oven/bun:1.4.4-slim AS bun-runtime

# --------- Build Stage -----------
FROM node:24.22.3-trixie-slim AS builder

WORKDIR /app

ARG proxy

# 复用运行阶段的 Bun 二进制执行单文件构建，同时使用 Node 运行 workspace 内的 tsdown 构建脚本。
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun

RUN if [ -z "$proxy" ]; then \
      npm install -g pnpm@10.33.4; \
    else \
      npm install -g pnpm@10.33.4 --registry=https://registry.npmmirror.com; \
    fi

# 1. 仅复制包管理清单以最大化利用 Docker 依赖安装缓存层。
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/global/package.json ./packages/global/package.json
COPY sdk/otel/package.json ./sdk/otel/package.json
COPY projects/opensandbox-proxy/package.json ./projects/opensandbox-proxy/package.json

RUN if [ -z "$proxy" ]; then \
      pnpm install --frozen-lockfile --ignore-scripts --filter @fastgpt/opensandbox-proxy...; \
    else \
      pnpm install --frozen-lockfile --ignore-scripts --filter @fastgpt/opensandbox-proxy... --registry=https://registry.npmmirror.com; \
    fi

# 2. 复制源码后依次构建依赖 SDK、执行严格类型检查并产出单入口生产 Bundle。
COPY packages/global/ ./packages/global/
COPY sdk/otel/ ./sdk/otel/
COPY projects/opensandbox-proxy/ ./projects/opensandbox-proxy/

RUN pnpm --filter @fastgpt-sdk/otel build && \
    pnpm --filter @fastgpt/opensandbox-proxy typecheck && \
    pnpm --filter @fastgpt/opensandbox-proxy build

# --------- Runner Stage -----------
FROM bun-runtime AS runner

WORKDIR /app

ARG proxy

# 安装根证书（保障 HTTPS 主站回调与 OTLP 上报）及 tini（PID 1 信号转发与僵尸进程回收）。
RUN [ -z "$proxy" ] || sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true
RUN apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 update && \
    apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 install -y --no-install-recommends \
      ca-certificates tini && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=1006 \
    HOME=/tmp

# 仅拷贝自包含编译产物并归属非特权用户（UID/GID 1000），杜绝源码与构建工具链滞留生产镜像。
COPY --from=builder --chown=1000:1000 /app/projects/opensandbox-proxy/dist ./dist

USER 1000:1000

EXPOSE 1006 1007

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || '1006') + '/health').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "run", "dist/index.js"]
