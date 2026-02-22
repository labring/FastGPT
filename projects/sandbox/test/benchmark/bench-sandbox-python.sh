#!/bin/bash
# FastGPT Sandbox Python 压测脚本
export PATH="/home/devbox/.npm-global/bin:$PATH"

BASE="http://localhost:3001"
DURATION=10

echo "========================================"
echo "  FastGPT Sandbox Python 压测"
echo "========================================"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "▶ 测试 1: 普通函数 (简单计算)"
echo "  并发: 50  持续: ${DURATION}s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
autocannon -c 50 -d $DURATION -m POST \
  -H "Content-Type=application/json" \
  -b '{"code":"def main(variables):\n    return 1 + 1","variables":{}}' \
  "${BASE}/sandbox/python"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "▶ 测试 2: 长时间IO函数 (sleep 500ms)"
echo "  并发: 50  持续: ${DURATION}s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
autocannon -c 50 -d $DURATION -m POST \
  -H "Content-Type=application/json" \
  -b '{"code":"import time\ndef main(variables):\n    time.sleep(0.5)\n    return \"done\"","variables":{}}' \
  "${BASE}/sandbox/python"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "▶ 测试 3: 高CPU函数 (大量计算)"
echo "  并发: 10  持续: ${DURATION}s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
autocannon -c 10 -d $DURATION -m POST \
  -H "Content-Type=application/json" \
  -b '{"code":"import math\ndef main(variables):\n    s=0\n    for i in range(5000000):\n        s+=math.sqrt(i)\n    return s","variables":{}}' \
  "${BASE}/sandbox/python"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "▶ 测试 4: 高内存函数 (大列表)"
echo "  并发: 10  持续: ${DURATION}s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
autocannon -c 10 -d $DURATION -m POST \
  -H "Content-Type=application/json" \
  -b '{"code":"def main(variables):\n    arr = [i*i for i in range(2000000)]\n    return len(arr)","variables":{}}' \
  "${BASE}/sandbox/python"

echo ""
echo "========================================"
echo "  压测完成！"
echo "========================================"
