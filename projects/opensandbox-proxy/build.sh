#!/bin/bash
set -e

echo "Building opensandbox-proxy..."

# 清理旧的构建产物，避免历史文件被复制进镜像。
rm -rf dist

# 将运行时依赖整体打进单入口 Bun bundle，runner 阶段只复制 dist。
echo "Building entries..."
bun build src/index.ts --outdir dist --target bun --minify --sourcemap=linked

echo ""
echo "Build complete!"
echo "  - index.js: $(du -h dist/index.js | cut -f1)"
