import { defineConfig } from 'tsdown';

/**
 * 默认情况下 tsdown 会把 package.json 的 dependencies 都标记为 external，
 * 导致运行时仍需要 node_modules。这里强制把所有 npm 依赖打进 bundle，
 * 只保留 Node 内置模块外部化。
 *
 * 例外：worker.ts 通过 safeRequire(name) 在运行时按用户白名单动态加载
 * 模块（lodash/dayjs/moment/uuid/crypto-js/qs 等），这些是变量调用，
 * 打包工具静态分析不会触及，因此白名单模块仍需在 runner 阶段以
 * node_modules 形式存在。
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    worker: 'src/pool/worker.ts'
  },
  format: 'esm',
  platform: 'node',
  target: 'node20',
  minify: true,
  outDir: 'dist',
  noExternal: [/.*/]
});
