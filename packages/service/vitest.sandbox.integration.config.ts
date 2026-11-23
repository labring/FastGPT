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
      NODE_ENV: 'test',
      FILE_TOKEN_KEY:
        process.env.FILE_TOKEN_KEY ??
        'bfd697e7e798f75deaf2d31210bc93a2e41ad4eed9e7831071d77821b7b97cff',
      AES256_SECRET_KEY: process.env.AES256_SECRET_KEY ?? 'fastgpt_test_aes256_secret_key',
      INVOKE_TOKEN_SECRET: process.env.INVOKE_TOKEN_SECRET ?? 'fastgpt_test_invoke_token_secret_32',
      FE_DOMAIN: process.env.FE_DOMAIN ?? 'https://fastgpt.example.com',
      REDIS_URL:
        process.env.SANDBOX_INTEGRATION_REDIS_URL ??
        process.env.REDIS_URL ??
        'redis://default:mypassword@localhost:6379/15',
      AGENT_SANDBOX_PREVIEW_PROXY_URL:
        process.env.AGENT_SANDBOX_PREVIEW_PROXY_URL ?? 'http://localhost:3006'
    },
    coverage: { enabled: false },
    outputFile: 'test-results.sandbox-integration.json',
    setupFiles: './test/integrations/sandbox/setup.ts',
    globalSetup: './test/integrations/sandbox/globalSetup.ts',
    fileParallelism: false,
    maxConcurrency: 1,
    pool: 'threads',
    testTimeout: 300_000,
    hookTimeout: 300_000,
    reporters: ['github-actions', 'default'],
    include: ['test/integrations/sandbox/**/*.integration.test.ts']
  }
});
