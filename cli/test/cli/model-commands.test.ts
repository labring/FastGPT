import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli/run';
import { createCommandRegistry } from '../../src/cli/registry';
import type { CliFetchFn } from '../../src/shared/types';

const tempDirs: string[] = [];
const catalog = {
  version: 'member-model-catalog-v1',
  data: {
    models: [
      {
        modelId: 'member-llm',
        model: 'provider-llm',
        name: 'Member LLM',
        type: 'llm',
        provider: 'openai',
        scope: 'team',
        config: { maxContext: 128000 }
      }
    ],
    providers: [
      {
        provider: 'openai',
        value: { en: 'OpenAI', 'zh-CN': 'OpenAI', 'zh-Hant': 'OpenAI' },
        avatar: '/imgs/model/openai.svg'
      }
    ],
    defaultModelIds: { llm: 'member-llm' }
  }
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** 通过真实命令管线验证鉴权、参数映射及 JSON 输出，HTTP 使用注入的传输实现。 */
async function execCli({
  args = [],
  env = {},
  fetchFn = vi.fn(),
  configDir
}: {
  args?: string[];
  env?: NodeJS.ProcessEnv;
  fetchFn?: CliFetchFn;
  configDir?: string;
} = {}) {
  const dir = configDir ?? (await mkdtemp(join(tmpdir(), 'fastgpt-cli-model-')));
  if (!configDir) tempDirs.push(dir);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCli({
    argv: ['model', 'list', '--format', 'json', ...args],
    env: { FASTGPT_CONFIG_DIR: dir, FASTGPT_SECRET_STORE: 'file', ...env },
    isTTY: false,
    fetchFn,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line)
  });
  return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

describe('model list', () => {
  it('registers only the requested member model list command for discovery', () => {
    const models = createCommandRegistry()
      .getMetas()
      .filter((meta) => meta.path[0] === 'model');
    expect(models).toMatchObject([
      { command: 'model list', risk: 'read', authModes: ['token', 'personalKey'] }
    ]);
    expect(models).toHaveLength(1);
  });

  it.each([
    { env: { FASTGPT_TOKEN: 'test-session' }, header: 'token', value: 'test-session' },
    {
      env: { FASTGPT_API_KEY: 'fastgpt-personal-test-key' },
      header: 'authorization',
      value: 'Bearer fastgpt-personal-test-key'
    }
  ])('uses member catalog with $header auth and preserves its full response', async (auth) => {
    const fetchFn = vi.fn<CliFetchFn>(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      expect(request.method).toBe('GET');
      expect(url.pathname).toBe('/api/core/ai/model/catalog');
      expect(url.search).toBe('');
      expect(request.headers.get(auth.header)).toBe(auth.value);
      return Response.json({ code: 200, data: catalog });
    });

    const result = await execCli({ env: auth.env, fetchFn });
    expect(result.exitCode).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      command: 'model list',
      changed: false,
      data: catalog
    });
    expect(result.stdout).not.toContain(auth.value.replace(/^Bearer /, ''));
  });

  it('maps member display options without sending a cache version or outlink identity', async () => {
    const fetchFn = vi.fn<CliFetchFn>(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({
        includeSourceMember: 'true',
        orderBy: 'custom'
      });
      return Response.json({ code: 200, data: catalog });
    });
    const result = await execCli({
      args: ['--include-source-member', '--order-by', 'custom'],
      env: { FASTGPT_TOKEN: 'test-session' },
      fetchFn
    });
    expect(result.exitCode).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('returns an empty member catalog without falling back to public models', async () => {
    const emptyCatalog = { ...catalog, data: { models: [], providers: [], defaultModelIds: {} } };
    const fetchFn = vi.fn<CliFetchFn>(async () => Response.json({ code: 200, data: emptyCatalog }));
    const result = await execCli({ env: { FASTGPT_TOKEN: 'test-session' }, fetchFn });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).data).toEqual(emptyCatalog);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported order values before sending a request', async () => {
    const fetchFn = vi.fn<CliFetchFn>();
    const result = await execCli({
      args: ['--order-by', 'invalid'],
      env: { FASTGPT_TOKEN: 'test-session' },
      fetchFn
    });
    expect(result.exitCode).toBe(2);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('requires member credentials', async () => {
    const fetchFn = vi.fn<CliFetchFn>();
    const result = await execCli({ fetchFn });
    expect(result.exitCode).toBe(3);
    expect(JSON.parse(result.stderr).error.code).toBe('AUTH_REQUIRED');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects a known App Key without querying a member catalog', async () => {
    const configDir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-model-app-key-'));
    tempDirs.push(configDir);
    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({
        schemaVersion: 1,
        currentProfile: 'default',
        profiles: {
          default: {
            baseUrl: 'https://cloud.fastgpt.cn/api',
            authType: 'apikey',
            apiKeyType: 'app',
            boundAppId: '68ad85a7463006c963799a05',
            updatedAt: Date.now()
          }
        }
      })
    );
    await writeFile(
      join(configDir, 'credentials.json'),
      JSON.stringify({ default: 'app-test-key' }),
      {
        mode: 0o600
      }
    );
    const fetchFn = vi.fn<CliFetchFn>();
    const result = await execCli({ configDir, fetchFn });
    expect(result.exitCode).toBe(3);
    expect(JSON.parse(result.stderr).error.code).toBe('AUTH_MODE_UNSUPPORTED');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
