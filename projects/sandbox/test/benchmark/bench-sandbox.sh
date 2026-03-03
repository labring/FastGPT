#!/bin/bash
# FastGPT Sandbox JS 压测脚本
# 用法: SANDBOX_TOKEN=xxx ./bench-sandbox.sh
#       SANDBOX_URL=http://host:3000 SANDBOX_TOKEN=xxx ./bench-sandbox.sh

set -eo pipefail

BASE="${SANDBOX_URL:-http://localhost:3000}"
TOKEN="${SANDBOX_TOKEN:-}"
DURATION="${BENCH_DURATION:-10}"

# 构建 npx autocannon 认证参数
AUTH_ARGS=""
if [ -n "$TOKEN" ]; then
  AUTH_ARGS="-H Authorization=Bearer%20${TOKEN}"
fi

echo "========================================"
echo "  FastGPT Sandbox JS 压测"
echo "  服务: $BASE"
echo "  认证: $([ -n "$TOKEN" ] && echo '已配置' || echo '未配置')"
echo "========================================"

# 健康检查
HEALTH=$(curl -sf "$BASE/health" 2>/dev/null) || {
  echo "错误: Sandbox 服务未启动 ($BASE/health)"
  exit 1
}
echo "健康状态: $(echo "$HEALTH" | grep -o '"status":"[^"]*"' || echo "$HEALTH")"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "▶ 测试 1: 普通函数 (简单计算)"
echo "  并发: 50  持续: ${DURATION}s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx autocannon -c 50 -d "$DURATION" -m POST \
  -H "Content-Type=application/json" \
  $AUTH_ARGS \
  -b '{"code":"function main() { return 1 + 1; }","variables":{}}' \
  "${BASE}/sandbox/js"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "▶ 测试 2: 长时间IO函数 (delay 500ms)"
echo "  并发: 50  持续: ${DURATION}s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx autocannon -c 50 -d "$DURATION" -m POST \
  -H "Content-Type=application/json" \
  $AUTH_ARGS \
  -b '{"code":"async function main() { await delay(500); return \"done\"; }","variables":{}}' \
  "${BASE}/sandbox/js"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "▶ 测试 3: 高CPU函数 (大量计算)"
echo "  并发: 10  持续: ${DURATION}s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx autocannon -c 10 -d "$DURATION" -m POST \
  -H "Content-Type=application/json" \
  $AUTH_ARGS \
  -b '{"code":"function main() { let s=0; for(let i=0;i<50000000;i++) s+=Math.sqrt(i); return s; }","variables":{}}' \
  "${BASE}/sandbox/js"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "▶ 测试 4: 高内存函数 (分配大数组)"
echo "  并发: 10  持续: ${DURATION}s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx autocannon -c 10 -d "$DURATION" -m POST \
  -H "Content-Type=application/json" \
  $AUTH_ARGS \
  -b '{"code":"function main() { const arr = new Array(5000000).fill(0).map((_,i)=>i*i); return arr.length; }","variables":{}}' \
  "${BASE}/sandbox/js"

echo ""
echo "========================================"
echo "  压测完成！"
echo "========================================"
