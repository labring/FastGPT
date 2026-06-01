# Multi-stage build for extremely lightweight fastgpt-ide-agent binary extraction image

# Stage 1: Build the binary inside high-performance Rust compiler container
FROM rust:1.95-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends musl-tools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/fastgpt-ide-agent

# COPY the fastgpt-ide-agent crate from the Docker build context.
COPY . .

# Release build to produce optimized static executable using adaptive musl target
RUN export ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        TARGET="x86_64-unknown-linux-musl"; \
    elif [ "$ARCH" = "aarch64" ]; then \
        TARGET="aarch64-unknown-linux-musl"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    rustup target add "$TARGET" && \
    cargo build --release --locked --target "$TARGET" && \
    mkdir -p dist && \
    cp target/"$TARGET"/release/fastgpt-ide-agent dist/fastgpt-ide-agent

# Stage 2: Final minimal extraction base image
FROM debian:bookworm-slim

LABEL org.opencontainers.image.authors="The FastGPT Authors"
LABEL description="Minimal extraction container for fastgpt-ide-agent binary used in devbox-runtime"

# Copy compiled executable to standard path
COPY --from=builder /usr/src/fastgpt-ide-agent/dist/fastgpt-ide-agent /usr/local/bin/fastgpt-ide-agent
RUN chmod +x /usr/local/bin/fastgpt-ide-agent \
    && useradd --system --create-home --home-dir /home/fastgpt --shell /usr/sbin/nologin fastgpt

USER fastgpt

EXPOSE 1318

CMD ["fastgpt-ide-agent"]
