#!/bin/bash
# FastGPT Sandbox 压测脚本
export PATH="/home/devbox/.npm-global/bin:$PATH"

BASE="http://localhost:3001"
DURATION=10

echo "========================================"
echo "  FastGPT Sandbox 压测"
echo "  服务: $BASE"
echo "========================================"

curl -s "$BASE/health" > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "错误: Sandbox 服务未启动"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "▶ 测试 1: 普通函数 (简单计算)"
echo "  并发: 50  持续: ${DURATION}s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
autocannon -c 50 -d $DURATION -m POST \
  -H "Content-Type=application/json" \
  -b '{"code":"function main() { return 1 + 1; }","variables":{}}' \
  "${BASE}/sandbox/js"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "▶ 测试 2: 长时间IO函数 (delay 500ms)"
echo "  并发: 50  持续: ${DURATION}s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
autocannon -c 50 -d $DURATION -m POST \
  -H "Content-Type=application/json" \
  -b '{"code":"async function main() { await delay(500); return \"done\"; }","variables":{}}' \
  "${BASE}/sandbox/js"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "▶ 测试 3: 高CPU函数 (大量计算)"
echo "  并发: 10  持续: ${DURATION}s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
autocannon -c 10 -d $DURATION -m POST \
  -H "Content-Type=application/json" \
  -b '{"code":"function main() { let s=0; for(let i=0;i<50000000;i++) s+=Math.sqrt(i); return s; }","variables":{}}' \
  "${BASE}/sandbox/js"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "▶ 测试 4: 高内存函数 (分配大数组)"
echo "  并发: 10  持续: ${DURATION}s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
autocannon -c 10 -d $DURATION -m POST \
  -H "Content-Type=application/json" \
  -b '{"code":"function main() { const arr = new Array(5000000).fill(0).map((_,i)=>i*i); return arr.length; }","variables":{}}' \
  "${BASE}/sandbox/js"

echo ""
echo "========================================"
echo "  压测完成！"
echo "========================================"
