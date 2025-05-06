# --------- builder -----------
FROM oven/bun:1.2-alpine AS builder
WORKDIR /app

# 复制源代码
COPY . .

# 安装依赖
RUN --mount=type=cache,target=/root/.bun \
    for i in $(seq 1 3); do \
    bun i && break || \
    sleep 5; \
    done

# 构建
RUN bun run build

# --------- runner -----------
FROM node:22-alpine AS runner
WORKDIR /app

RUN apk add --no-cache\
    curl ca-certificates\
    && update-ca-certificates

# copy running files
# COPY --from=builder /app/node_modules/ ./node_modules/
COPY --from=builder /app/runtime/dist/ .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

ENV serverPath=index.js
ENTRYPOINT ["sh","-c","node ${serverPath} -p"]
