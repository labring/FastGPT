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
  prompter
}: {
  argv: string[];
  configDir: string;
  isTTY?: boolean;
  fetchFn?: CliFetchFn;
  prompter?: Prompter;
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
    expect(datasetSpecs.length).toBe(20);
    expect(datasetSpecs.every((spec) => spec.authModes.includes('personalKey'))).toBe(true);
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

      if (url.includes('/core/dataset/search') && method === 'POST') {
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
          meta: {
            durationMs: 345,
            usingSimilarityFilter: true,
            usingReRank: true
          }
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

    // - explicit dual CLI flags --topk and --max-tokens must be rejected with exit code 2
    let dualFlagsHttpCalled = false;
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
      fetchFn: async () => {
        dualFlagsHttpCalled = true;
        return jsonResp({});
      }
    });
    expect(dualFlagsRes.exitCode).toBe(2);
    expect(dualFlagsHttpCalled).toBe(false);

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
