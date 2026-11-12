#!/usr/bin/env bash
# Stage I5b：MCP OAuth v2.4 真实栈编排（本地沙箱用，非 CI）。
#
# 依赖顺序：
#   1) docker：Mongo(replica set rs0) / Redis / Postgres(pgvector) / MinIO
#   2) FastGPT-Plugin 桩（instrumentation-check）
#   3) OAuth AS + MCP server fixture（test/fixtures/mcpOAuth/server.mjs）
#   4) FastGPT Next dev（HTTPS 自签，端口 3005，FE_DOMAIN=https://203.0.113.10:3005）
#   5) 轮询 /api/common/system/getInitData 直到就绪
#
# 前置：
#   - plans/e2e-real-v24/env.fastgpt（600，含随机密钥；不打印内容）
#   - plans/e2e-real-v24/tls/{cert.pem,key.pem}（SAN: 203.0.113.10）
#   - 203.0.113.10 已绑到 lo（CIMD 要求 https 形态的公开 base URL）
#
# 用法：bash test/e2e/mcpOAuth/runRealStack.sh [start|stop|status|fixture]
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PLANS_DIR="${PLANS_DIR:-$ROOT/../../plans/e2e-real-v24}"
ENV_FILE="${ENV_FILE:-$PLANS_DIR/env.fastgpt}"
TLS_DIR="${TLS_DIR:-$PLANS_DIR/tls}"
LOG_DIR="${LOG_DIR:-$PLANS_DIR/logs}"
NODE_BIN="${NODE_BIN:-$HOME/.nvm/versions/node/v22.23.2/bin}"
FASTGPT_PORT="${FASTGPT_PORT:-3005}"
FIXTURE_PORT="${FIXTURE_PORT:-18110}"
STUB_PLUGIN_PORT="${STUB_PLUGIN_PORT:-3004}"

export PATH="$NODE_BIN:$PATH"

mkdir -p "$LOG_DIR"

docker_cli() { sudo -n docker "$@"; }

ensure_container() {
  local name="$1" image="$2"; shift 2
  if docker_cli ps -a --format '{{.Names}}' | grep -qx "$name"; then
    if ! docker_cli ps --format '{{.Names}}' | grep -qx "$name"; then
      docker_cli start "$name" >/dev/null
    fi
  else
    docker_cli run -d --name "$name" "$@" "$image" >/dev/null
  fi
}

start_fixture() {
  if ss -lnt 2>/dev/null | grep -q ":$FIXTURE_PORT "; then
    echo "[stack] fixture already listening on :$FIXTURE_PORT"
    return 0
  fi
  echo "[stack] OAuth fixture :$FIXTURE_PORT"
  NODE_EXTRA_CA_CERTS="$TLS_DIR/cert.pem" \
  MCP_FIXTURE_PORT="$FIXTURE_PORT" \
  MCP_FIXTURE_MODE="${MCP_FIXTURE_MODE:-all}" \
  MCP_FIXTURE_TTL="${MCP_FIXTURE_TTL:-3600}" \
  MCP_FIXTURE_CONSENT="${MCP_FIXTURE_CONSENT:-auto}" \
  MCP_FIXTURE_PRM_MODE="${MCP_FIXTURE_PRM_MODE:-present}" \
  MCP_FIXTURE_CIMD_INSECURE_TLS=1 \
    nohup node "$ROOT/test/fixtures/mcpOAuth/server.mjs" > "$LOG_DIR/fixture.log" 2>&1 &
  echo $! > "$LOG_DIR/fixture.pid"
}

start() {
  echo "[stack] docker dependencies"
  ensure_container fastgpt-mongo mongo:5.0.32 -p 127.0.0.1:27017:27017 mongo --replSet rs0 --bind_ip_all
  ensure_container fastgpt-redis redis:7.2-alpine -p 127.0.0.1:6379:6379
  ensure_container fastgpt-pg pgvector/pgvector:0.8.0-pg15 -p 127.0.0.1:5432:5432 \
    -e POSTGRES_PASSWORD=fastgpt -e POSTGRES_DB=fastgpt
  ensure_container fastgpt-minio minio/minio:RELEASE.2025-09-07T16-13-09Z \
    -p 127.0.0.1:9000:9000 -p 127.0.0.1:9001:9001 \
    -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin server /data --console-address :9001

  docker_cli exec fastgpt-mongo mongosh --quiet --eval \
    'try { rs.status() } catch (e) { rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]}) }' >/dev/null 2>&1 || true

  echo "[stack] stub plugin server :$STUB_PLUGIN_PORT"
  if ! ss -lnt 2>/dev/null | grep -q ":$STUB_PLUGIN_PORT "; then
    set -a; . "$ENV_FILE"; set +a
    STUB_PLUGIN_PORT="$STUB_PLUGIN_PORT" nohup node "$ROOT/test/e2e/mcpOAuth/stubPluginServer.mjs" \
      > "$LOG_DIR/stub-plugin.log" 2>&1 &
    echo $! > "$LOG_DIR/stub-plugin.pid"
  fi

  start_fixture

  if ss -lnt 2>/dev/null | grep -q ":$FASTGPT_PORT "; then
    echo "[stack] FastGPT already listening on :$FASTGPT_PORT"
    return 0
  fi

  echo "[stack] FastGPT Next dev :$FASTGPT_PORT"
  set -a; . "$ENV_FILE"; set +a
  ( cd "$ROOT/projects/app" && nohup pnpm exec next dev --port "$FASTGPT_PORT" \
      --experimental-https \
      --experimental-https-key "$TLS_DIR/key.pem" \
      --experimental-https-cert "$TLS_DIR/cert.pem" \
      > "$LOG_DIR/fastgpt-dev.log" 2>&1 & echo $! > "$LOG_DIR/fastgpt-dev.pid" )

  local base="${FASTGPT_BASE_URL:-https://203.0.113.10:$FASTGPT_PORT}"
  echo "[stack] waiting for $base (compile may take minutes)"
  for _ in $(seq 1 120); do
    if curl -sf --cacert "$TLS_DIR/cert.pem" --max-time 10 "$base/api/common/system/getInitData" >/dev/null; then
      echo "[stack] FastGPT ready: $base"
      return 0
    fi
    sleep 3
  done
  echo "[stack] FastGPT did not become ready; see $LOG_DIR/fastgpt-dev.log" >&2
  return 1
}

stop() {
  for pidfile in "$LOG_DIR"/fastgpt-dev.pid "$LOG_DIR"/fixture.pid "$LOG_DIR"/stub-plugin.pid; do
    [ -f "$pidfile" ] && kill "$(cat "$pidfile")" 2>/dev/null || true
    rm -f "$pidfile"
  done
  echo "[stack] stopped app-level processes (docker containers left running)"
}

status() {
  ss -lnt 2>/dev/null | grep -E ":($FASTGPT_PORT|$FIXTURE_PORT|$STUB_PLUGIN_PORT) " || true
  docker_cli ps --format '{{.Names}}\t{{.Status}}'
}

case "${1:-start}" in
  start) start ;;
  fixture) start_fixture ;;
  stop) stop ;;
  status) status ;;
  *) echo "usage: $0 [start|fixture|stop|status]" >&2; exit 2 ;;
esac
