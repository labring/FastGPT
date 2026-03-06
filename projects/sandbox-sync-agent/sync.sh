#!/bin/sh

SYNC_PATH=${FASTGPT_SYNC_PATH:-/home/sandbox}
BUCKET_PATH="minio/${FASTGPT_MINIO_BUCKET}/agent-sessions/${FASTGPT_SESSION_ID}"
SYNC_INTERVAL=${SYNC_INTERVAL:-60}
HTTP_PORT=${HTTP_PORT:-8081}
STATE_DIR="${STATE_DIR:-/tmp/sync-state}"
# K8s 模式默认 /http_server.py，Docker 模式通过 supervisord.conf 注入 /opt/sync-agent/http_server.py
HTTP_SERVER_PATH="${HTTP_SERVER_PATH:-/http_server.py}"

mkdir -p "${STATE_DIR}"

LAST_SYNC_FILE="${STATE_DIR}/last_sync"
PENDING_FILE="${STATE_DIR}/pending_count"
TRIGGER_FILE="${STATE_DIR}/trigger"

# 初始化状态
date -u +%Y-%m-%dT%H:%M:%SZ > "${LAST_SYNC_FILE}"
echo "0" > "${PENDING_FILE}"

# 1. 启动时下载历史文件
echo "[Sync] Downloading files from ${BUCKET_PATH}..."
mc mirror "${BUCKET_PATH}" "${SYNC_PATH}" --overwrite || true
date -u +%Y-%m-%dT%H:%M:%SZ > "${LAST_SYNC_FILE}"

# 2. 启动 HTTP 健康检查服务（后台）
echo "[Sync] Starting HTTP server on port ${HTTP_PORT}..."
python3 "${HTTP_SERVER_PATH}" &

# 3. 启动后台全量同步（定时 + 手动触发）
(
  while true; do
    sleep "${SYNC_INTERVAL}"

    # 检查手动触发
    if [ -f "${TRIGGER_FILE}" ]; then
      rm -f "${TRIGGER_FILE}"
      echo "[Sync] Manual sync triggered via POST /sync"
    fi

    echo "[Sync] Periodic sync to MinIO..."
    mc mirror "${SYNC_PATH}" "${BUCKET_PATH}" --overwrite
    date -u +%Y-%m-%dT%H:%M:%SZ > "${LAST_SYNC_FILE}"
    echo "0" > "${PENDING_FILE}"
  done
) &

# 4. 使用 inotify 监听实时变更（前台，保持进程存活）
echo "[Sync] Watching ${SYNC_PATH} for changes..."
inotifywait -m -r -e create,modify,move,delete --format '%w%f' "${SYNC_PATH}" | while read -r file; do
  # 过滤临时文件（锚定行尾）
  if echo "$file" | grep -qE '\.(tmp|swp|~)$'; then
    continue
  fi

  echo "[Sync] Change detected: $file"

  # 更新待同步计数
  PENDING=$(cat "${PENDING_FILE}" 2>/dev/null || echo "0")
  echo $((PENDING + 1)) > "${PENDING_FILE}"

  # 计算相对路径
  rel_path="${file#${SYNC_PATH}/}"

  if [ -f "$file" ]; then
    # 文件创建/修改：上传到 MinIO
    mc cp "$file" "${BUCKET_PATH}/${rel_path}"
    date -u +%Y-%m-%dT%H:%M:%SZ > "${LAST_SYNC_FILE}"
    # 成功后将 pending 减 1
    PENDING=$(cat "${PENDING_FILE}" 2>/dev/null || echo "1")
    PENDING=$((PENDING - 1))
    [ "${PENDING}" -lt 0 ] && PENDING=0
    echo "${PENDING}" > "${PENDING_FILE}"
  elif [ ! -e "$file" ]; then
    # 文件删除
    mc rm "${BUCKET_PATH}/${rel_path}" || true
    date -u +%Y-%m-%dT%H:%M:%SZ > "${LAST_SYNC_FILE}"
    PENDING=$(cat "${PENDING_FILE}" 2>/dev/null || echo "1")
    PENDING=$((PENDING - 1))
    [ "${PENDING}" -lt 0 ] && PENDING=0
    echo "${PENDING}" > "${PENDING_FILE}"
  fi
done
