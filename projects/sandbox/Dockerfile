# --------- Install -----------
FROM oven/bun:1-alpine AS install
WORKDIR /app

ARG proxy

# 安装 pnpm
RUN apk add --no-cache nodejs npm && npm install -g pnpm@9.4.0

# 复制 workspace 配置和依赖包
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/global ./packages/global
COPY packages/service ./packages/service
COPY projects/sandbox/package.json ./projects/sandbox/package.json

RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache\
    curl ca-certificates\
    && update-ca-certificates

# 安装依赖
RUN [ -f pnpm-lock.yaml ] || (echo "Lockfile not found." && exit 1)
RUN if [ -z "$proxy" ]; then \
        pnpm i; \
    else \
        pnpm i --registry=https://registry.npmmirror.com; \
    fi

# 复制源码
COPY ./projects/sandbox/src /app/projects/sandbox/src
COPY ./projects/sandbox/tsconfig.json /app/projects/sandbox/tsconfig.json

# ===== 运行层 =====
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ARG proxy

RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories

# 安装 Python、依赖包及工具
# - util-linux: 提供 prlimit 命令（内存限制）
RUN apk add --no-cache python3 py3-pip libffi util-linux && \
    apk add --no-cache --virtual .build-deps gcc g++ musl-dev python3-dev libffi-dev
COPY projects/sandbox/requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt && \
    rm /tmp/requirements.txt && \
    apk del .build-deps

# 复制必要的文件
COPY --from=install /app/node_modules /app/node_modules
COPY --from=install /app/packages /app/packages
COPY --from=install /app/projects/sandbox/src /app/projects/sandbox/src
COPY --from=install /app/projects/sandbox/node_modules /app/projects/sandbox/node_modules
COPY --from=install /app/projects/sandbox/package.json /app/projects/sandbox/package.json
COPY --from=install /app/projects/sandbox/tsconfig.json /app/projects/sandbox/tsconfig.json

# 创建非 root 用户运行沙箱
RUN addgroup -S sandbox && adduser -S sandbox -G sandbox && \
    chown -R sandbox:sandbox /app
USER sandbox

ENV NODE_ENV=production
ENV SANDBOX_PORT=3000

EXPOSE 3000

CMD ["bun", "/app/projects/sandbox/src/index.ts"]
