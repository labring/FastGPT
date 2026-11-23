import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const PRIVATE_DAL_REPO_IMPORT_RE = /^@fastgpt\/dal\/db\/repos\/.+\/(?:mongo|sql)(?:\/|[?#]|$)/;
const BLOCKED_PRIVATE_DAL_REPO_PREFIX = '\0blocked-private-dal-repo:';

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

const localEnvPath = resolve(import.meta.dirname, '../../test/.env.test.local');
if (existsSync(localEnvPath)) process.loadEnvFile(localEnvPath);

export default defineConfig({
  plugins: [blockPrivateDalRepoImports()],
  resolve: {
    alias: {
      '@': resolve('../../projects/app/src'),
      '@fastgpt': resolve('..'),
      '@test': resolve('../../test')
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
      enabled: false
    },
    outputFile: 'test-results.integration.json',
    setupFiles: '../../test/setup.ts',
    globalSetup: '../../test/globalSetup.ts',
    fileParallelism: false,
    maxConcurrency: 10,
    pool: 'threads',
    testTimeout: 20000,
    hookTimeout: 30000,
    reporters: ['github-actions', 'default'],
    include: ['test/integrations/**/*.integration.test.ts'],
    exclude: ['test/integrations/sandbox/**/*.integration.test.ts']
  }
});
