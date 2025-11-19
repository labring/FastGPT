# 使用官方 FastGPT 镜像作为基础镜像
FROM ghcr.io/labring/fastgpt:v4.14.2

# 设置工作目录
WORKDIR /app

# 创建目录结构（确保路径存在）
RUN mkdir -p projects/app/src/components/core/chat/ChatContainer/ChatBox/components/

# 复制你修改的文件到容器中
COPY projects/app/src/components/core/chat/ChatContainer/ChatBox/components/ChatItem.tsx \
     projects/app/src/components/core/chat/ChatContainer/ChatBox/components/ChatItem.tsx

# 保持原有的启动命令
CMD ["npm", "start"]
