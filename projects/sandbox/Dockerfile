# ===== Bun 构建层 =====
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY projects/sandbox/package.json projects/sandbox/bun.lock ./
RUN bun install --frozen-lockfile
COPY projects/sandbox/src ./src
COPY projects/sandbox/tsconfig.json ./

# ===== 运行层 =====
FROM oven/bun:1-alpine AS runner
WORKDIR /app

# 安装 Python 及依赖包（使用系统 Python，避免多版本冲突）
RUN apk add --no-cache python3 py3-pip libffi && \
    apk add --no-cache --virtual .build-deps gcc g++ musl-dev python3-dev libffi-dev
COPY projects/sandbox/requirements.txt /tmp/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /tmp/requirements.txt && \
    rm /tmp/requirements.txt && \
    apk del .build-deps

# 复制 node_modules 和源码
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
ENV SANDBOX_PORT=3000

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
