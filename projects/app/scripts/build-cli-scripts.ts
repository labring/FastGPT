import { spawnSync } from 'child_process';
import { build, BuildOptions, Metafile } from 'esbuild';
import fs from 'fs';
import path from 'path';

/**
 * 打包容器内使用的独立 CLI 脚本。
 *
 * 运行镜像（runner 阶段）没有 Next standalone 之外的源码与依赖：Next.js standalone 在 pnpm
 * 工作区下只产出 `node_modules/.pnpm`，顶层没有包入口，脚本里的 `import 'mongodb'` 在镜像里
 * 解析不到。因此与 worker 一样用 esbuild 把依赖直接 inline 成自包含产物，镜像只需 COPY 一个文件。
 */

/** 需要打包的 CLI 脚本（不含扩展名），源文件与产物同名。 */
const CLI_SCRIPTS = ['reset-root-password'];

const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, 'dist');

/**
 * 找到 pnpm 虚拟 store 的「提升」目录 node_modules/.pnpm/node_modules。
 * 显式把它交给 nodePaths（语义等同 Node 的 NODE_PATH），让本地工作区与镜像构建行为一致。
 */
const findPnpmHoistedDir = () => {
  let dir = SCRIPT_DIR;

  while (true) {
    const candidate = path.join(dir, 'node_modules', '.pnpm', 'node_modules');
    if (fs.existsSync(path.join(candidate, 'mongodb', 'package.json'))) return candidate;

    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        '未找到 pnpm 提升目录下的 mongodb（node_modules/.pnpm/node_modules），无法把它 inline 进产物'
      );
    }
    dir = parent;
  }
};

const commonConfig: BuildOptions = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: false,
  treeShaking: true,
  minify: false,
  nodePaths: [findPnpmHoistedDir()],
  logOverride: { 'empty-import-meta': 'silent' }
};

/**
 * 断言驱动确实被 inline 进了产物。
 *
 * 镜像里没有可解析的 node_modules，漏 inline 只会在容器里才报错；而 --help 自检又不会触发懒加载
 * 的驱动，挡不住「配置上把 mongodb 标成 external」这类回归，所以这里直接查 metafile。
 * 驱动自身的可选依赖（kerberos、@mongodb-js/zstd 等）本来就被 esbuild 留在产物外，只断言 mongodb 本体。
 */
const assertDriverInlined = (metafile: Metafile) => {
  const inlined = Object.keys(metafile.inputs).some((input) =>
    input.includes('/node_modules/mongodb/')
  );

  if (!inlined) {
    throw new Error(
      '产物里没有 mongodb 的代码：驱动未被 inline'
    );
  }
};

/**
 * 通过只输出就绪标记的自检模式验证 CJS 产物确实执行了入口逻辑，不连接数据库也不改写密码。
 * 该检查同时防止 esbuild 将 import.meta 置空后导致产物入口静默失效。
 */
const assertRunnable = (outfile: string) => {
  const selfTest = spawnSync(process.execPath, [outfile], {
    encoding: 'utf8',
    env: { ...process.env, RESET_ROOT_PASSWORD_SELFTEST: '1' }
  });
  const selfTestOutput = `${selfTest.stdout ?? ''}${selfTest.stderr ?? ''}`;

  if (selfTest.status !== 0 || !selfTestOutput.includes('reset-root-password ready')) {
    throw new Error(`产物自检失败（入口检查未按预期输出）：exit=${selfTest.status}\n${selfTestOutput}`);
  }
};

async function buildCliScript(name: string) {
  const entryPoint = path.join(SCRIPT_DIR, `${name}.ts`);
  const outfile = path.join(OUTPUT_DIR, `${name}.cjs`);

  if (!fs.existsSync(entryPoint)) {
    throw new Error(`CLI 脚本源文件不存在：${entryPoint}`);
  }

  const result = await build({
    ...commonConfig,
    entryPoints: [entryPoint],
    outfile,
    metafile: true
  });

  assertDriverInlined(result.metafile);
  assertRunnable(outfile);

  console.log(`✅ ${name} 打包成功 → ${path.relative(process.cwd(), outfile)}`);
}

async function main() {
  console.log('🔨 开始打包容器内 CLI 脚本...\n');

  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const name of CLI_SCRIPTS) {
    await buildCliScript(name);
  }

  console.log(`\n✅ 共打包 ${CLI_SCRIPTS.length} 个脚本`);
}

main().catch((error) => {
  console.error('\n❌ CLI 脚本打包失败:', error instanceof Error ? error.message : error);
  process.exit(1);
});
