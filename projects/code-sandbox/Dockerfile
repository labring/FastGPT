# --------- Build Stage -----------
FROM golang:1.22-bookworm AS go-runtime

FROM node:24-bookworm-slim AS builder
WORKDIR /app

ARG proxy

COPY --from=go-runtime /usr/local/go /usr/local/go
ENV PATH="/usr/local/go/bin:${PATH}"

# 安装 pnpm
RUN npm install -g pnpm@10.33.2

# 复制 workspace 配置和依赖包
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/global ./packages/global
COPY packages/service ./packages/service
COPY sdk ./sdk
COPY projects/code-sandbox/ ./projects/code-sandbox/

RUN [ -z "$proxy" ] || sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources
RUN apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 update && \
    apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 install -y --no-install-recommends \
      curl ca-certificates libseccomp-dev pkg-config gcc libc6-dev && \
    rm -rf /var/lib/apt/lists/*

# 安装所有依赖（包括 devDependencies 用于编译）
RUN if [ -z "$proxy" ]; then \
        pnpm install --frozen-lockfile --ignore-scripts; \
    else \
        pnpm install --frozen-lockfile --ignore-scripts --registry=https://registry.npmmirror.com; \
    fi

# 先构建 SDK workspace 包，确保 dist 入口可被打包工具解析
RUN pnpm --filter @fastgpt-sdk/otel --filter @fastgpt-sdk/storage build

# 编译主入口文件和 Python native 隔离库
RUN cd /app/projects/code-sandbox && SANDBOX_BUILD_NATIVE_PYTHON=true pnpm build

# ===== Runner Stage =====
FROM node:24-bookworm-slim AS runner
WORKDIR /app/code-sandbox

ARG proxy

RUN [ -z "$proxy" ] || sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources

# 安装 pnpm（用于 runner 阶段安装 prod 依赖）
RUN npm install -g pnpm@10.33.2

# 复制编译产物（index/worker 已 bundle 自身静态依赖，自包含）
COPY --from=builder /app/projects/code-sandbox/dist /app/code-sandbox

# 安装 worker 运行时白名单模块
# worker 通过 safeRequire(name) 按用户白名单动态加载（lodash/dayjs/moment/uuid/crypto-js/qs），
# 这是变量调用，bundler 无法静态分析，必须在 runner 中以 node_modules 形式存在。
# 单独的 runtime.package.json 与主 package.json 解耦，避免 catalog: 引用无法解析。
COPY projects/code-sandbox/runtime.package.json ./package.json

RUN if [ -z "$proxy" ]; then \
        pnpm install --prod --no-frozen-lockfile --ignore-scripts; \
    else \
        pnpm install --prod --no-frozen-lockfile --ignore-scripts --registry=https://registry.npmmirror.com; \
    fi && \
    pnpm store prune || true

# 安装 Python、依赖包及工具
RUN apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 update && \
    apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 install -y --no-install-recommends \
      python3 python3-pip libffi8 util-linux libseccomp2 \
      gcc g++ python3-dev libffi-dev patch git && \
    rm -rf /var/lib/apt/lists/*
COPY projects/code-sandbox/requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt && \
    rm /tmp/requirements.txt

RUN set -eux; \
    root=/tmp/fastgpt-python-sandbox; \
    mkdir -p \
      "$root/app/code-sandbox" \
      "$root/bin" \
      "$root/usr/bin" \
      "$root/usr/lib" \
      "$root/usr/local/lib" \
      "$root/lib" \
      "$root/lib64" \
      "$root/etc" \
      "$root/dev" \
      "$root/tmp"; \
    chmod 1777 "$root/tmp"; \
    cp -a /app/code-sandbox/. "$root/app/code-sandbox/"; \
    cp -a /usr/bin/python3 /usr/bin/python3.* "$root/usr/bin/" 2>/dev/null || true; \
    cp -a /usr/lib/python3* "$root/usr/lib/"; \
    cp -a /usr/local/lib/python3* "$root/usr/local/lib/" 2>/dev/null || true; \
    cp -a /usr/lib/aarch64-linux-gnu "$root/usr/lib/" 2>/dev/null || true; \
    cp -a /lib/aarch64-linux-gnu "$root/lib/" 2>/dev/null || true; \
    cp -a /lib/ld-linux-aarch64.so.1 "$root/lib/" 2>/dev/null || true; \
    cp -a /usr/lib/x86_64-linux-gnu "$root/usr/lib/" 2>/dev/null || true; \
    cp -a /lib/x86_64-linux-gnu "$root/lib/" 2>/dev/null || true; \
    cp -a /lib64/ld-linux-x86-64.so.2 "$root/lib64/" 2>/dev/null || true; \
    cp -a /etc/ssl "$root/etc/" 2>/dev/null || true; \
    cp -a /etc/ca-certificates "$root/etc/" 2>/dev/null || true; \
    cp -a /etc/resolv.conf /etc/hosts /etc/nsswitch.conf "$root/etc/" 2>/dev/null || true; \
    mkdir -p "$root/dev"; \
    mknod -m 666 "$root/dev/null" c 1 3 || true; \
    mknod -m 666 "$root/dev/zero" c 1 5 || true; \
    mknod -m 666 "$root/dev/random" c 1 8 || true; \
    mknod -m 666 "$root/dev/urandom" c 1 9 || true; \
    mkdir -p "$root/tmp/matplotlib"; \
    chmod -R a+rX "$root"; \
    chmod 1777 "$root/tmp"; \
    chmod 1777 "$root/tmp/matplotlib"


# 创建沙箱用户。code-sandbox 主进程默认保留 root，以便 Python 子进程
# 在 native 隔离初始化阶段执行 chroot/setuid；用户代码会降权到 sandbox。
RUN groupadd -g 65537 sandbox && useradd -u 65537 -g 65537 -M -r -s /usr/sbin/nologin sandbox && \
    mkdir -p /tmp/fastgpt-python-sandbox && \
    chown -R sandbox:sandbox /app /tmp/fastgpt-python-sandbox && \
    chmod 1777 /tmp/fastgpt-python-sandbox/tmp && \
    mkdir -p /tmp/fastgpt-python-sandbox/tmp/matplotlib && \
    chown sandbox:sandbox /tmp/fastgpt-python-sandbox/tmp/matplotlib && \
    chmod 1777 /tmp/fastgpt-python-sandbox/tmp/matplotlib

ENV NODE_ENV=production
ENV SANDBOX_PORT=3000
ENV HOME=/tmp
ENV XDG_CACHE_HOME=/tmp/.cache
ENV MPLCONFIGDIR=/tmp/matplotlib
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 3000

CMD ["node", "/app/code-sandbox/index.js"]
