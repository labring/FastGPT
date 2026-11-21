#!/usr/bin/env bash
# One-command MCP OAuth v2.4 real E2E.
#
#   E2E_ENV_FILE=/tmp/mcp-oauth-e2e/app.env ./test/e2e/mcpOAuth/v24/run.sh
#
# What it does:
#   1. loads the (gitignored, mode 600) env file with Mongo/Redis/FE_DOMAIN/secrets
#   2. ensures a production build exists, starts the plugin stub + FastGPT if needed
#   3. runs run.mjs (real HTTP against the real server, fixture AS in-process)
#   4. stops only the processes it started, drops the dedicated E2E databases
#
# Everything secret stays in $E2E_ENV_FILE; nothing is written into the repo.
set -euo pipefail

export PATH=/config/.nvm/versions/node/v22.23.2/bin:${PATH}

# E2E_AS_MODE=real 时切换到真实授权服务器套件（desktop 106）。
if [ "${E2E_AS_MODE:-fixture}" = "real" ]; then
  exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../real/run.sh" "$@"
fi

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)
E2E_DIR="$REPO_ROOT/test/e2e/mcpOAuth/v24"
APP_DIR="$REPO_ROOT/projects/app"
E2E_ENV_FILE=${E2E_ENV_FILE:-/tmp/mcp-oauth-e2e/app.env}
E2E_STATE_DIR=${E2E_STATE_DIR:-/tmp/mcp-oauth-e2e}
E2E_APP_BASE_URL=${E2E_APP_BASE_URL:-http://127.0.0.1:13100}
E2E_FIXTURE_HOST=${E2E_FIXTURE_HOST:-172.17.0.34}
E2E_FIXTURE_PORT=${E2E_FIXTURE_PORT:-18200}
E2E_MANAGE_STACK=${E2E_MANAGE_STACK:-1}
E2E_KEEP_DB=${E2E_KEEP_DB:-0}
export E2E_APP_BASE_URL E2E_FIXTURE_HOST E2E_FIXTURE_PORT

if [ ! -f "$E2E_ENV_FILE" ]; then
  echo "[e2e] missing env file: $E2E_ENV_FILE" >&2
  echo "[e2e] provide Mongo/Redis/PG_URL/FE_DOMAIN/secrets there (mode 600)." >&2
  exit 2
fi

mkdir -p "$E2E_STATE_DIR"
chmod 700 "$E2E_STATE_DIR"

set -a
# shellcheck disable=SC1090
. "$E2E_ENV_FILE"
set +a

: "${MONGODB_URI:?MONGODB_URI missing in $E2E_ENV_FILE}"
: "${REDIS_URL:?REDIS_URL missing in $E2E_ENV_FILE}"
: "${PG_URL:?PG_URL missing in $E2E_ENV_FILE (FastGPT vector store defaults to PG)}"

APP_PID=""
PLUGIN_PID=""
STARTED_APP=0
STARTED_PLUGIN=0

cleanup() {
  local exit_code=$?
  if [ "$STARTED_APP" = "1" ] && [ -n "$APP_PID" ]; then
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  if [ "$STARTED_PLUGIN" = "1" ] && [ -n "$PLUGIN_PID" ]; then
    kill "$PLUGIN_PID" 2>/dev/null || true
    wait "$PLUGIN_PID" 2>/dev/null || true
  fi
  if [ "$E2E_KEEP_DB" != "1" ]; then
    (cd "$APP_DIR" && node -e '
      const mongoose = require("mongoose");
      const uri = process.env.MONGODB_URI;
      (async () => {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        await mongoose.connection.dropDatabase().catch(() => {});
        await mongoose.connection.client.db("fastgpt_mcp_oauth_e2e_log").dropDatabase().catch(() => {});
        await mongoose.disconnect();
      })().catch(() => process.exit(0));
    ') || true
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3>&- && return 0 || return 1
}

echo "[e2e] repo: $REPO_ROOT"
echo "[e2e] env : $E2E_ENV_FILE"

if [ "$E2E_MANAGE_STACK" = "1" ]; then
  if [ ! -f "$APP_DIR/.next/BUILD_ID" ]; then
    echo "[e2e] no production build found, running pnpm --filter @fastgpt/app build ..."
    (cd "$REPO_ROOT" && NEXT_TELEMETRY_DISABLED=1 pnpm --filter @fastgpt/app build)
  fi

  if ! port_open 3999; then
    echo "[e2e] starting plugin stub on 127.0.0.1:3999"
    setsid env STUB_PLUGIN_PORT=3999 PLUGIN_TOKEN="${PLUGIN_TOKEN:-}" \
      node "$REPO_ROOT/test/e2e/mcpOAuth/stubPluginServer.mjs" \
      >"$E2E_STATE_DIR/plugin.log" 2>&1 < /dev/null &
    PLUGIN_PID=$!
    STARTED_PLUGIN=1
  fi

  APP_PORT=$(node -e 'const u=new URL(process.env.E2E_APP_BASE_URL);console.log(u.port||80)')
  if ! port_open "$APP_PORT"; then
    echo "[e2e] starting FastGPT production server on $E2E_APP_BASE_URL"
    (
      cd "$APP_DIR"
      exec setsid node "$APP_DIR/node_modules/next/dist/bin/next" start \
        -p "$APP_PORT" \
        -H "$(node -e 'console.log(new URL(process.env.E2E_APP_BASE_URL).hostname)')" \
        >"$E2E_STATE_DIR/server.log" 2>&1 < /dev/null
    ) &
    APP_PID=$!
    STARTED_APP=1
  else
    echo "[e2e] reusing existing server on $E2E_APP_BASE_URL"
  fi

  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null --max-time 2 "$E2E_APP_BASE_URL/login"; then
      break
    fi
    sleep 1
  done
  curl -fsS -o /dev/null --max-time 3 "$E2E_APP_BASE_URL/login" || {
    echo "[e2e] FastGPT did not become ready; see $E2E_STATE_DIR/server.log" >&2
    exit 3
  }
fi

echo "[e2e] running suite"
E2E_APP_BASE_URL="$E2E_APP_BASE_URL" \
E2E_FIXTURE_HOST="$E2E_FIXTURE_HOST" \
E2E_FIXTURE_PORT="$E2E_FIXTURE_PORT" \
E2E_EVIDENCE_PATH="${E2E_EVIDENCE_PATH:-$E2E_STATE_DIR/evidence.json}" \
MONGODB_URI="$MONGODB_URI" \
REDIS_URL="$REDIS_URL" \
node "$E2E_DIR/run.mjs"
