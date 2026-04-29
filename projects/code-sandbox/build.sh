#!/bin/bash
set -e

echo "Building sandbox..."

# 清理旧的构建产物
rm -rf dist

# 编译入口（配置见 tsdown.config.ts）：
#   - 同时打包 index 和 worker 两个独立 bundle
#   - 所有 npm 依赖均打入 bundle（noExternal），仅保留 Node 内置模块外部化
#   - 扁平输出到 dist 根目录
echo "Building entries..."
pnpm exec tsdown

# package.json 已声明 type:module，直接改后缀为 .js
mv dist/index.mjs dist/index.js
mv dist/worker.mjs dist/worker.js

# Python worker 不需要编译，直接复制
echo "Copying Python worker..."
cp src/pool/worker.py dist/worker.py

echo ""
echo "Build complete!"
echo "  - index.js:  $(du -h dist/index.js | cut -f1)"
echo "  - worker.js: $(du -h dist/worker.js | cut -f1)"
echo "  - worker.py: $(du -h dist/worker.py | cut -f1)"
echo ""
echo "ℹ️  worker 通过 safeRequire(name) 在运行时动态加载白名单模块"
echo "   （lodash/dayjs/moment/uuid/crypto-js/qs），这些依赖必须以 node_modules"
echo "   形式存在于运行时，由 runtime.package.json 在 runner 阶段安装。"
