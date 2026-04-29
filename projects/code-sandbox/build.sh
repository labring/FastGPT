#!/bin/bash
set -e

echo "Building sandbox..."

# 清理旧的构建产物
rm -rf dist

# 一次性编译所有入口（独立 bundle，子进程会单独 spawn worker）
echo "Building entries..."
pnpm exec tsdown src/index.ts src/pool/worker.ts \
  --format esm \
  --platform node \
  --target node20 \
  --minify \
  --out-dir dist

# tsdown 保留源码目录结构：worker.ts 在 src/pool/ 下，输出在 dist/pool/
# 扁平化到 dist/，并改后缀为 .js（package.json 已声明 type:module）
mv dist/index.mjs dist/index.js
mv dist/pool/worker.mjs dist/worker.js
rmdir dist/pool

# 复制 Python worker（不需要编译）
echo "Copying Python worker..."
cp src/pool/worker.py dist/worker.py

echo ""
echo "Build complete!"
echo "  - index.js: $(du -h dist/index.js | cut -f1)"
echo "  - worker.js: $(du -h dist/worker.js | cut -f1)"
echo "  - worker.py: $(du -h dist/worker.py | cut -f1)"
echo ""
echo "ℹ️  注意：worker 通过 require(name) 动态加载用户白名单模块（lodash/dayjs/...），"
echo "   这些依赖不会被打包，运行时仍需要 node_modules 存在。"
