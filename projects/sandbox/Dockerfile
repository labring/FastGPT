# ===== Python 基础层 =====
FROM python:3.11-alpine AS python_base
RUN apk add --no-cache make g++
COPY projects/sandbox/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

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

RUN apk add --no-cache python3 py3-pip libffi

# 复制 Python 3.11 及其包
COPY --from=python_base /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=python_base /usr/local/bin/python3 /usr/local/bin/python3

# 复制 node_modules 和源码
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
ENV SANDBOX_PORT=3000

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
