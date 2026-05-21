# Agent Sandbox 镜像
# 提供 code-server 开发环境
#
# 构建：docker build -t fastgpt-agent-sandbox:latest .
# 产物：fastgpt-agent-sandbox:latest
FROM ubuntu:24.04

# Avoid prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y \
    git \
    jq \
    ripgrep \
    vim-tiny \
    tree \
    zip \
    unzip \
    curl \
    ca-certificates
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
RUN apt install -y python3 nodejs
RUN rm -rf /var/lib/apt/lists/*

# Create a non-root user for security
RUN useradd --create-home --shell /bin/bash sandbox

USER root
WORKDIR /home/sandbox

# Copy and configure entrypoint
COPY --chown=sandbox:sandbox entrypoint.sh /home/sandbox/entrypoint.sh
RUN chmod +x /home/sandbox/entrypoint.sh

ENTRYPOINT ["/home/sandbox/entrypoint.sh"]
