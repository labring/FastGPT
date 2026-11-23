import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

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
      '@fastgpt-sdk/otel/logger': resolve('../../sdk/otel/src/logger-entry.ts'),
      '@fastgpt': resolve('..')
    }
  },
  test: {
    globalSetup: resolve(import.meta.dirname, 'test/global-setup.ts'),
    coverage: {
      enabled: true,
      reporter: ['text', 'text-summary', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      include: ['redis/**/*.ts', 'db/**/*.ts'],
      exclude: ['**/test/**', '**/*.test.ts', '**/index.ts'],
      cleanOnRerun: false
    },
    outputFile: 'test-results.json',
    include: ['test/**/*.test.ts']
  }
});
