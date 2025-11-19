# 第一阶段：构建阶段
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package.json 和相关配置文件
COPY package*.json ./
COPY tsconfig.json ./
COPY next.config.js ./

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 复制你修改的文件（覆盖原文件）
COPY projects/app/src/components/core/chat/ChatContainer/ChatBox/components/ChatItem.tsx \
     /app/projects/app/src/components/core/chat/ChatContainer/ChatBox/components/ChatItem.tsx

# 构建应用
RUN npm run build

# 第二阶段：运行阶段
FROM node:18-alpine AS runner

WORKDIR /app

# 复制构建产物
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
