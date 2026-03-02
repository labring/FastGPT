# Skill Sandbox 基础镜像
# 提供 code-server 开发环境，供 K8s Sidecar 和 Docker 双进程两种运行时使用
#
# 构建：docker build -t skill-agent/sandbox:v1 .
# 产物：skill-agent/sandbox:v1
FROM ubuntu:24.04

# Avoid prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y \
    unzip \
    curl \
    ca-certificates \
    sudo \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install code-server using the official script
RUN curl -fsSL https://code-server.dev/install.sh | sh

# Create a non-root user for security
RUN useradd -m -s /bin/bash coder

# Create the workspace directory and set permissions
RUN mkdir -p /workspace/projects && \
    chown -R coder:coder /workspace/projects

USER coder
WORKDIR /workspace/projects

# Copy VS Code settings
RUN mkdir -p /home/coder/.local/share/code-server/User
COPY --chown=coder:coder settings.json /home/coder/.local/share/code-server/User/settings.json

# Copy and configure entrypoint
COPY --chown=coder:coder entrypoint.sh /home/coder/entrypoint.sh
RUN chmod +x /home/coder/entrypoint.sh

# Expose code-server port
EXPOSE 8080

ENTRYPOINT ["/home/coder/entrypoint.sh"]
