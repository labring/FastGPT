# 第一阶段：构建阶段
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 安装必要的系统依赖
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# 复制 package.json 文件
COPY package*.json ./

# 显示 package.json 内容用于调试
RUN echo "=== Package.json content ===" && \
    cat package.json && \
    echo "=== End package.json ===" && \
    echo "Node version: $(node --version)" && \
    echo "NPM version: $(npm --version)"

# 清理 npm 缓存并安装依赖
RUN npm cache clean --force && \
    npm ci --verbose --no-optional

# 条件复制配置文件
COPY tsconfig.json* ./
COPY next.config.js* ./
COPY next.config.mjs* ./

# 复制源代码
COPY . .

# 复制你修改的文件
COPY projects/app/src/components/core/chat/ChatContainer/ChatBox/components/ChatItem.tsx \
     projects/app/src/components/core/chat/ChatContainer/ChatBox/components/ChatItem.tsx

# 构建应用
RUN npm run build

# 第二阶段：运行阶段
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# 复制构建产物
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["npm", "start"]
