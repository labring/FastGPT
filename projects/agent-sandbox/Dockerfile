# Dockerfile: Sandbox 镜像与内置极轻量 fastgpt-ide-agent
#
# Stage 1: 使用 cargo-chef 缓存并编译外部依赖
FROM rust:1.95-slim AS chef
RUN cargo install cargo-chef \
    && apt-get update && apt-get install -y --no-install-recommends musl-tools \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/fastgpt-ide-agent

# Stage 1.1: 准备配方 (将项目目录下的所有真实文件平铺拷贝至当前 WORKDIR，确保绝对的路径兼容性)
FROM chef AS planner
COPY projects/fastgpt-ide-agent/ .
RUN cargo chef prepare --recipe-path recipe.json

# Stage 1.2: 编译依赖
FROM chef AS builder
COPY --from=planner /usr/src/fastgpt-ide-agent/recipe.json recipe.json
RUN export ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        TARGET="x86_64-unknown-linux-musl"; \
    elif [ "$ARCH" = "aarch64" ]; then \
        TARGET="aarch64-unknown-linux-musl"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    rustup target add "$TARGET" && \
    cargo chef cook --release --locked --target "$TARGET" --recipe-path recipe.json

# Stage 1.3: 编译源码 (平铺拷贝真实 src 目录进行最终 Release 编译)
COPY projects/fastgpt-ide-agent/src/ src/
RUN touch src/main.rs && \
    export ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        TARGET="x86_64-unknown-linux-musl"; \
    elif [ "$ARCH" = "aarch64" ]; then \
        TARGET="aarch64-unknown-linux-musl"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    cargo build --release --locked --target "$TARGET" && \
    mkdir -p dist && \
    cp target/"$TARGET"/release/fastgpt-ide-agent dist/fastgpt-ide-agent

# Stage 2: 运行时环境配置
FROM ubuntu:24.04 AS runtime-base

ENV DEBIAN_FRONTEND=noninteractive
ENV BUN_INSTALL=/usr/local
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

# 安装 sandbox 运行期基础工具链和中英文字体
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
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
    && curl -fsSL https://bun.sh/install | bash \
    && rm -rf /var/lib/apt/lists/*

# 创建非特权安全 sandbox 账户
RUN useradd --create-home --shell /bin/bash --uid 10001 sandbox \
    && mkdir -p /workspace \
    && chown -R sandbox:sandbox /home/sandbox /workspace

# 拷贝 Rust Agent 二进制文件和启动脚本
COPY --from=builder /usr/src/fastgpt-ide-agent/dist/fastgpt-ide-agent /usr/local/bin/fastgpt-ide-agent
RUN chmod +x /usr/local/bin/fastgpt-ide-agent
COPY --chown=sandbox:sandbox projects/agent-sandbox/entrypoint.sh /home/sandbox/entrypoint.sh
RUN chmod +x /home/sandbox/entrypoint.sh

# root 权限镜像，用于需要写入系统目录（例如 /etc/apt）的场景。
FROM runtime-base AS root
WORKDIR /home/sandbox
ENTRYPOINT ["/home/sandbox/entrypoint.sh"]

# 默认镜像保持非特权运行，兼容现有 fastgpt-agent-sandbox 用法。
FROM runtime-base AS nonroot
USER sandbox
WORKDIR /home/sandbox
ENTRYPOINT ["/home/sandbox/entrypoint.sh"]
