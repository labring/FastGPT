# Multi-stage build for extremely lightweight fastgpt-agent-sandbox-proxy binary extraction image

# Stage 1: Build the binary inside high-performance Rust compiler container
FROM rust:1.95-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates musl-tools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/fastgpt-agent-sandbox-proxy

# COPY the fastgpt-agent-sandbox-proxy crate from the Docker build context.
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
    cp target/"$TARGET"/release/fastgpt-agent-sandbox-proxy dist/fastgpt-agent-sandbox-proxy

# Stage 2: Final static binary runtime image
FROM scratch

LABEL org.opencontainers.image.authors="The FastGPT Authors"
LABEL description="Static runtime image for fastgpt-agent-sandbox-proxy"

# Keep HTTPS verification working when FASTGPT_APP_URL uses TLS.
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# Copy compiled executable to standard path. The scratch image runs as root by default,
# so it can still bind the configured port 1006.
COPY --chmod=755 --from=builder /usr/src/fastgpt-agent-sandbox-proxy/dist/fastgpt-agent-sandbox-proxy /usr/local/bin/fastgpt-agent-sandbox-proxy

EXPOSE 1006

CMD ["/usr/local/bin/fastgpt-agent-sandbox-proxy"]
