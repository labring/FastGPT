import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getCliCommandSpecs } from '../../src/cli/registry';
import { runCli } from '../../src/cli/run';
import type { Prompter } from '../../src/infra/ui/prompter';
import type { CliFetchFn } from '../../src/shared/types';

const OBJECT_ID_DATASET = '68ad85a7463006c963799a10';
const RAW_KEY = 'fastgpt-personal-key-1234567890abcdef123456';
const RAW_APP_KEY = 'fastgpt-app-key-1234567890abcdef123456';

const tempDirs: string[] = [];

async function makeConfigDir() {
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-dataset-'));
  tempDirs.push(dir);
  return dir;
}

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify({ code: status >= 400 ? status : 200, data }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function execCli({
  argv,
  configDir,
  isTTY = false,
  fetchFn,
  prompter,
  readStdin
}: {
  argv: string[];
  configDir: string;
  isTTY?: boolean;
  fetchFn?: CliFetchFn;
  prompter?: Prompter;
  readStdin?: () => Promise<string>;
}) {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  const exitCode = await runCli({
    argv,
    env: {
      FASTGPT_CONFIG_DIR: configDir,
      FASTGPT_SECRET_STORE: 'file'
    },
    isTTY,
    fetchFn,
    prompter,
    readStdin,
    stdout: (line) => stdoutLines.push(line),
    stderr: (line) => stderrLines.push(line)
  });

  return {
    exitCode,
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n')
  };
}

describe('Dataset CLI Commands integration (cli/src/cli/commands/dataset.ts)', () => {
  it('registers only OpenAPI-compatible dataset commands with personalKey support', () => {
    const datasetSpecs = getCliCommandSpecs().filter((spec) => spec.path[0] === 'dataset');
    expect(datasetSpecs.length).toBe(21);
    expect(datasetSpecs.every((spec) => spec.authModes.includes('personalKey'))).toBe(true);
  });

  it('updates from file or stdin with flag precedence and rejects malformed fields before HTTP', async () => {
    const configDir = await makeConfigDir();
    const file = join(configDir, 'update.json');
    const payload = {
      id: '68ad85a7463006c963799a05',
      name: 'File name',
      autoSync: true,
      vlmModelId: null,
      websiteConfig: { url: 'https://example.com/docs', selector: 'main' }
    };
    await writeFile(file, JSON.stringify(payload));
    const auth = [
      '--token',
      'test-session',
      '--base-url',
      'https://cloud.fastgpt.cn',
      '--format',
      'json'
    ];
    let requests = 0;
    const fetchFn: CliFetchFn = async (input, init) => {
      requests += 1;
      const url = input instanceof Request ? input.url : String(input);
      const method = input instanceof Request ? input.method : init?.method;
      const body =
        input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body));
      expect(method).toBe('PUT');
      expect(url).toBe('https://cloud.fastgpt.cn/api/core/dataset/update');
      expect(body).toEqual(payload);
      return jsonResp(null);
    };

    const preview = await execCli({
      argv: [
        'dataset',
        'update',
        '--id',
        OBJECT_ID_DATASET,
        '--file',
        file,
        '--name',
        ' Flag name ',
        '--no-auto-sync',
        '--parent-id',
        'null',
        '--avatar',
        '/imgs/dataset/avatar.png',
        '--agent-model',
        'qa-model',
        '--vlm-model',
        '',
        '--dry-run',
        ...auth
      ],
      configDir,
      fetchFn
    });
    expect(preview.exitCode).toBe(0);
    expect(requests).toBe(0);
    expect(JSON.parse(preview.stdout).data).toMatchObject({
      method: 'PUT',
      payload: {
        ...payload,
        id: OBJECT_ID_DATASET,
        name: 'Flag name',
        autoSync: false,
        parentId: null,
        avatar: '/imgs/dataset/avatar.png',
        agentModelId: 'qa-model',
        vlmModelId: ''
      }
    });

    const real = await execCli({
      argv: ['dataset', 'update', '--stdin', ...auth],
      configDir,
      readStdin: async () => JSON.stringify(payload),
      fetchFn
    });
    expect(real.exitCode).toBe(0);
    expect(JSON.parse(real.stdout)).toMatchObject({
      changed: true,
      data: { datasetId: payload.id }
    });
    expect(requests).toBe(1);

    await writeFile(file, JSON.stringify({ name: 42 }));
    const invalid = await execCli({
      argv: ['dataset', 'update', OBJECT_ID_DATASET, '--file', file, '--dry-run', ...auth],
      configDir,
      fetchFn
    });
    expect(invalid.exitCode).toBe(2);
    expect(invalid.stderr).not.toContain('CLI_INTERNAL_ERROR');
    expect(requests).toBe(1);
  });

  it('maps filtering, retrieval, rerank and query extension options to the search contract', async () => {
    const configDir = await makeConfigDir();
    const tagsAnd = [{ tag: 'department', op: '$eq', value: 'support' }];
    const tagsOr = [{ tag: 'priority', op: '$gte', value: 2 }];
    let calls = 0;
    const res = await execCli({
      argv: [
        'dataset',
        'search',
        OBJECT_ID_DATASET,
        'query',
        '--collectionIds',
        ` ${OBJECT_ID_DATASET},68ad85a7463006c963799a05 `,
        '--createTimeGte',
        '2026-01-01T00:00:00Z',
        '--createTimeLte',
        '2026-12-31T23:59:59Z',
        '--tagsAnd',
        JSON.stringify(tagsAnd),
        '--tagsOr',
        JSON.stringify(tagsOr),
        '--mode',
        'mixedRecall',
        '--usageScene',
        'searchTest',
        '--embeddingWeight',
        '0',
        '--similarity',
        '0.3',
        '--rerank',
        '--rerankModelId',
        ' rerank-model ',
        '--rerankCandidateNum',
        '10',
        '--rerankWeight',
        '0',
        '--queryExtension',
        '--queryExtensionModelId',
        ' extension-model ',
        '--queryExtensionBackground',
        'FastGPT documentation',
        '--token',
        'test-session',
        '--format',
        'json'
      ],
      configDir,
      fetchFn: async (input, init) => {
        calls++;
        const url = input instanceof Request ? input.url : String(input);
        expect(url.endsWith('/core/dataset/search')).toBe(true);
        const body =
          input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body));
        expect(body).toEqual({
          scope: {
            datasetIds: [OBJECT_ID_DATASET],
            filter: {
              collectionIds: [OBJECT_ID_DATASET, '68ad85a7463006c963799a05'],
              createTime: { gte: '2026-01-01T00:00:00Z', lte: '2026-12-31T23:59:59Z' },
              tags: { and: tagsAnd, or: tagsOr }
            }
          },
          query: { text: 'query', imageKeys: [] },
          retrieval: { mode: 'mixedRecall', embeddingWeight: 0 },
          rerank: { enabled: true, modelId: 'rerank-model', candidateNum: 10, weight: 0 },
          queryExtension: {
            enabled: true,
            modelId: 'extension-model',
            background: 'FastGPT documentation'
          },
          result: { topk: 20, similarity: 0.3 },
          usageScene: 'searchTest'
        });
        return jsonResp({
          list: [],
          meta: { durationMs: 1, usingReRank: true, usingSimilarityFilter: false }
        });
      }
    });
    expect(res.exitCode).toBe(0);
    expect(calls).toBe(1);
  });

  it.each([
    {
      flags: ['--rerank', '--queryExtension'],
      rerank: { enabled: true, weight: 0.5 },
      queryExtension: { enabled: true, background: '' }
    },
    {
      flags: ['--no-rerank', '--no-queryExtension'],
      rerank: { enabled: false },
      queryExtension: { enabled: false }
    }
  ])(
    'uses shared defaults when toggling search features: $flags',
    async ({ flags, rerank, queryExtension }) => {
      const configDir = await makeConfigDir();
      let calls = 0;
      const res = await execCli({
        argv: [
          'dataset',
          'search',
          OBJECT_ID_DATASET,
          'query',
          ...flags,
          '--token',
          'test-session',
          '--format',
          'json'
        ],
        configDir,
        fetchFn: async (input, init) => {
          calls++;
          const body =
            input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body));
          expect(body.rerank).toEqual(rerank);
          expect(body.queryExtension).toEqual(queryExtension);
          return jsonResp({
            list: [],
            meta: { durationMs: 0, usingReRank: false, usingSimilarityFilter: true }
          });
        }
      });
      expect(res.exitCode).toBe(0);
      expect(calls).toBe(1);
    }
  );

  it.each(
    [
      ['--tagsAnd', '{'],
      ['--tagsOr', '{}'],
      ['--tagsAnd', '[]'],
      ['--tagsOr', '[{"tag":"x","op":"$where","value":"unsafe"}]'],
      ['--collectionIds', 'invalid-id'],
      ['--createTimeGte', 'not-a-date'],
      ['--createTimeGte', '2026-12-01T00:00:00Z', '--createTimeLte', '2026-01-01T00:00:00Z'],
      ['--embeddingWeight', '1.1'],
      ['--usageScene', 'unknown'],
      ['--rerank', '--rerankCandidateNum', '9'],
      ['--rerank', '--rerankWeight', '-0.1'],
      ['--rerank', '--rerankModelId', ' '],
      ['--rerankModelId', 'model'],
      ['--no-rerank', '--rerankWeight', '0.5'],
      ['--queryExtensionModelId', 'model'],
      ['--no-queryExtension', '--queryExtensionBackground', 'background'],
      ['--queryExtension', '--queryExtensionModelId', ' '],
      ['--imageKeys', 'temp/team/image.png'],
      ['--limit', '5000']
    ].map((flags) => ({ flags }))
  )('rejects invalid search options before HTTP: $flags', async ({ flags }) => {
    const configDir = await makeConfigDir();
    let calls = 0;
    const res = await execCli({
      argv: [
        'dataset',
        'search',
        OBJECT_ID_DATASET,
        'query',
        ...flags,
        '--token',
        'test-session',
        '--format',
        'json'
      ],
      configDir,
      fetchFn: async () => {
        calls++;
        return jsonResp({});
      }
    });
    expect(res.exitCode).toBe(2);
    expect(calls).toBe(0);
    expect(JSON.parse(res.stderr).error.code).toBe('CLI_ARGUMENT_INVALID');
  });

  it.each([false, true])(
    'searches multiple datasets in one call, using --id: %s',
    async (viaFlag) => {
      const configDir = await makeConfigDir();
      const ids = `${OBJECT_ID_DATASET}, 68ad85a7463006c963799a05`;
      let calls = 0;
      const res = await execCli({
        argv: [
          'dataset',
          'search',
          ...(viaFlag ? ['--id', ids, '--text', 'query'] : [ids, 'query']),
          '--token',
          'test-session',
          '--format',
          'json'
        ],
        configDir,
        fetchFn: async (input, init) => {
          calls++;
          const url = input instanceof Request ? input.url : String(input);
          expect(url.endsWith('/core/dataset/search')).toBe(true);
          const body =
            input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body));
          expect(body.scope.datasetIds).toEqual([OBJECT_ID_DATASET, '68ad85a7463006c963799a05']);
          expect(body.result).toEqual({ topk: 20, similarity: 0 });
          return jsonResp({
            list: [],
            meta: { durationMs: 0, usingReRank: false, usingSimilarityFilter: true }
          });
        }
      });
      expect(res.exitCode).toBe(0);
      expect(calls).toBe(1);
    }
  );

  it.each([
    { flags: ['--topk', '5'], budget: { topk: 5 } },
    { flags: ['--maxTokens', '25000'], budget: { maxTokens: 25000 } },
    { flags: ['--topk', '5', '--maxTokens', '0'], budget: { topk: 5 } }
  ])('passes the explicit search budget to the API: $flags', async ({ flags, budget }) => {
    const configDir = await makeConfigDir();
    let calls = 0;
    const res = await execCli({
      argv: [
        'dataset',
        'search',
        OBJECT_ID_DATASET,
        'query',
        ...flags,
        '--token',
        'test-session',
        '--format',
        'json'
      ],
      configDir,
      fetchFn: async (input, init) => {
        calls++;
        const url = input instanceof Request ? input.url : String(input);
        expect(url.endsWith('/core/dataset/search')).toBe(true);
        const body =
          input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body));
        expect(body.result).toEqual({ ...budget, similarity: 0 });
        expect(body.retrieval.mode).toBe('embedding');
        return jsonResp({
          list: [],
          meta: { durationMs: 0, usingReRank: false, usingSimilarityFilter: true }
        });
      }
    });
    expect(res.exitCode).toBe(0);
    expect(calls).toBe(1);
  });

  it('manages dataset lifecycle via System OpenAPI: list, get, create, search, and delete with safety guards', async () => {
    const configDir = await makeConfigDir();

    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({
        schemaVersion: 1,
        currentProfile: 'default',
        profiles: {
          default: {
            baseUrl: 'https://cloud.fastgpt.cn/api',
            authType: 'apikey',
            apiKeyType: 'personal',
            updatedAt: Date.now()
          }
        }
      })
    );
    await writeFile(join(configDir, 'credentials.json'), JSON.stringify({ default: RAW_KEY }), {
      mode: 0o600
    });
    if (process.platform !== 'win32') {
      await chmod(join(configDir, 'credentials.json'), 0o600).catch(() => {});
    }

    const mockFetch: CliFetchFn = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET');

      if (url.includes('/core/dataset/listV2') && method === 'POST') {
        return jsonResp({
          total: 1,
          list: [
            {
              _id: OBJECT_ID_DATASET,
              name: 'SDK Handbook',
              type: 'dataset',
              vectorModel: { model: 'text-embedding-3-small' }
            }
          ]
        });
      }

      if (url.includes('/core/dataset/detail') && method === 'GET') {
        return jsonResp({
          _id: OBJECT_ID_DATASET,
          name: 'SDK Handbook',
          intro: 'Comprehensive SDK guide',
          type: 'dataset',
          vectorModel: { model: 'text-embedding-3-small' }
        });
      }

      if (url.includes('/core/dataset/create') && method === 'POST') {
        return jsonResp(OBJECT_ID_DATASET);
      }

      if (url.includes('/core/dataset/delete') && method === 'DELETE') {
        return jsonResp({});
      }

      if (url.endsWith('/core/dataset/search') && method === 'POST') {
        const body =
          input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body));
        expect(body.scope.datasetIds).toEqual([OBJECT_ID_DATASET]);
        return jsonResp({
          list: [
            {
              id: 'chunk-1',
              q: 'What is FastGPT CLI?',
              a: 'A unified command line interface for FastGPT.',
              score: [{ type: 'reRank', value: 0.92, index: 0 }],
              sourceName: 'cli-manual.md'
            }
          ],
          meta: { durationMs: 345, usingReRank: false, usingSimilarityFilter: true }
        });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    };

    // 1. dataset list
    const listRes = await execCli({
      argv: ['dataset', 'list', '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(listRes.stderr).toBe('');
    expect(listRes.exitCode).toBe(0);
    const listJson = JSON.parse(listRes.stdout);
    expect(listJson.ok).toBe(true);
    expect(listJson.data.list[0].name).toBe('SDK Handbook');
    expect(listJson.meta.page).toBe(1);
    expect(listJson.meta.pageSize).toBe(20);
    expect(listJson.meta.hasMore).toBe(false);

    // 2. dataset get
    const getRes = await execCli({
      argv: ['dataset', 'get', OBJECT_ID_DATASET, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(getRes.exitCode).toBe(0);
    expect(JSON.parse(getRes.stdout).data._id).toBe(OBJECT_ID_DATASET);

    // 3. dataset create --dry-run & real
    const dryCreate = await execCli({
      argv: ['dataset', 'create', '--name', 'New Lib', '--dry-run', '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(dryCreate.exitCode).toBe(0);
    expect(JSON.parse(dryCreate.stdout).data.dryRun).toBe(true);
    expect(JSON.parse(dryCreate.stdout).data.risk).toBe('write');

    const realCreate = await execCli({
      argv: ['dataset', 'create', '--name', 'New Lib', '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(realCreate.exitCode).toBe(0);
    expect(JSON.parse(realCreate.stdout).data.datasetId).toBe(OBJECT_ID_DATASET);

    // 4. dataset search (System OpenAPI /core/dataset/search)
    const searchRes = await execCli({
      argv: ['dataset', 'search', OBJECT_ID_DATASET, 'What is FastGPT CLI?', '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(searchRes.exitCode).toBe(0);
    const searchJson = JSON.parse(searchRes.stdout);
    expect(searchJson.ok).toBe(true);
    expect(searchJson.data.list[0].q).toBe('What is FastGPT CLI?');
    expect(searchJson.data.meta.durationMs).toBe(345);

    // 4b. dataset get & search via alternative --id / --dataset-ids flags
    const getByIdRes = await execCli({
      argv: ['dataset', 'get', '--id', OBJECT_ID_DATASET, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(getByIdRes.exitCode).toBe(0);
    expect(JSON.parse(getByIdRes.stdout).data._id).toBe(OBJECT_ID_DATASET);

    const searchByIdRes = await execCli({
      argv: [
        'dataset',
        'search',
        '--dataset-ids',
        OBJECT_ID_DATASET,
        '--text',
        'Alternative flag search',
        '--topk',
        '5',
        '--format',
        'json'
      ],
      configDir,
      fetchFn: mockFetch
    });
    expect(searchByIdRes.exitCode).toBe(0);

    // 5. dataset delete with --dry-run, blocked without --yes, confirmed with --yes
    const deleteDryRun = await execCli({
      argv: ['dataset', 'delete', OBJECT_ID_DATASET, '--dry-run', '--format', 'json'],
      configDir,
      isTTY: false,
      fetchFn: mockFetch
    });
    expect(deleteDryRun.exitCode).toBe(0);
    const deleteDryJson = JSON.parse(deleteDryRun.stdout);
    expect(deleteDryJson.data.dryRun).toBe(true);
    expect(deleteDryJson.data.risk).toBe('destructive');

    const deleteBlocked = await execCli({
      argv: ['dataset', 'delete', OBJECT_ID_DATASET, '--format', 'json'],
      configDir,
      isTTY: false,
      fetchFn: mockFetch
    });
    expect(deleteBlocked.exitCode).toBe(2);
    expect(JSON.parse(deleteBlocked.stderr).error.code).toBe('CLI_ARGUMENT_INVALID');

    const deleteConfirmed = await execCli({
      argv: ['dataset', 'delete', OBJECT_ID_DATASET, '--yes', '--format', 'json'],
      configDir,
      isTTY: false,
      fetchFn: mockFetch
    });
    expect(deleteConfirmed.exitCode).toBe(0);
    expect(JSON.parse(deleteConfirmed.stdout).data.deleted).toBe(true);
  });

  it('blocks appKey with AUTH_MODE_UNSUPPORTED (exit code 3) on dataset commands', async () => {
    const configDir = await makeConfigDir();

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
            boundAppId: 'app-123',
            updatedAt: Date.now()
          }
        }
      })
    );
    await writeFile(join(configDir, 'credentials.json'), JSON.stringify({ default: RAW_APP_KEY }), {
      mode: 0o600
    });
    if (process.platform !== 'win32') {
      await chmod(join(configDir, 'credentials.json'), 0o600).catch(() => {});
    }

    let fetchTriggered = false;
    const res = await execCli({
      argv: ['dataset', 'list', '--format', 'json'],
      configDir,
      fetchFn: async () => {
        fetchTriggered = true;
        return jsonResp({});
      }
    });

    expect(res.exitCode).toBe(3);
    expect(fetchTriggered).toBe(false);
    const errJson = JSON.parse(res.stderr);
    expect(errJson.error.code).toBe('AUTH_MODE_UNSUPPORTED');
    expect(errJson.error.message).toContain('cannot use an app-scoped API Key');
  });

  it('rejects invalid parameters with exit code 2 and structured validation issues', async () => {
    const configDir = await makeConfigDir();

    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({
        schemaVersion: 1,
        currentProfile: 'default',
        profiles: {
          default: {
            baseUrl: 'https://cloud.fastgpt.cn/api',
            authType: 'apikey',
            apiKeyType: 'personal',
            updatedAt: Date.now()
          }
        }
      })
    );
    await writeFile(join(configDir, 'credentials.json'), JSON.stringify({ default: RAW_KEY }), {
      mode: 0o600
    });
    if (process.platform !== 'win32') {
      await chmod(join(configDir, 'credentials.json'), 0o600).catch(() => {});
    }

    const res = await execCli({
      argv: [
        'dataset',
        'create',
        '--name',
        'Invalid Dataset',
        '--type',
        'not-a-valid-type',
        '--dry-run',
        '--format',
        'json'
      ],
      configDir
    });

    expect(res.exitCode).toBe(2);
    expect(JSON.parse(res.stderr).error.code).toBe('CLI_ARGUMENT_INVALID');

    let httpCalled = false;
    const pageTypoRes = await execCli({
      argv: ['dataset', 'list', '--page', 'typo', '--format', 'json'],
      configDir,
      fetchFn: async () => {
        httpCalled = true;
        return jsonResp({});
      }
    });
    expect(pageTypoRes.exitCode).toBe(2);
    expect(httpCalled).toBe(false);
    expect(JSON.parse(pageTypoRes.stderr).error.code).toBe('CLI_ARGUMENT_INVALID');

    const modeTypoRes = await execCli({
      argv: [
        'dataset',
        'search',
        OBJECT_ID_DATASET,
        'query text',
        '--mode',
        'typo',
        '--format',
        'json'
      ],
      configDir,
      fetchFn: async () => {
        httpCalled = true;
        return jsonResp({});
      }
    });
    expect(modeTypoRes.exitCode).toBe(2);
    expect(httpCalled).toBe(false);
    expect(JSON.parse(modeTypoRes.stderr).error.code).toBe('CLI_ARGUMENT_INVALID');
  });

  it('executes collection, data, batch, output flags, and validation guards end-to-end with personalKey', async () => {
    const configDir = await makeConfigDir();
    const OBJECT_ID_COL = '68ad85a7463006c963799a11';
    const OBJECT_ID_DATA = '68ad85a7463006c963799a12';

    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({
        schemaVersion: 1,
        currentProfile: 'default',
        profiles: {
          default: {
            baseUrl: 'https://cloud.fastgpt.cn/api',
            authType: 'apikey',
            apiKeyType: 'personal',
            updatedAt: Date.now()
          }
        }
      })
    );
    await writeFile(join(configDir, 'credentials.json'), JSON.stringify({ default: RAW_KEY }), {
      mode: 0o600
    });
    if (process.platform !== 'win32') {
      await chmod(join(configDir, 'credentials.json'), 0o600).catch(() => {});
    }

    const sampleFile = join(configDir, 'notes.md');
    await writeFile(sampleFile, '# FastGPT CLI Guide\nHello world');
    const chunksJson = join(configDir, 'chunks.json');
    await writeFile(chunksJson, JSON.stringify([{ q: 'Chunk 1', a: 'Answer 1' }]));

    const mockFetch: CliFetchFn = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/core/dataset/collection/listV2')) {
        return jsonResp({ total: 1, list: [{ _id: OBJECT_ID_COL, name: 'notes.md' }] });
      }
      if (url.includes('/core/dataset/collection/detail')) {
        return jsonResp({ _id: OBJECT_ID_COL, name: 'notes.md' });
      }
      if (url.includes('/core/dataset/collection/create/localFile')) {
        return jsonResp({ collectionId: OBJECT_ID_COL, results: { insertLen: 1 } });
      }
      if (url.includes('/core/dataset/collection/create/text')) {
        return jsonResp({ collectionId: OBJECT_ID_COL, results: { insertLen: 1 } });
      }
      if (url.includes('/core/dataset/collection/update')) {
        return jsonResp({});
      }
      if (url.includes('/core/dataset/collection/delete')) {
        return jsonResp({});
      }
      if (url.includes('/core/dataset/data/v2/list')) {
        return jsonResp({ total: 1, list: [{ _id: OBJECT_ID_DATA, q: 'Q', a: 'A' }] });
      }
      if (url.includes('/core/dataset/data/detail')) {
        return jsonResp({ id: OBJECT_ID_DATA, q: 'Q', a: 'A' });
      }
      if (url.includes('/core/dataset/data/pushData')) {
        return jsonResp({ insertLen: 1, dataIds: [OBJECT_ID_DATA] });
      }
      if (url.includes('/core/dataset/data/update')) {
        return jsonResp({ q: 'Q2' });
      }
      if (url.includes('/core/dataset/data/delete')) {
        return jsonResp({});
      }
      if (url.includes('/core/dataset/batch/delete')) {
        return jsonResp({
          successIds: [OBJECT_ID_DATASET],
          failedIds: [],
          affectedIds: [OBJECT_ID_DATASET]
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    // 1. collection create-file (direct multipart only) & get & update & delete guard
    const uploadRes = await execCli({
      argv: [
        'dataset',
        'collection',
        'create-file',
        OBJECT_ID_DATASET,
        sampleFile,
        '--format',
        'json'
      ],
      configDir,
      fetchFn: mockFetch
    });
    expect(uploadRes.exitCode).toBe(0);
    expect(JSON.parse(uploadRes.stdout).data.collectionId).toBe(OBJECT_ID_COL);

    const colGetRes = await execCli({
      argv: ['dataset', 'collection', 'get', OBJECT_ID_COL, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(colGetRes.exitCode).toBe(0);

    const colUpdateRes = await execCli({
      argv: [
        'dataset',
        'collection',
        'update',
        OBJECT_ID_COL,
        '--name',
        'Renamed',
        '--format',
        'json'
      ],
      configDir,
      fetchFn: mockFetch
    });
    expect(colUpdateRes.exitCode).toBe(0);

    const colDelGuard = await execCli({
      argv: ['dataset', 'collection', 'delete', OBJECT_ID_COL, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(colDelGuard.exitCode).toBe(2);

    const colDelOk = await execCli({
      argv: ['dataset', 'collection', 'delete', OBJECT_ID_COL, '--yes', '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(colDelOk.exitCode).toBe(0);

    // 2. data push --file & list & get & update & delete guard
    const pushRes = await execCli({
      argv: ['dataset', 'data', 'push', OBJECT_ID_COL, '--file', chunksJson, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(pushRes.exitCode).toBe(0);
    expect(JSON.parse(pushRes.stdout).data.insertLen).toBe(1);

    const dataGetRes = await execCli({
      argv: ['dataset', 'data', 'get', OBJECT_ID_DATA, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(dataGetRes.exitCode).toBe(0);

    const dataDelGuard = await execCli({
      argv: ['dataset', 'data', 'delete', OBJECT_ID_DATA, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(dataDelGuard.exitCode).toBe(2);

    // 3. batch-delete execution
    const batchDelOk = await execCli({
      argv: ['dataset', 'batch-delete', '--ids', OBJECT_ID_DATASET, '--yes', '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(batchDelOk.exitCode).toBe(0);
    expect(JSON.parse(batchDelOk.stdout).data.successIds).toEqual([OBJECT_ID_DATASET]);

    // 4. agent output efficiency flags: --fields projection & --pick --raw extraction
    const fieldsList = await execCli({
      argv: [
        'dataset',
        'collection',
        'list',
        OBJECT_ID_DATASET,
        '--fields',
        '_id',
        '--format',
        'json'
      ],
      configDir,
      fetchFn: mockFetch
    });
    expect(fieldsList.exitCode).toBe(0);
    const fieldsJson = JSON.parse(fieldsList.stdout);
    expect(fieldsJson.warnings).toBeUndefined();
    expect(fieldsJson.data.list[0]).toEqual({ _id: OBJECT_ID_COL });

    const pickRaw = await execCli({
      argv: [
        'dataset',
        'collection',
        'create-text',
        OBJECT_ID_DATASET,
        '--name',
        'Quick',
        '--text',
        'Body',
        '--pick',
        'data.collectionId',
        '--raw'
      ],
      configDir,
      fetchFn: mockFetch
    });
    expect(pickRaw.exitCode).toBe(0);
    expect(pickRaw.stdout).toBe(OBJECT_ID_COL);

    // 5. regression guards:
    // - batch-move missing --parent-id fails with exit code 2 instead of moving to root
    const batchMoveMissingParent = await execCli({
      argv: ['dataset', 'batch-move', '--ids', OBJECT_ID_DATASET, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(batchMoveMissingParent.exitCode).toBe(2);

    // - dataset data update without --q fails cleanly with exit code 2
    const dataUpdateNoQ = await execCli({
      argv: ['dataset', 'data', 'update', OBJECT_ID_DATA, '--a', 'Only answer', '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(dataUpdateNoQ.exitCode).toBe(2);

    // - dataset create --file with non-string field {"name":42} returns exit code 2 (Zod validation, not TypeError)
    const badCreateJson = join(configDir, 'bad-create.json');
    await writeFile(badCreateJson, JSON.stringify({ name: 42 }));
    const badCreateRes = await execCli({
      argv: ['dataset', 'create', '--file', badCreateJson, '--dry-run', '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(badCreateRes.exitCode).toBe(2);

    // - collection update --file with non-string name {"name":42} returns exit code 2 with plain-quote hint
    const badColUpdateJson = join(configDir, 'bad-col-update.json');
    await writeFile(badColUpdateJson, JSON.stringify({ name: 42 }));
    const badColUpdateRes = await execCli({
      argv: [
        'dataset',
        'collection',
        'update',
        OBJECT_ID_COL,
        '--file',
        badColUpdateJson,
        '--dry-run',
        '--format',
        'json'
      ],
      configDir,
      fetchFn: mockFetch
    });
    expect(badColUpdateRes.exitCode).toBe(2);
    const badColErr = JSON.parse(badColUpdateRes.stderr).error;
    expect(badColErr.code).toBe('CLI_ARGUMENT_INVALID');
    expect(badColErr.hint).not.toContain('\\"');
    expect(badColErr.hint).toContain(
      'fastgpt commands --command "dataset collection update" --format json'
    );

    // - dataset search --file preserves OpenAPI topk-first normalization and rejects invalid JSON fields strictly
    let capturedSearchBody: any;
    const searchCaptureFetch: CliFetchFn = async (input, init) => {
      const rawBody =
        input instanceof Request ? await input.clone().text() : String(init?.body ?? '');
      capturedSearchBody = JSON.parse(rawBody);
      return jsonResp({
        list: [],
        meta: { durationMs: 12, usingSimilarityFilter: false, usingReRank: false }
      });
    };

    const dualBudgetJson = join(configDir, 'search-dual-budget.json');
    await writeFile(
      dualBudgetJson,
      JSON.stringify({
        scope: { datasetIds: [OBJECT_ID_DATASET] },
        query: { text: 'budget priority' },
        result: { topk: 10, maxTokens: 1000, similarity: 0.5 }
      })
    );
    const dualBudgetRes = await execCli({
      argv: ['dataset', 'search', '--file', dualBudgetJson, '--format', 'json'],
      configDir,
      fetchFn: searchCaptureFetch
    });
    expect(dualBudgetRes.exitCode).toBe(0);
    expect(capturedSearchBody.result).toEqual({ topk: 10, similarity: 0.5 });
    expect(capturedSearchBody.result.maxTokens).toBeUndefined();

    // - explicit dual CLI flags --topk and --max-tokens follow OpenAPI topk-first normalization
    const dualFlagsRes = await execCli({
      argv: [
        'dataset',
        'search',
        OBJECT_ID_DATASET,
        'hello',
        '--topk',
        '10',
        '--max-tokens',
        '1000',
        '--format',
        'json'
      ],
      configDir,
      fetchFn: searchCaptureFetch
    });
    expect(dualFlagsRes.exitCode).toBe(0);
    expect(capturedSearchBody.result).toEqual({ topk: 10, similarity: 0 });
    expect(capturedSearchBody.result.maxTokens).toBeUndefined();

    // - invalid similarity type ("0.9"), invalid rerank.enabled ("true"), and unknown fields must fail schema validation (exit code 2)
    for (const badPayload of [
      {
        scope: { datasetIds: [OBJECT_ID_DATASET] },
        query: { text: 'bad sim' },
        result: { similarity: '0.9' }
      },
      {
        scope: { datasetIds: [OBJECT_ID_DATASET] },
        query: { text: 'bad rerank' },
        rerank: { enabled: 'true', modelId: 'rerank-model' }
      },
      {
        scope: { datasetIds: [OBJECT_ID_DATASET] },
        query: { text: 'unknown field' },
        result: { topk: 5, extraField: 123 }
      }
    ]) {
      const badPath = join(configDir, 'bad-search.json');
      await writeFile(badPath, JSON.stringify(badPayload));
      let badHttpCalled = false;
      const badRes = await execCli({
        argv: ['dataset', 'search', '--file', badPath, '--format', 'json'],
        configDir,
        fetchFn: async () => {
          badHttpCalled = true;
          return jsonResp({});
        }
      });
      expect(badRes.exitCode).toBe(2);
      expect(badHttpCalled).toBe(false);
      expect(JSON.parse(badRes.stderr).error.code).toBe('CLI_ARGUMENT_INVALID');
    }
  });
});
