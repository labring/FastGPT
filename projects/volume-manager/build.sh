#!/bin/bash
set -e

echo "Building volume-manager..."

# 清理旧的构建产物，避免历史文件被复制进镜像。
rm -rf dist

# 与 code-sandbox 一致：依赖整体打进单入口 bundle，runner 阶段只复制 dist。
echo "Building entries..."
pnpm exec tsdown

# package.json 已声明 type:module，直接改后缀为 .js。
mv dist/index.mjs dist/index.js

echo ""
echo "Build complete!"
echo "  - index.js: $(du -h dist/index.js | cut -f1)"
