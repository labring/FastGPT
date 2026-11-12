#!/usr/bin/env bash
# Stage I5c：MCP OAuth v2.4 浏览器 UI E2E 统一入口（本地沙箱用，非 CI）。
#
#   bash test/e2e/mcpOAuth/runUiE2EV24.sh
#
# 1) 复用 runRealStack.sh start（docker + 插件桩 + fixture + Next dev）
# 2) prepareUiAuth.mjs 预热登录态，生成仓库外 0600 storageState
# 3) 运行 .agents/test/app/mcptools/oauth-connect.browser.spec.ts（系统 chromium）
# 4) 截图/证据/trace/JSON 报告落在 plans/e2e-ui-v24/
#
# 安全：storageState 不进仓库；日志只含指纹与计数。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PLANS_DIR="${UI_PLANS_DIR:-$ROOT/../../plans/e2e-ui-v24}"
LOG_DIR="$PLANS_DIR/logs"
SHOTS_DIR="$PLANS_DIR/shots"
ARTIFACTS_DIR="$PLANS_DIR/artifacts"
EVIDENCE_DIR="$PLANS_DIR/evidence"
STORAGE_STATE="$PLANS_DIR/storage-state.json"
LOG_FILE="$LOG_DIR/ui-e2e-v24-$(date +%Y%m%d-%H%M%S).log"
FASTGPT_BASE_URL="${UI_FASTGPT_BASE_URL:-https://203.0.113.10:3005}"
FIXTURE_BASE_URL="${UI_FIXTURE_BASE_URL:-http://127.0.0.1:18110}"

NODE_BIN="${NODE_BIN:-$HOME/.nvm/versions/node/v22.23.2/bin}"
export PATH="$NODE_BIN:$PATH"
PNPM="${PNPM:-node $HOME/.cache/node/corepack/v1/pnpm/10.33.4/bin/pnpm.cjs}"

mkdir -p "$LOG_DIR" "$SHOTS_DIR" "$ARTIFACTS_DIR" "$EVIDENCE_DIR"

echo "[ui-e2e] start/reuse real stack"
bash "$ROOT/test/e2e/mcpOAuth/runRealStack.sh" start

echo "[ui-e2e] seed browser session + storageState"
UI_PLANS_DIR="$PLANS_DIR" UI_STORAGE_STATE="$STORAGE_STATE" \
  node "$ROOT/test/e2e/mcpOAuth/prepareUiAuth.mjs" > "$LOG_DIR/last-storage-state-meta.json"
if [ "$?" != "0" ]; then
  echo "[ui-e2e] prepareUiAuth failed" >&2
  exit 1
fi
chmod 600 "$STORAGE_STATE"

export FASTGPT_TEST_BASE_URL="$FASTGPT_BASE_URL"
export FASTGPT_TEST_STORAGE_STATE="$STORAGE_STATE"
export FASTGPT_TEST_IGNORE_HTTPS=1
export FASTGPT_TEST_RUN_DIR="$ARTIFACTS_DIR"
export FASTGPT_UI_SHOTS_DIR="$SHOTS_DIR"
export FASTGPT_UI_EVIDENCE_DIR="$EVIDENCE_DIR"
export MCP_FIXTURE_BASE_URL="$FIXTURE_BASE_URL"
if [ -z "${FASTGPT_TEST_CHROMIUM_PATH:-}" ] && [ -x /usr/bin/chromium ]; then
  export FASTGPT_TEST_CHROMIUM_PATH=/usr/bin/chromium
fi

cd "$ROOT" || exit 1

echo "[ui-e2e] playwright test (base=$FASTGPT_TEST_BASE_URL, fixture=$FIXTURE_BASE_URL)"
$PNPM exec playwright test \
  -c .agents/test/playwright.config.ts \
  .agents/test/app/mcptools/oauth-connect.browser.spec.ts \
  --workers=1 2>&1 | tee "$LOG_FILE"
code=${PIPESTATUS[0]}

echo "[ui-e2e] playwright exit=$code"
echo "[ui-e2e] log=$LOG_FILE"
echo "[ui-e2e] shots=$SHOTS_DIR"
echo "[ui-e2e] artifacts=$ARTIFACTS_DIR"
exit "$code"
