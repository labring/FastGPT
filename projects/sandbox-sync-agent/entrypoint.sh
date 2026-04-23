#!/bin/sh
set -e

# 配置 MinIO Client
mc alias set minio ${FASTGPT_MINIO_ENDPOINT} ${FASTGPT_MINIO_ACCESS_KEY} ${FASTGPT_MINIO_SECRET_KEY} --api S3v4

# 确保 bucket 存在
mc mb minio/${FASTGPT_MINIO_BUCKET} --ignore-existing || true

# Pass FASTGPT_WORKDIR as FASTGPT_SYNC_PATH if FASTGPT_SYNC_PATH is not explicitly set
if [ -z "${FASTGPT_SYNC_PATH}" ] && [ -n "${FASTGPT_WORKDIR}" ]; then
  export FASTGPT_SYNC_PATH="${FASTGPT_WORKDIR}"
fi

# 启动 sync 服务
exec /sync.sh
