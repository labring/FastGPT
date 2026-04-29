# --------- Build Stage -----------
FROM node:24-alpine AS builder
WORKDIR /app

ARG proxy

# 安装 pnpm
RUN npm install -g pnpm@10.33.2

# 复制 workspace 配置和依赖包
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.json ./
COPY packages/global ./packages/global
COPY packages/service ./packages/service
COPY sdk ./sdk
COPY projects/code-sandbox/ ./projects/code-sandbox/

RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache curl ca-certificates && update-ca-certificates

# 安装所有依赖（包括 devDependencies 用于编译）
RUN if [ -z "$proxy" ]; then \
        pnpm install --frozen-lockfile --ignore-scripts; \
    else \
        pnpm install --frozen-lockfile --ignore-scripts --registry=https://registry.npmmirror.com; \
    fi

# 先构建 SDK workspace 包，确保 dist 入口可被打包工具解析
RUN pnpm --filter @fastgpt-sdk/logger --filter @fastgpt-sdk/otel --filter @fastgpt-sdk/storage build

# 编译主入口文件
RUN cd /app/projects/code-sandbox && pnpm build

# ===== Runner Stage =====
FROM node:24-alpine AS runner
WORKDIR /app/code-sandbox

ARG proxy

RUN [ -z "$proxy" ] || sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories

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
RUN apk add --no-cache python3 py3-pip libffi util-linux && \
    apk add --no-cache --virtual .build-deps gcc g++ musl-dev python3-dev libffi-dev
COPY projects/code-sandbox/requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt && \
    rm /tmp/requirements.txt && \
    apk del .build-deps


# 创建非 root 用户运行沙箱
RUN addgroup -S sandbox && adduser -S sandbox -G sandbox && \
    chown -R sandbox:sandbox /app
USER sandbox

ENV NODE_ENV=production
ENV SANDBOX_PORT=3000

EXPOSE 3000

CMD ["node", "/app/code-sandbox/index.js"]
