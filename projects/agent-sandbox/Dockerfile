# Agent Sandbox 镜像
# 提供 code-server 开发环境
#
# 构建：docker build -t fastgpt-agent-sandbox:latest .
# 产物：fastgpt-agent-sandbox:latest
FROM ubuntu:24.04

# Avoid prompts during installation
ENV DEBIAN_FRONTEND=noninteractive
ENV BUN_INSTALL=/usr/local
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

# Install sandbox runtime tools.
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    git \
    jq \
    python3 \
    python3-pip \
    ripgrep \
    tree \
    vim-tiny \
    unzip \
    zip \
    && curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && curl -fsSL https://bun.sh/install | bash \
    && for tool in bash python3 node bun git curl; do command -v "$tool"; done \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security. Keep /workspace owned by this user so
# Docker named volumes initialized from the image remain writable by sandbox.
RUN useradd --create-home --shell /bin/bash --uid 10001 sandbox \
    && mkdir -p /workspace \
    && chown -R sandbox:sandbox /home/sandbox /workspace

USER sandbox
WORKDIR /home/sandbox

# Copy and configure entrypoint
COPY --chown=sandbox:sandbox entrypoint.sh /home/sandbox/entrypoint.sh
RUN chmod +x /home/sandbox/entrypoint.sh

ENTRYPOINT ["/home/sandbox/entrypoint.sh"]
