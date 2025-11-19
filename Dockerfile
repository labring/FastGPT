# 使用 FastGPT v4.14.2 镜像作为基础镜像
FROM ghcr.io/labring/fastgpt:v4.14.2

# 切换到root用户进行文件操作
USER root

# 设置工作目录
WORKDIR /app

# 直接复制整个components目录（会自动创建目录结构）
COPY --chown=nextjs:nodejs projects/app/src/components/core/chat/ChatContainer/ChatBox/components/ \
     projects/app/src/components/core/chat/ChatContainer/ChatBox/components/

# 切换回nextjs用户
USER nextjs
