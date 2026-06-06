import { build, BuildOptions, context } from 'esbuild';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';

// 项目路径
const ROOT_DIR = path.resolve(__dirname, '../../..');
const WORKER_SOURCE_DIR = path.join(ROOT_DIR, 'packages/service/worker');
const WORKER_OUTPUT_DIR = path.join(__dirname, '../worker');
const WORKER_RUNTIME_NODE_MODULES_DIR = path.join(WORKER_OUTPUT_DIR, 'node_modules');
const OTEL_SDK_DIR = path.join(ROOT_DIR, 'sdk/otel/src');
const require = createRequire(import.meta.url);

const workerRuntimePackages = ['@llamaindex/liteparse'];
const liteParsePlatformPackages = [
  '@llamaindex/liteparse-darwin-x64',
  '@llamaindex/liteparse-darwin-arm64',
  '@llamaindex/liteparse-linux-x64-gnu',
  '@llamaindex/liteparse-linux-x64-musl',
  '@llamaindex/liteparse-linux-arm64-gnu',
  '@llamaindex/liteparse-linux-arm64-musl',
  '@llamaindex/liteparse-win32-x64-msvc',
  '@llamaindex/liteparse-win32-arm64-msvc'
];

const resolvePackageDir = (packageName: string, resolvePaths: string[]) => {
  try {
    return path.dirname(require.resolve(`${packageName}/package.json`, { paths: resolvePaths }));
  } catch {
    return;
  }
};

const copyPackage = (packageName: string, sourceDir: string) => {
  const destination = path.join(WORKER_RUNTIME_NODE_MODULES_DIR, ...packageName.split('/'));

  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(sourceDir, destination, {
    recursive: true,
    dereference: true
  });

  console.log(`📦 ${packageName} 运行时依赖已复制 → ${path.relative(process.cwd(), destination)}`);
};

/**
 * 复制 worker external 依赖到 worker 目录下。
 *
 * 这些依赖不适合直接打进 esbuild bundle：LiteParse 包含 N-API .node 文件和 PDFium
 * 动态库，必须以真实文件形式存在。Docker runner 已经复制整个 worker 目录，因此把
 * runtime node_modules 放在 worker 旁边即可让 Node worker 线程就近解析。
 */
const copyWorkerRuntimePackages = () => {
  fs.rmSync(WORKER_RUNTIME_NODE_MODULES_DIR, { recursive: true, force: true });

  for (const packageName of workerRuntimePackages) {
    const sourceDir = resolvePackageDir(packageName, [__dirname, ROOT_DIR]);
    if (!sourceDir) {
      throw new Error(`Worker runtime dependency "${packageName}" is not installed.`);
    }

    copyPackage(packageName, sourceDir);

    if (packageName === '@llamaindex/liteparse') {
      for (const platformPackage of liteParsePlatformPackages) {
        const platformSourceDir = resolvePackageDir(platformPackage, [sourceDir, __dirname, ROOT_DIR]);
        if (!platformSourceDir) continue;

        copyPackage(platformPackage, platformSourceDir);
      }
    }
  }
};

/**
 * Worker 预编译脚本
 * 用于在 Turbopack 开发环境下编译 Worker 文件
 */
async function buildWorkers(watch: boolean = false) {
  console.log('🔨 开始编译 Worker 文件...\n');

  // 确保输出目录存在
  if (!fs.existsSync(WORKER_OUTPUT_DIR)) {
    fs.mkdirSync(WORKER_OUTPUT_DIR, { recursive: true });
  }

  // 扫描 worker 目录
  if (!fs.existsSync(WORKER_SOURCE_DIR)) {
    console.error(`❌ Worker 源目录不存在: ${WORKER_SOURCE_DIR}`);
    process.exit(1);
  }

  const workers = fs.readdirSync(WORKER_SOURCE_DIR).filter((item) => {
    const fullPath = path.join(WORKER_SOURCE_DIR, item);
    const isDir = fs.statSync(fullPath).isDirectory();
    const hasIndexTs = fs.existsSync(path.join(fullPath, 'index.ts'));
    return isDir && hasIndexTs;
  });

  if (workers.length === 0) {
    return;
  }

  // esbuild 通用配置
  const commonConfig: BuildOptions = {
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    sourcemap: false,
    // Tree Shaking 和代码压缩优化
    minify: true,
    treeShaking: true,
    keepNames: false,
    alias: {
      '@fastgpt-sdk/otel': path.join(OTEL_SDK_DIR, 'index.ts'),
      '@fastgpt-sdk/otel/logger': path.join(OTEL_SDK_DIR, 'logger-entry.ts'),
      '@fastgpt-sdk/otel/metrics': path.join(OTEL_SDK_DIR, 'metrics-entry.ts'),
      '@fastgpt-sdk/otel/tracing': path.join(OTEL_SDK_DIR, 'tracing-entry.ts')
    },
    external: ['@llamaindex/liteparse', '@llamaindex/liteparse-*'],
    // 移除调试代码
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : []
  };

  if (watch) {
    // Watch 模式：使用 esbuild context API
    const contexts = await Promise.all(
      workers.map(async (worker) => {
        const entryPoint = path.join(WORKER_SOURCE_DIR, worker, 'index.ts');
        const outfile = path.join(WORKER_OUTPUT_DIR, `${worker}.js`);

        const config: BuildOptions = {
          ...commonConfig,
          entryPoints: [entryPoint],
          outfile,
          logLevel: 'info'
        };

        try {
          const ctx = await context(config);
          await ctx.watch();
          console.log(`👁️  ${worker} 正在监听中...`);
          return ctx;
        } catch (error: any) {
          console.error(`❌ ${worker} Watch 启动失败:`, error.message);
          return null;
        }
      })
    );

    // 过滤掉失败的 context
    const validContexts = contexts.filter((ctx) => ctx !== null);

    copyWorkerRuntimePackages();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ ${validContexts.length}/${workers.length} 个 Worker 正在监听中`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n💡 提示: 按 Ctrl+C 停止监听\n');

    // 保持进程运行
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 正在停止 Worker 监听...');
      await Promise.all(validContexts.map((ctx) => ctx?.dispose()));
      console.log('✅ 已停止');
      process.exit(0);
    });
  } else {
    // 单次编译模式
    const buildPromises = workers.map(async (worker) => {
      const entryPoint = path.join(WORKER_SOURCE_DIR, worker, 'index.ts');
      const outfile = path.join(WORKER_OUTPUT_DIR, `${worker}.js`);

      try {
        const config: BuildOptions = {
          ...commonConfig,
          entryPoints: [entryPoint],
          outfile
        };

        await build(config);
        console.log(`✅ ${worker} 编译成功 → ${path.relative(process.cwd(), outfile)}`);
        return { success: true, worker };
      } catch (error: any) {
        console.error(`❌ ${worker} 编译失败:`, error.message);
        return { success: false, worker, error };
      }
    });

    // 等待所有编译完成
    const results = await Promise.all(buildPromises);

    // 统计结果
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ 编译成功: ${successCount}/${workers.length}`);
    if (failCount > 0) {
      console.log(`❌ 编译失败: ${failCount}/${workers.length}`);
      const failedWorkers = results.filter((r) => !r.success).map((r) => r.worker);
      console.log(`失败的 Worker: ${failedWorkers.join(', ')}`);
      // 非监听模式下,如果有失败的编译,退出并返回错误码
      process.exit(1);
    }
    copyWorkerRuntimePackages();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
}

// 解析命令行参数
const args = process.argv.slice(2);
const watch = args.includes('--watch') || args.includes('-w');

// 显示启动信息
console.log('');
console.log('╔═══════════════════════════════════════╗');
console.log('║   FastGPT Worker 预编译工具 v1.0      ║');
console.log('╚═══════════════════════════════════════╝');
console.log('');

// 执行编译
buildWorkers(watch).catch((err) => {
  console.error('\n❌ Worker 编译过程发生错误:', err);
  process.exit(1);
});
