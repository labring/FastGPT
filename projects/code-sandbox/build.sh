#!/bin/bash
set -e

echo "Building sandbox..."

# 清理旧的构建产物
rm -rf dist

# 编译主入口文件，打包所有依赖
echo "Building main entry..."
bun build src/index.ts --outdir dist --target bun --minify --packages=bundle

# 编译 JS worker，打包所有依赖
echo "Building JS worker..."
bun build src/pool/worker.ts --outdir dist --target bun --minify --packages=bundle
mv dist/worker.js dist/worker.ts

# 复制 Python worker（Python 不需要编译）
echo "Copying Python worker..."
cp src/pool/worker.py dist/worker.py

echo ""
echo "Build complete!"
echo "  - index.js: $(du -h dist/index.js | cut -f1)"
echo "  - worker.ts: $(du -h dist/worker.ts | cut -f1)"
echo "  - worker.py: $(du -h dist/worker.py | cut -f1)"
echo ""
echo "✅ dist 目录现在是完全独立的，不需要 node_modules"
