#!/bin/sh
set -e

# 配置 MinIO Client
mc alias set minio ${MINIO_ENDPOINT} ${MINIO_ACCESS_KEY} ${MINIO_SECRET_KEY} --api S3v4

# 确保 bucket 存在
mc mb minio/${MINIO_BUCKET} --ignore-existing || true

# 启动 sync 服务
exec /sync.sh
