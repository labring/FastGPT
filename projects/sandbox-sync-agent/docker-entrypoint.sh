#!/bin/bash
set -e

# 配置 MinIO Client
mc alias set minio ${MINIO_ENDPOINT} ${MINIO_ACCESS_KEY} ${MINIO_SECRET_KEY} --api S3v4

# 确保 bucket 存在
mc mb minio/${MINIO_BUCKET} --ignore-existing || true

# 是否启动 code-server（默认 true）
# 仅需文件同步时设置 ENABLE_CODE_SERVER=false
export ENABLE_CODE_SERVER=${ENABLE_CODE_SERVER:-true}

# 使用 supervisord 启动进程
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
