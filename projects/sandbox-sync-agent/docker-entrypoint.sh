#!/bin/bash
set -e

# 配置 MinIO Client
mc alias set minio ${FASTGPT_MINIO_ENDPOINT} ${FASTGPT_MINIO_ACCESS_KEY} ${FASTGPT_MINIO_SECRET_KEY} --api S3v4

# 确保 bucket 存在
mc mb minio/${FASTGPT_MINIO_BUCKET} --ignore-existing || true

# Prepare work directory with correct permissions
export FASTGPT_WORKDIR="${FASTGPT_WORKDIR:-/home/sandbox}"
mkdir -p "${FASTGPT_WORKDIR}"

# 是否启动 code-server（默认 true）
# 仅需文件同步时设置 FASTGPT_ENABLE_CODE_SERVER=false
export FASTGPT_ENABLE_CODE_SERVER=${FASTGPT_ENABLE_CODE_SERVER:-true}

# 使用 supervisord 启动进程
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
