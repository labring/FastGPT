import { resolve } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

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

/**
 * L0 零数据库纯内存单元测试配置（脱离根 `test/setup.ts` 与 `MongoMemoryReplSet`）。
 *
 * 面向构造函数 DI 注入 Fake/Stub 仓储的 Service 单测与纯逻辑单测（`*.unit.test.ts`），
 * 毫秒级启动运行，兑现 Constructor DI 速度红利。
 */
export default defineConfig({
  plugins: [blockPrivateDalRepoImports()],
  resolve: {
    alias: {
      '@': resolve('../../projects/app/src'),
      '@fastgpt-sdk/storage/access-link': resolve('../../sdk/storage/src/access-link/index.ts'),
      '@fastgpt-sdk/storage': resolve('../../sdk/storage/src/index.ts'),
      '@fastgpt-sdk/otel/logger': resolve('../../sdk/otel/src/logger-entry.ts'),
      '@fastgpt-sdk/otel/metrics': resolve('../../sdk/otel/src/metrics-entry.ts'),
      '@fastgpt-sdk/otel/tracing': resolve('../../sdk/otel/src/tracing-entry.ts'),
      '@fastgpt-sdk/otel': resolve('../../sdk/otel/src/index.ts'),
      '@fastgpt': resolve('..')
    }
  },
  test: {
    env: {
      NODE_ENV: 'test'
    },
    coverage: {
      enabled: false
    },
    exclude: [...configDefaults.exclude, 'test/integrations/**/*.test.ts'],
    include: ['test/**/*.unit.test.ts'],
    passWithNoTests: true
  }
});
