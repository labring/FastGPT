# Dockerfile: FastGPT Agent Sandbox 运行时镜像（纯 OpenSandbox execd 数据面）
FROM ubuntu:24.04 AS runtime-base

ARG DEBIAN_FRONTEND=noninteractive

# 安装 sandbox 运行期基础工具链和中英文字体
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fontconfig \
    fonts-dejavu-core \
    fonts-noto-cjk \
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
    && curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash \
    && rm -rf /var/lib/apt/lists/*

# 创建非特权安全 sandbox 账户（uid 10001）与工作区挂载点
RUN useradd --create-home --shell /bin/bash --uid 10001 sandbox \
    && mkdir -p /workspace \
    && chown sandbox:sandbox /workspace

# 将用户态 Python/Node/Bun 全局安装目录指向持久化 /workspace/.fastgpt（下载缓存保留在容器本地磁盘以防小文件放大）
ENV PYTHONUSERBASE=/workspace/.fastgpt/python \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    NPM_CONFIG_PREFIX=/workspace/.fastgpt/npm \
    BUN_INSTALL=/workspace/.fastgpt/bun \
    BUN_INSTALL_CACHE_DIR=/tmp/.bun-cache \
    PATH="/workspace/.fastgpt/python/bin:/workspace/.fastgpt/npm/bin:/workspace/.fastgpt/bun/bin:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin"

COPY --chown=sandbox:sandbox --chmod=0755 projects/agent-sandbox/entrypoint.sh /home/sandbox/entrypoint.sh

# root 权限镜像，用于需要写入系统目录（例如 /etc/apt）的场景。
FROM runtime-base AS root
WORKDIR /workspace
ENTRYPOINT ["/home/sandbox/entrypoint.sh"]

# 默认镜像保持非特权运行（uid 10001）。
FROM runtime-base AS nonroot
USER sandbox
WORKDIR /workspace
ENTRYPOINT ["/home/sandbox/entrypoint.sh"]
