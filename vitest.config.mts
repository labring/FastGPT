import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { getTestMaxWorkers } from './test/vitestWorkers';

const PRIVATE_DAL_REPO_IMPORT_RE = /^@fastgpt\/dal\/db\/repos\/.+\/(?:mongo|sql)(?:\/|[?#]|$)/;
const BLOCKED_PRIVATE_DAL_REPO_PREFIX = '\0blocked-private-dal-repo:';

/**
 * 阻断通过 `@fastgpt` alias 绕过 `packages/dal/package.json` `exports`
 * 直接引用仓储私有 `mongo/*` 或 `sql/*` 实现路径。
 */
const blockPrivateDalRepoImports = () => ({
  name: 'fastgpt-block-private-dal-repo-imports',
  enforce: 'pre' as const,
  config: () => ({
    resolve: {
      alias: [
        {
          // Vite 内置 alias 插件早于 prePlugins 执行，需先拦截私有路径并交由 resolveId 抛出明确错误。
          find: PRIVATE_DAL_REPO_IMPORT_RE,
          replacement: `${BLOCKED_PRIVATE_DAL_REPO_PREFIX}$&`
        }
      ]
    }
  }),
  resolveId: (source: string) => {
    const blockedSpecifier = source.startsWith(BLOCKED_PRIVATE_DAL_REPO_PREFIX)
      ? source.slice(BLOCKED_PRIVATE_DAL_REPO_PREFIX.length)
      : PRIVATE_DAL_REPO_IMPORT_RE.test(source)
        ? source
        : undefined;

    if (blockedSpecifier !== undefined) {
      throw new Error(
        `Blocked private DAL repository import "${blockedSpecifier}". ` +
          'Import the public repo token (".../repo") or contract types (".../repo.type") instead.'
      );
    }

    return null;
  }
});

export default defineConfig({
  plugins: [blockPrivateDalRepoImports()],
  resolve: {
    alias: {
      '@': resolve('projects/app/src'),
      '@fastgpt-sdk/storage/access-link': resolve('sdk/storage/src/access-link/index.ts'),
      '@fastgpt-sdk/storage': resolve('sdk/storage/src/index.ts'),
      '@fastgpt-sdk/otel/logger': resolve('sdk/otel/src/logger-entry.ts'),
      '@fastgpt-sdk/otel/metrics': resolve('sdk/otel/src/metrics-entry.ts'),
      '@fastgpt-sdk/otel/tracing': resolve('sdk/otel/src/tracing-entry.ts'),
      '@fastgpt-sdk/otel': resolve('sdk/otel/src/index.ts'),
      '@fastgpt': resolve('packages'),
      '@test': resolve('test')
    }
  },
  test: {
    env: {
      AIPROXY_API_ENDPOINT: process.env.AIPROXY_API_ENDPOINT ?? 'http://127.0.0.1:3000',
      AIPROXY_API_TOKEN: process.env.AIPROXY_API_TOKEN ?? 'test-aiproxy-token',
      FILE_TOKEN_KEY:
        process.env.FILE_TOKEN_KEY ??
        'bfd697e7e798f75deaf2d31210bc93a2e41ad4eed9e7831071d77821b7b97cff',
      AES256_SECRET_KEY: process.env.AES256_SECRET_KEY ?? 'fastgpt_test_aes256_secret_key',
      INVOKE_TOKEN_SECRET: process.env.INVOKE_TOKEN_SECRET ?? 'fastgpt_test_invoke_token_secret_32',
      FE_DOMAIN: process.env.FE_DOMAIN ?? 'https://fastgpt.example.com'
    },
    coverage: {
      enabled: true,
      reporter: ['html', 'json-summary', 'json'],
      // reporter: ['text', 'text-summary', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      include: ['projects/app/**/*.ts', 'packages/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/*.spec.ts',
        '**/*/*.d.ts',
        '**/test/**',
        '**/*.test.ts',
        '**/*/constants.ts',
        '**/*/*.const.ts',
        '**/*/type.ts',
        '**/*/types.ts',
        '**/*/type/*',
        '**/*/schema.ts',
        '**/*/*.schema.ts',
        'packages/global/openapi/**/*',
        'packages/global/core/workflow/template/**/*'
      ],
      cleanOnRerun: false
    },
    outputFile: 'test-results.json',
    setupFiles: 'test/setup.ts',
    globalSetup: 'test/globalSetup.ts',
    fileParallelism: true,
    maxWorkers: getTestMaxWorkers(),
    // Test-level execution within a file: parallel (up to 5 concurrent tests)
    maxConcurrency: 10,
    pool: 'threads',
    testTimeout: 20000,
    hookTimeout: 30000,
    passWithNoTests: true,
    reporters: ['github-actions', 'default'],
    include: ['test/**/*.test.ts']
  }
});
