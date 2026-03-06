# 基于 base/ 目录构建的 fastgpt-agent-sandbox:latest，在其基础上注入 Sync Agent
#
# 构建顺序：
#   1. cd base && docker build -t fastgpt-agent-sandbox:latest .
#   2. docker build -f Dockerfile -t fastgpt-agent-sandbox:k8s .

FROM fastgpt-agent-sandbox:latest

USER root

# 安装 Sync Agent 依赖
RUN apt-get update && apt-get install -y \
    inotify-tools \
    && rm -rf /var/lib/apt/lists/*

# 安装 MinIO Client (mc)
RUN curl -O https://dl.min.io/client/mc/release/linux-amd64/mc && \
    chmod +x mc && \
    mv mc /usr/local/bin/

COPY sync.sh /sync.sh
COPY entrypoint.sh /entrypoint.sh
COPY http_server.py /http_server.py

RUN chmod +x /sync.sh /entrypoint.sh

# 8081: Sync Agent HTTP API（健康检查 / 手动触发同步）
EXPOSE 8081

USER sandbox

ENTRYPOINT ["/entrypoint.sh"]
