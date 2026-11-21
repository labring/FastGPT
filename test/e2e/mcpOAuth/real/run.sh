#!/usr/bin/env bash
# One-command MCP OAuth v2.4 E2E against a REAL authorization server.
#
#   E2E_ENV_FILE=/tmp/mcp-oauth-e2e/app.env \
#     E2E_AS_MODE=real ./test/e2e/mcpOAuth/real/run.sh
#
# Topology (desktop 109 -> desktop 106):
#   FastGPT (next start, production) --http--> host.docker.internal:18200
#   /etc/hosts: host.docker.internal -> 172.17.0.34 (this host)
#   asProxy   : 172.17.0.34:18200 -> 172.17.0.22:18200 (real AS on 106)
#
# The proxy is test-only. It records method/path/status so the AS boundary is
# observable from 109; the AS on 106 is never modified or restarted.
#
# Two server phases are required because CIMD availability is gated by
# FE_DOMAIN being https (production rule, unchanged):
#   phase cimd: FE_DOMAIN=https://172.17.0.34:13101 -> clientSource=cimd
#   phase dcr : FE_DOMAIN=http://127.0.0.1:13100  -> clientSource=dcr (full flow)
#
# Exit codes: 0 all assertions passed, 1 assertion failures, 2 missing env,
# 3 stack not ready, 4 port occupied.
set -euo pipefail

export PATH=/config/.nvm/versions/node/v22.23.2/bin:${PATH}

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
E2E_DIR="$REPO_ROOT/test/e2e/mcpOAuth/real"
APP_DIR="$REPO_ROOT/projects/app"
E2E_ENV_FILE=${E2E_ENV_FILE:-/tmp/mcp-oauth-e2e/app.env}
E2E_STATE_DIR=${E2E_STATE_DIR:-/tmp/mcp-oauth-e2e}
E2E_AS_MODE=${E2E_AS_MODE:-real}

AS_UPSTREAM_HOST=${AS_UPSTREAM_HOST:-172.17.0.22}
AS_UPSTREAM_PORT=${AS_UPSTREAM_PORT:-18200}
AS_PROXY_HOST=${AS_PROXY_HOST:-172.17.0.34}
AS_PROXY_PORT=${AS_PROXY_PORT:-18200}
AS_BASE_URL=${E2E_AS_BASE_URL:-http://host.docker.internal:18200}

DCR_PORT=${E2E_DCR_PORT:-13100}
CIMD_PORT=${E2E_CIMD_PORT:-13101}
DCR_BASE=http://127.0.0.1:${DCR_PORT}
CIMD_BASE=http://127.0.0.1:${CIMD_PORT}
CIMD_FE_DOMAIN=https://${AS_PROXY_HOST}:${CIMD_PORT}

LOG_DIR="$E2E_STATE_DIR/logs"
AS_PROXY_LOG="$E2E_STATE_DIR/as-proxy.log"
HOSTS_MARKER='# mcp-oauth-real-e2e'
HOSTS_BACKUP="$E2E_STATE_DIR/etc-hosts.backup"

if [ "$E2E_AS_MODE" != "real" ]; then
  echo "[e2e-real] unsupported E2E_AS_MODE=$E2E_AS_MODE (expected: real)" >&2
  exit 2
fi

if [ ! -f "$E2E_ENV_FILE" ]; then
  echo "[e2e-real] missing env file: $E2E_ENV_FILE" >&2
  exit 2
fi

mkdir -p "$E2E_STATE_DIR" "$LOG_DIR"
chmod 700 "$E2E_STATE_DIR"
: >"$AS_PROXY_LOG"

set -a
# shellcheck disable=SC1090
. "$E2E_ENV_FILE"
set +a

: "${MONGODB_URI:?MONGODB_URI missing in $E2E_ENV_FILE}"
: "${REDIS_URL:?REDIS_URL missing in $E2E_ENV_FILE}"
: "${PG_URL:?PG_URL missing in $E2E_ENV_FILE}"
: "${AES256_SECRET_KEY:?AES256_SECRET_KEY missing}"

if [ "${CHECK_INTERNAL_IP:-false}" = "true" ]; then
  echo "[e2e-real] CHECK_INTERNAL_IP=true would block 172.17.x; this suite needs the default false" >&2
  exit 2
fi
if [ "${MCP_OAUTH_ALLOW_INSECURE_HTTP:-false}" != "true" ]; then
  echo "[e2e-real] MCP_OAUTH_ALLOW_INSECURE_HTTP must be true (real AS is http on the private network)" >&2
  exit 2
fi

PIDS=()
HOSTS_MODIFIED=0

# next start spawns a next-server child; kill the whole tree.
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill -TERM "$pid" 2>/dev/null || true
}

cleanup() {
  local exit_code=$?
  for pid in "${PIDS[@]:-}"; do
    [ -n "${pid:-}" ] || continue
    kill_tree "$pid"
  done
  sleep 1
  for pid in "${PIDS[@]:-}"; do
    [ -n "${pid:-}" ] || continue
    kill -KILL "$pid" 2>/dev/null || true
  done

  if [ "$HOSTS_MODIFIED" = "1" ] && [ -f "$HOSTS_BACKUP" ]; then
    sudo -n cp "$HOSTS_BACKUP" /etc/hosts 2>/dev/null || sudo -n tee /etc/hosts <"$HOSTS_BACKUP" >/dev/null
    echo "[e2e-real] /etc/hosts restored; getent: $(getent hosts host.docker.internal || echo 'no entry')"
  fi

  if [ "${E2E_KEEP_DB:-0}" != "1" ]; then
    (cd "$APP_DIR" && node -e '
      const mongoose = require("mongoose");
      const uri = process.env.MONGODB_URI;
      (async () => {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        await mongoose.connection.dropDatabase().catch(() => {});
        await mongoose.connection.client.db("fastgpt_mcp_oauth_real_e2e_log").dropDatabase().catch(() => {});
        await mongoose.disconnect();
      })().catch(() => process.exit(0));
    ') || true
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

port_open() {
  (exec 3<>"/dev/tcp/$1/$2") 2>/dev/null && exec 3>&- && return 0 || return 1
}

ensure_port_free() {
  if port_open "$1" "$2"; then
    echo "[e2e-real] port $1:$2 is already in use; stop it before running this suite" >&2
    exit 4
  fi
}

setup_hosts() {
  local current
  current=$(getent hosts host.docker.internal | awk '{print $1}' | tr '\n' ' ' || true)
  if [ -n "$current" ]; then
    case " $current " in
      *" $AS_PROXY_HOST "*) echo "[e2e-real] hosts already maps host.docker.internal -> $AS_PROXY_HOST"; return 0 ;;
      *) echo "[e2e-real] host.docker.internal already resolves to '$current'; refusing to modify" >&2; exit 2 ;;
    esac
  fi
  cp -a /etc/hosts "$HOSTS_BACKUP"
  echo "$AS_PROXY_HOST host.docker.internal $HOSTS_MARKER" | sudo -n tee -a /etc/hosts >/dev/null
  HOSTS_MODIFIED=1
  echo "[e2e-real] /etc/hosts: host.docker.internal -> $AS_PROXY_HOST (backup: $HOSTS_BACKUP)"
}

start_proxy() {
  echo "[e2e-real] starting AS boundary proxy $AS_PROXY_HOST:$AS_PROXY_PORT -> $AS_UPSTREAM_HOST:$AS_UPSTREAM_PORT"
  env AS_PROXY_HOST="$AS_PROXY_HOST" AS_PROXY_PORT="$AS_PROXY_PORT" \
    AS_UPSTREAM_HOST="$AS_UPSTREAM_HOST" AS_UPSTREAM_PORT="$AS_UPSTREAM_PORT" \
    AS_PROXY_LOG="$AS_PROXY_LOG" \
    node "$E2E_DIR/lib/asProxy.mjs" >"$LOG_DIR/as-proxy.log" 2>&1 < /dev/null &
  local pid=$!
  PIDS+=("$pid")
  echo "$pid" >"$LOG_DIR/as-proxy.pid"
  for _ in $(seq 1 30); do
    port_open "$AS_PROXY_HOST" "$AS_PROXY_PORT" && return 0
    sleep 0.3
  done
  echo "[e2e-real] proxy did not start; see $LOG_DIR/as-proxy.log" >&2
  exit 3
}

start_plugin() {
  if port_open 127.0.0.1 3999; then
    echo "[e2e-real] reusing plugin stub on 3999"
    return 0
  fi
  setsid env STUB_PLUGIN_PORT=3999 PLUGIN_TOKEN="${PLUGIN_TOKEN:-}" \
    node "$REPO_ROOT/test/e2e/mcpOAuth/stubPluginServer.mjs" \
    >"$LOG_DIR/plugin.log" 2>&1 < /dev/null &
  PIDS+=("$!")
  echo "plugin=$!" >>"$LOG_DIR/pids.txt"
}

start_app() {
  local port="$1" fe_domain="$2" log_name="$3"
  echo "[e2e-real] starting FastGPT (production) on :$port FE_DOMAIN=$fe_domain"
  (
    cd "$APP_DIR"
    env PORT="$port" FE_DOMAIN="$fe_domain" NODE_ENV=production \
      node "$APP_DIR/node_modules/next/dist/bin/next" start -p "$port" -H 127.0.0.1 \
      >"$LOG_DIR/$log_name" 2>&1 < /dev/null
  ) &
  local pid=$!
  PIDS+=("$pid")
  echo "$pid" >"$LOG_DIR/$log_name.pid"

  for _ in $(seq 1 120); do
    if curl -fsS -o /dev/null --max-time 3 "http://127.0.0.1:$port/login"; then
      echo "[e2e-real] FastGPT ready on :$port"
      return 0
    fi
    sleep 1
  done
  echo "[e2e-real] FastGPT did not become ready; see $LOG_DIR/$log_name" >&2
  exit 3
}

stop_app() {
  local log_name="$1"
  local pidfile="$LOG_DIR/$log_name.pid"
  [ -f "$pidfile" ] || return 0
  local pid
  pid=$(cat "$pidfile")
  kill_tree "$pid"
  for _ in $(seq 1 20); do
    port_open 127.0.0.1 "$2" || break
    sleep 0.5
  done
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill -KILL "$child" 2>/dev/null || true
  done
  kill -KILL "$pid" 2>/dev/null || true
  rm -f "$pidfile"
}

echo "[e2e-real] repo : $REPO_ROOT"
echo "[e2e-real] env  : $E2E_ENV_FILE"
echo "[e2e-real] AS   : $AS_BASE_URL (upstream $AS_UPSTREAM_HOST:$AS_UPSTREAM_PORT)"

if [ ! -f "$APP_DIR/.next/BUILD_ID" ]; then
  echo "[e2e-real] no production build, running pnpm --filter @fastgpt/app build ..."
  (cd "$REPO_ROOT" && NEXT_TELEMETRY_DISABLED=1 pnpm --filter @fastgpt/app build)
fi

ensure_port_free 127.0.0.1 "$DCR_PORT"
ensure_port_free 127.0.0.1 "$CIMD_PORT"
setup_hosts
start_proxy
start_plugin

CIMD_EXIT=0
DCR_EXIT=0

# ---------- phase 1: CIMD (FE_DOMAIN https) ----------
start_app "$CIMD_PORT" "$CIMD_FE_DOMAIN" "server-cimd.log"
set +e
E2E_PHASE=cimd \
E2E_APP_BASE_URL="$CIMD_BASE" \
E2E_FE_DOMAIN="$CIMD_FE_DOMAIN" \
E2E_AS_BASE_URL="$AS_BASE_URL" \
E2E_AS_PROXY_LOG="$AS_PROXY_LOG" \
E2E_EVIDENCE_PATH="$E2E_STATE_DIR/evidence-cimd.json" \
MONGODB_URI="$MONGODB_URI" REDIS_URL="$REDIS_URL" AES256_SECRET_KEY="$AES256_SECRET_KEY" \
  node "$E2E_DIR/run.mjs"
CIMD_EXIT=$?
set -e
stop_app "server-cimd.log" "$CIMD_PORT"

# ---------- phase 2: DCR (FE_DOMAIN http) full flow ----------
start_app "$DCR_PORT" "$DCR_BASE" "server-dcr.log"
set +e
E2E_PHASE=dcr \
E2E_APP_BASE_URL="$DCR_BASE" \
E2E_FE_DOMAIN="$DCR_BASE" \
E2E_AS_BASE_URL="$AS_BASE_URL" \
E2E_AS_PROXY_LOG="$AS_PROXY_LOG" \
E2E_EVIDENCE_PATH="$E2E_STATE_DIR/evidence-dcr.json" \
MONGODB_URI="$MONGODB_URI" REDIS_URL="$REDIS_URL" AES256_SECRET_KEY="$AES256_SECRET_KEY" \
  node "$E2E_DIR/run.mjs"
DCR_EXIT=$?
set -e
stop_app "server-dcr.log" "$DCR_PORT"

node "$E2E_DIR/lib/mergeEvidence.mjs" \
  "$E2E_STATE_DIR/evidence-cimd.json" "$E2E_STATE_DIR/evidence-dcr.json" \
  "$E2E_STATE_DIR/evidence.json" "$AS_PROXY_LOG" >"$E2E_STATE_DIR/summary.txt" || true
cat "$E2E_STATE_DIR/summary.txt"

if [ "$CIMD_EXIT" != "0" ] || [ "$DCR_EXIT" != "0" ]; then
  echo "[e2e-real] FAILED (cimd=$CIMD_EXIT dcr=$DCR_EXIT)" >&2
  exit 1
fi
echo "[e2e-real] PASS"
