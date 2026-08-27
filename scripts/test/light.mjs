import { existsSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const configNames = [
  'vitest.config.ts',
  'vitest.config.mts',
  'vitest.config.js',
  'vitest.config.mjs'
];

const getConfigNames = (testPath) => {
  const pathForMatching = `${testPath}${sep}`;
  const sandboxIntegrationSegment = `${sep}test${sep}integrations${sep}sandbox${sep}`;
  const integrationSegment = `${sep}test${sep}integrations${sep}`;

  if (pathForMatching.includes(sandboxIntegrationSegment)) {
    return ['vitest.sandbox.integration.config.ts', ...configNames];
  }
  if (pathForMatching.includes(integrationSegment) || testPath.endsWith('.integration.test.ts')) {
    return ['vitest.integration.config.ts', ...configNames];
  }
  if (testPath.endsWith('.benchmark.ts')) {
    return ['vitest.benchmark.config.ts', ...configNames];
  }

  return configNames;
};

const separatorIndex = process.argv.indexOf('--', 2);
const testPaths = process.argv.slice(2, separatorIndex === -1 ? undefined : separatorIndex);
const vitestArgs = separatorIndex === -1 ? [] : process.argv.slice(separatorIndex + 1);

if (testPaths.length === 0) {
  console.error('Usage: pnpm test:light <test-file-or-directory> [...] [-- <vitest-options>]');
  process.exit(1);
}

/**
 * 从测试路径向上查找最近的 Vitest 配置，确保测试在所属 workspace 中执行。
 */
const findVitestConfig = (testPath) => {
  let currentDirectory = statSync(testPath).isDirectory() ? testPath : dirname(testPath);
  const candidateConfigNames = getConfigNames(testPath);

  while (currentDirectory.startsWith(repositoryRoot)) {
    const configPath = candidateConfigNames
      .map((configName) => resolve(currentDirectory, configName))
      .find(existsSync);

    if (configPath) return configPath;
    if (currentDirectory === repositoryRoot) break;
    currentDirectory = dirname(currentDirectory);
  }

  throw new Error(`No Vitest config found for: ${relative(repositoryRoot, testPath)}`);
};

const workspaceTests = new Map();

for (const inputPath of testPaths) {
  const absolutePath = resolve(repositoryRoot, inputPath);
  const repositoryRelativePath = relative(repositoryRoot, absolutePath);
  if (
    repositoryRelativePath === '..' ||
    repositoryRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(repositoryRelativePath)
  ) {
    console.error(`Test path must be inside the repository: ${inputPath}`);
    process.exit(1);
  }
  if (!existsSync(absolutePath)) {
    console.error(`Test path does not exist: ${inputPath}`);
    process.exit(1);
  }

  const configPath = findVitestConfig(absolutePath);
  const workspaceRoot = dirname(configPath);
  const workspace = workspaceTests.get(workspaceRoot) ?? {
    configPath,
    testPaths: []
  };
  workspace.testPaths.push(relative(workspaceRoot, absolutePath));
  workspaceTests.set(workspaceRoot, workspace);
}

/**
 * 顺序执行各 workspace 的局部测试，避免多个 Vitest/Mongo 实例争抢 Agent 资源。
 */
const runWorkspaceTests = ({ workspaceRoot, configPath, testPaths }) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        '--config',
        basename(configPath),
        '--coverage.enabled=false',
        '--maxWorkers=1',
        '--no-fileParallelism',
        ...testPaths,
        ...vitestArgs
      ],
      {
        cwd: workspaceRoot,
        env: process.env,
        stdio: 'inherit'
      }
    );

    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          signal ? `Vitest terminated by signal ${signal}` : `Vitest exited with code ${code ?? 1}`
        )
      );
    });
  });

try {
  for (const [workspaceRoot, workspace] of workspaceTests) {
    await runWorkspaceTests({ workspaceRoot, ...workspace });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
