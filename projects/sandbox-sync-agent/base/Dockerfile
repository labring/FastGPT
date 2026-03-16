# Skill Sandbox 基础镜像
# 提供 code-server 开发环境，供 K8s Sidecar 和 Docker 双进程两种运行时使用
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

# Install code-server using the official script
RUN curl -fsSL https://code-server.dev/install.sh | sh

# Create a non-root user for security
RUN useradd --create-home --shell /bin/bash sandbox

USER sandbox
WORKDIR /home/sandbox

# Copy VS Code settings
RUN mkdir -p /home/sandbox/.local/share/code-server/User
COPY --chown=sandbox:sandbox settings.json /home/sandbox/.local/share/code-server/User/settings.json

# Copy and configure entrypoint
COPY --chown=sandbox:sandbox entrypoint.sh /home/sandbox/entrypoint.sh
RUN chmod +x /home/sandbox/entrypoint.sh

# Expose code-server port
EXPOSE 8080

ENTRYPOINT ["/home/sandbox/entrypoint.sh"]
