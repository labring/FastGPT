#!/bin/bash
set -e

echo "Building sandbox-proxy..."
rm -rf dist
pnpm exec tsdown
mv dist/index.mjs dist/index.js
echo "Build complete."
