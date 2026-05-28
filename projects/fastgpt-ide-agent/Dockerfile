# Multi-stage build for extremely lightweight fastgpt-ide-agent binary extraction image

# Stage 1: Build the binary inside high-performance Rust compiler container
FROM rust:1.95-slim AS builder

WORKDIR /usr/src/fastgpt-ide-agent

# COPY the entire fastgpt-ide-agent workspace relative to project root
COPY projects/fastgpt-ide-agent/ .

# Release build to produce optimized static/semi-static executable
RUN cargo build --release

# Stage 2: Final minimal extraction base image
FROM debian:bookworm-slim

LABEL org.opencontainers.image.authors="The FastGPT Authors"
LABEL description="Minimal extraction container for fastgpt-ide-agent binary used in devbox-runtime"

# Copy compiled executable to standard path
COPY --from=builder /usr/src/fastgpt-ide-agent/target/release/fastgpt-ide-agent /usr/local/bin/fastgpt-ide-agent
RUN chmod +x /usr/local/bin/fastgpt-ide-agent

EXPOSE 1318

CMD ["fastgpt-ide-agent"]
