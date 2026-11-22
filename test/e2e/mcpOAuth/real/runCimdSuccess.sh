#!/usr/bin/env bash
# One-command MCP OAuth v2.4 E2E: 「CIMD 直接成功」真实链路（phase=cimd-success）。
#
#   E2E_ENV_FILE=/tmp/mcp-oauth-e2e/app.env \
#     ./test/e2e/mcpOAuth/real/runCimdSuccess.sh
#
# 拓扑（全部在 desktop 109 本地；desktop 106 只读、不参与）：
#
#   FastGPT next start :13101 (production build)
#        ▲ http 127.0.0.1:13101
#   TLS 反代 172.17.0.34:18443  (Host: fastgpt-e2e.internal:18443)
#        ▲ https（自签 CA）
#   测试 AS 0.0.0.0:18300  (同一份上游 wille/mcp-oauth-server@8035903)
#        │ issuer=https://172.17.0.34:18300/
#        │ clientIdMetadataDocuments.validateClientIdUrl -> fastgpt-e2e.internal
#        ▼ 回源 GET https://fastgpt-e2e.internal:18443/.../client-metadata.json
#      TLS 反代 → FastGPT（200，Host 白名单命中）
#
# 为什么需要这个名字：上游 CIMD 在调用 validateClientIdUrl 之前就拒绝 IP 字面量，
# 所以 client_id 主机必须是域名；/etc/hosts 把 fastgpt-e2e.internal 指向 109 自己。
# 证书同时签 SAN DNS:fastgpt-e2e.internal, IP:172.17.0.34。
#
# 退出码：0 全部断言通过，1 断言失败，2 env 不满足，3 栈未就绪，4 端口被占用。
set -euo pipefail

export PATH=/config/.nvm/versions/node/v22.23.2/bin:${PATH}

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
E2E_DIR="$REPO_ROOT/test/e2e/mcpOAuth/real"
APP_DIR="$REPO_ROOT/projects/app"
E2E_ENV_FILE=${E2E_ENV_FILE:-/tmp/mcp-oauth-e2e/app.env}
E2E_STATE_DIR=${E2E_STATE_DIR:-/tmp/mcp-oauth-e2e}
E2E_UPSTREAM_DIR=${MCP_OAUTH_UPSTREAM_DIR:-/tmp/mcp-oauth-upstream}
NPM_REGISTRY=${E2E_NPM_REGISTRY:-http://mirrors.sangfor.org/nexus/repository/npm}
UPSTREAM_COMMIT=${MCP_OAUTH_UPSTREAM_COMMIT:-8035903}

APP_PORT=${E2E_APP_PORT:-13101}
AS_PORT=${E2E_LOCAL_AS_PORT:-18300}
PROXY_PORT=${E2E_TLS_PROXY_PORT:-18443}
HOST_IP=${E2E_HOST_IP:-172.17.0.34}
FE_HOST=${E2E_FE_HOST:-fastgpt-e2e.internal}
FE_DOMAIN="https://${FE_HOST}:${PROXY_PORT}"
AS_BASE="https://${HOST_IP}:${AS_PORT}"
APP_BASE="http://127.0.0.1:${APP_PORT}"

CERT_DIR="$E2E_STATE_DIR/certs"
CA_PEM="$CERT_DIR/ca.pem"
SERVER_KEY="$CERT_DIR/server.key"
SERVER_PEM="$CERT_DIR/server.pem"
LOG_DIR="$E2E_STATE_DIR/logs"
AS_LOG="$E2E_STATE_DIR/as-local.log"
PROXY_LOG="$E2E_STATE_DIR/tls-proxy.log"
EVIDENCE_PATH="$E2E_STATE_DIR/evidence-cimd-success.json"
HOSTS_MARKER='# mcp-oauth-cimd-success-e2e'
HOSTS_BACKUP="$E2E_STATE_DIR/etc-hosts.backup"

if [ ! -f "$E2E_ENV_FILE" ]; then
  echo "[cimd-success] missing env file: $E2E_ENV_FILE" >&2
  exit 2
fi

mkdir -p "$E2E_STATE_DIR" "$LOG_DIR" "$CERT_DIR"
chmod 700 "$E2E_STATE_DIR" "$CERT_DIR"

set -a
# shellcheck disable=SC1090
. "$E2E_ENV_FILE"
set +a

: "${MONGODB_URI:?MONGODB_URI missing in $E2E_ENV_FILE}"
: "${REDIS_URL:?REDIS_URL missing in $E2E_ENV_FILE}"
: "${PG_URL:?PG_URL missing in $E2E_ENV_FILE}"
: "${AES256_SECRET_KEY:?AES256_SECRET_KEY missing}"
if [ "${CHECK_INTERNAL_IP:-false}" = "true" ]; then
  echo "[cimd-success] CHECK_INTERNAL_IP=true would block 172.17.0.0/16; this suite needs the default false" >&2
  exit 2
fi

PIDS=()
HOSTS_MODIFIED=0

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
    echo "[cimd-success] /etc/hosts restored; getent: $(getent hosts "$FE_HOST" || echo 'no entry')"
  fi

  if [ "${E2E_KEEP_ARTIFACTS:-0}" != "1" ]; then
    rm -f "$SERVER_KEY" "$SERVER_PEM" "$CA_PEM" "$CERT_DIR/ca.key" "$CERT_DIR/ca.srl" \
      "$CERT_DIR/server.csr" "$CERT_DIR/server.ext"
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
    echo "[cimd-success] port $1:$2 is already in use; stop it before running this suite" >&2
    exit 4
  fi
}

ensure_upstream() {
  # 只作为测试依赖放在 /tmp，不提交进仓库。
  if [ ! -d "$E2E_UPSTREAM_DIR/.git" ]; then
    echo "[cimd-success] cloning upstream wille/mcp-oauth-server@$UPSTREAM_COMMIT -> $E2E_UPSTREAM_DIR"
    git clone --quiet http://mirrors.sangfor.org/github/wille/mcp-oauth-server.git "$E2E_UPSTREAM_DIR"
  fi
  ( cd "$E2E_UPSTREAM_DIR" && git checkout -q "$UPSTREAM_COMMIT" )
  if [ ! -x "$E2E_UPSTREAM_DIR/node_modules/.bin/tsx" ] || [ ! -d "$E2E_UPSTREAM_DIR/node_modules/express" ]; then
    echo "[cimd-success] installing upstream runtime deps (test-only)"
    (
      cd "$E2E_UPSTREAM_DIR"
      rm -f pnpm-lock.yaml package-lock.json
      rm -rf node_modules
      npm install --legacy-peer-deps --no-save --no-package-lock \
        --registry="$NPM_REGISTRY" --no-audit --no-fund \
        express@^5 express-rate-limit@^8 zod@^4 debug@^4 \
        "@modelcontextprotocol/sdk@^1.29.0" tsx@^4
    )
  fi
}

gen_certs() {
  if [ -s "$CA_PEM" ] && [ -s "$SERVER_KEY" ] && [ -s "$SERVER_PEM" ] &&
    openssl x509 -checkend 3600 -noout -in "$CA_PEM" >/dev/null 2>&1 &&
    openssl x509 -checkend 3600 -noout -in "$SERVER_PEM" >/dev/null 2>&1; then
    echo "[cimd-success] reusing test certificates in $CERT_DIR"
    return 0
  fi
  echo "[cimd-success] generating self-signed CA + server cert (SAN DNS:$FE_HOST, IP:$HOST_IP)"
  rm -f "$CA_PEM" "$SERVER_KEY" "$SERVER_PEM" "$CERT_DIR/server.csr" "$CERT_DIR/server.ext"
  openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 2 \
    -keyout "$CERT_DIR/ca.key" -out "$CA_PEM" \
    -subj "/CN=FastGPT MCP OAuth CIMD E2E CA" >/dev/null 2>&1
  openssl req -newkey rsa:2048 -nodes -sha256 \
    -keyout "$SERVER_KEY" -out "$CERT_DIR/server.csr" \
    -subj "/CN=$FE_HOST" >/dev/null 2>&1
  cat >"$CERT_DIR/server.ext" <<EOF
subjectAltName=DNS:$FE_HOST,IP:$HOST_IP
extendedKeyUsage=serverAuth
EOF
  openssl x509 -req -in "$CERT_DIR/server.csr" -CA "$CA_PEM" -CAkey "$CERT_DIR/ca.key" \
    -CAcreateserial -out "$SERVER_PEM" -days 2 -sha256 \
    -extfile "$CERT_DIR/server.ext" >/dev/null 2>&1
  chmod 600 "$CA_PEM" "$SERVER_KEY" "$SERVER_PEM" "$CERT_DIR/ca.key"
}

setup_hosts() {
  local current
  current=$(getent hosts "$FE_HOST" | awk '{print $1}' | tr '\n' ' ' || true)
  if [ -n "$current" ]; then
    case " $current " in
      *" $HOST_IP "*) echo "[cimd-success] hosts already maps $FE_HOST -> $HOST_IP"; return 0 ;;
      *) echo "[cimd-success] $FE_HOST already resolves to '$current'; refusing to modify" >&2; exit 2 ;;
    esac
  fi
  cp -a /etc/hosts "$HOSTS_BACKUP"
  echo "$HOST_IP $FE_HOST $HOSTS_MARKER" | sudo -n tee -a /etc/hosts >/dev/null
  HOSTS_MODIFIED=1
  echo "[cimd-success] /etc/hosts: $FE_HOST -> $HOST_IP (backup: $HOSTS_BACKUP)"
}

start_as() {
  echo "[cimd-success] starting local AS $AS_BASE (upstream: $E2E_UPSTREAM_DIR@$UPSTREAM_COMMIT)"
  (
    cd "$E2E_UPSTREAM_DIR"
    env MCP_OAUTH_UPSTREAM_DIR="$E2E_UPSTREAM_DIR" \
      AS_LISTEN_HOST=0.0.0.0 AS_LISTEN_PORT="$AS_PORT" AS_BASE="$AS_BASE" \
      E2E_FE_HOST="$FE_HOST" AS_TLS_KEY="$SERVER_KEY" AS_TLS_CERT="$SERVER_PEM" \
      AS_LOG="$AS_LOG" NODE_EXTRA_CA_CERTS="$CA_PEM" \
      "$E2E_UPSTREAM_DIR/node_modules/.bin/tsx" "$E2E_DIR/local-as/launcher.mjs" \
      >"$LOG_DIR/local-as.log" 2>&1 < /dev/null
  ) &
  PIDS+=("$!")
  echo "$!" >"$LOG_DIR/local-as.pid"
  for _ in $(seq 1 60); do
    if curl -ksS -o /dev/null --max-time 3 "$AS_BASE/health"; then
      echo "[cimd-success] AS ready on $AS_BASE"
      return 0
    fi
    sleep 0.5
  done
  echo "[cimd-success] AS did not start; see $LOG_DIR/local-as.log" >&2
  exit 3
}

start_proxy() {
  echo "[cimd-success] starting TLS proxy $FE_DOMAIN -> $APP_BASE"
  env PROXY_LISTEN_HOST="$HOST_IP" PROXY_LISTEN_PORT="$PROXY_PORT" \
    PROXY_TARGET_HOST=127.0.0.1 PROXY_TARGET_PORT="$APP_PORT" \
    PROXY_FORWARD_HOST="${FE_HOST}:${PROXY_PORT}" \
    PROXY_TLS_KEY="$SERVER_KEY" PROXY_TLS_CERT="$SERVER_PEM" PROXY_LOG="$PROXY_LOG" \
    node "$E2E_DIR/local-as/tlsProxy.mjs" >"$LOG_DIR/tls-proxy.log" 2>&1 < /dev/null &
  PIDS+=("$!")
  echo "$!" >"$LOG_DIR/tls-proxy.pid"
  for _ in $(seq 1 30); do
    port_open "$HOST_IP" "$PROXY_PORT" && return 0
    sleep 0.3
  done
  echo "[cimd-success] TLS proxy did not start; see $LOG_DIR/tls-proxy.log" >&2
  exit 3
}

start_plugin() {
  if port_open 127.0.0.1 3999; then
    echo "[cimd-success] reusing plugin stub on 3999"
    return 0
  fi
  setsid env STUB_PLUGIN_PORT=3999 PLUGIN_TOKEN="${PLUGIN_TOKEN:-}" \
    node "$REPO_ROOT/test/e2e/mcpOAuth/stubPluginServer.mjs" \
    >"$LOG_DIR/plugin.log" 2>&1 < /dev/null &
  PIDS+=("$!")
}

start_app() {
  echo "[cimd-success] starting FastGPT (production) on :$APP_PORT FE_DOMAIN=$FE_DOMAIN"
  (
    cd "$APP_DIR"
    env PORT="$APP_PORT" FE_DOMAIN="$FE_DOMAIN" NODE_ENV=production \
      NODE_EXTRA_CA_CERTS="$CA_PEM" \
      node "$APP_DIR/node_modules/next/dist/bin/next" start -p "$APP_PORT" -H 127.0.0.1 \
      >"$LOG_DIR/server.log" 2>&1 < /dev/null
  ) &
  PIDS+=("$!")
  echo "$!" >"$LOG_DIR/server.pid"

  for _ in $(seq 1 120); do
    if curl -ksS -o /dev/null --max-time 3 "https://${FE_HOST}:${PROXY_PORT}/login"; then
      echo "[cimd-success] FastGPT ready via TLS proxy"
      return 0
    fi
    sleep 1
  done
  echo "[cimd-success] FastGPT did not become ready; see $LOG_DIR/server.log" >&2
  exit 3
}

echo "[cimd-success] repo : $REPO_ROOT"
echo "[cimd-success] env  : $E2E_ENV_FILE"
echo "[cimd-success] FE   : $FE_DOMAIN (app $APP_BASE)"
echo "[cimd-success] AS   : $AS_BASE"

if [ ! -f "$APP_DIR/.next/BUILD_ID" ]; then
  echo "[cimd-success] no production build, running pnpm --filter @fastgpt/app build ..."
  (cd "$REPO_ROOT" && NEXT_TELEMETRY_DISABLED=1 pnpm --filter @fastgpt/app build)
fi

ensure_port_free "$HOST_IP" "$AS_PORT"
ensure_port_free "$HOST_IP" "$PROXY_PORT"
ensure_port_free 127.0.0.1 "$APP_PORT"
ensure_upstream
gen_certs
setup_hosts
: >"$AS_LOG"
: >"$PROXY_LOG"

start_plugin
start_as
start_proxy
start_app

set +e
E2E_PHASE=cimd-success \
E2E_APP_BASE_URL="$APP_BASE" \
E2E_FE_DOMAIN="$FE_DOMAIN" \
E2E_AS_BASE_URL="$AS_BASE" \
E2E_AS_ISSUER="$AS_BASE/" \
E2E_AS_RESOURCE="$AS_BASE/mcp" \
E2E_AS_PROXY_LOG="$AS_LOG" \
E2E_TLS_PROXY_LOG="$PROXY_LOG" \
E2E_EVIDENCE_PATH="$EVIDENCE_PATH" \
NODE_EXTRA_CA_CERTS="$CA_PEM" \
MONGODB_URI="$MONGODB_URI" REDIS_URL="$REDIS_URL" AES256_SECRET_KEY="$AES256_SECRET_KEY" \
  node "$E2E_DIR/run.mjs"
EXIT_CODE=$?
set -e

echo "[cimd-success] evidence: $EVIDENCE_PATH"
echo "[cimd-success] AS log  : $AS_LOG"
echo "[cimd-success] proxy   : $PROXY_LOG"

if [ "$EXIT_CODE" != "0" ]; then
  echo "[cimd-success] FAILED (exit=$EXIT_CODE)" >&2
  exit 1
fi
echo "[cimd-success] PASS"
