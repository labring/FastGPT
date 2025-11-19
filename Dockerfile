# 第一阶段：构建阶段
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package.json 文件
COPY package*.json ./

# 条件复制配置文件（如果存在的话）
COPY tsconfig.json* ./
COPY next.config.js* ./
COPY next.config.mjs* ./
COPY tailwind.config.js* ./
COPY postcss.config.js* ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 复制你修改的文件（覆盖原文件）
COPY projects/app/src/components/core/chat/ChatContainer/ChatBox/components/ChatItem.tsx \
     projects/app/src/components/core/chat/ChatContainer/ChatBox/components/ChatItem.tsx

# 构建应用
RUN npm run build

# 第二阶段：运行阶段
FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# 创建非root用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制构建产物
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
