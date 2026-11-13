import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
  it('manages dataset lifecycle: list, get, create, update, search, and delete with safety guards', async () => {
    const configDir = await makeConfigDir();

    // 预先写入 personal API key 凭据
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

      if (url.includes('/core/dataset/update') && method === 'PUT') {
        return jsonResp({});
      }

      if (url.includes('/core/dataset/delete') && method === 'DELETE') {
        return jsonResp({});
      }

      if (url.includes('/core/dataset/searchTest') && method === 'POST') {
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
          duration: '0.345s',
          limit: 5000,
          searchMode: 'mixedRecall',
          usingReRank: true,
          similarity: 0.5
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

    // 3. dataset create --dry-run
    const dryCreate = await execCli({
      argv: ['dataset', 'create', '--name', 'New Lib', '--dry-run', '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(dryCreate.exitCode).toBe(0);
    expect(JSON.parse(dryCreate.stdout).data.dryRun).toBe(true);
    expect(JSON.parse(dryCreate.stdout).data.risk).toBe('write');

    // 4. dataset create real
    const realCreate = await execCli({
      argv: ['dataset', 'create', '--name', 'New Lib', '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(realCreate.exitCode).toBe(0);
    expect(JSON.parse(realCreate.stdout).data.datasetId).toBe(OBJECT_ID_DATASET);

    // 5. dataset update
    const updateRes = await execCli({
      argv: [
        'dataset',
        'update',
        OBJECT_ID_DATASET,
        '--name',
        'Updated Lib',
        '--intro',
        'Fresh docs',
        '--format',
        'json'
      ],
      configDir,
      fetchFn: mockFetch
    });
    expect(updateRes.exitCode).toBe(0);
    expect(JSON.parse(updateRes.stdout).data.datasetId).toBe(OBJECT_ID_DATASET);

    // 5b. dataset update --parent-id null (R3: move to root preview)
    const updateMoveRootDry = await execCli({
      argv: [
        'dataset',
        'update',
        OBJECT_ID_DATASET,
        '--parent-id',
        'null',
        '--dry-run',
        '--format',
        'json'
      ],
      configDir,
      fetchFn: mockFetch
    });
    expect(updateMoveRootDry.exitCode).toBe(0);
    const updateMoveRootJson = JSON.parse(updateMoveRootDry.stdout);
    expect(updateMoveRootJson.data.dryRun).toBe(true);
    expect(updateMoveRootJson.data.risk).toBe('write');
    expect(updateMoveRootJson.data.payload.parentId).toBeNull();

    // 6. dataset search
    const searchRes = await execCli({
      argv: ['dataset', 'search', OBJECT_ID_DATASET, 'What is FastGPT CLI?', '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(searchRes.exitCode).toBe(0);
    const searchJson = JSON.parse(searchRes.stdout);
    expect(searchJson.ok).toBe(true);
    expect(searchJson.data.list[0].q).toBe('What is FastGPT CLI?');

    // 6b. dataset get, update, search via alternative --id flag (R6)
    const getByIdRes = await execCli({
      argv: ['dataset', 'get', '--id', OBJECT_ID_DATASET, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(getByIdRes.exitCode).toBe(0);
    expect(JSON.parse(getByIdRes.stdout).data._id).toBe(OBJECT_ID_DATASET);

    const updateByIdRes = await execCli({
      argv: [
        'dataset',
        'update',
        '--id',
        OBJECT_ID_DATASET,
        '--name',
        'Flag Updated',
        '--format',
        'json'
      ],
      configDir,
      fetchFn: mockFetch
    });
    expect(updateByIdRes.exitCode).toBe(0);

    const searchByIdRes = await execCli({
      argv: [
        'dataset',
        'search',
        '--id',
        OBJECT_ID_DATASET,
        '--text',
        'Alternative flag search',
        '--format',
        'json'
      ],
      configDir,
      fetchFn: mockFetch
    });
    expect(searchByIdRes.exitCode).toBe(0);

    // 7. dataset delete with --dry-run (R7: preview without prompt or deleting)
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
    expect(deleteDryJson.data.operation).toBe('dataset delete');

    // 7b. dataset delete in non-interactive/JSON mode without --yes -> must be blocked with exit code 2!
    const deleteBlocked = await execCli({
      argv: ['dataset', 'delete', OBJECT_ID_DATASET, '--format', 'json'],
      configDir,
      isTTY: false,
      fetchFn: mockFetch
    });
    expect(deleteBlocked.exitCode).toBe(2);
    expect(JSON.parse(deleteBlocked.stderr).error.code).toBe('CLI_ARGUMENT_INVALID');

    // 8. dataset delete with --yes -> succeeds!
    const deleteConfirmed = await execCli({
      argv: ['dataset', 'delete', OBJECT_ID_DATASET, '--yes', '--format', 'json'],
      configDir,
      isTTY: false,
      fetchFn: mockFetch
    });
    expect(deleteConfirmed.exitCode).toBe(0);
    expect(JSON.parse(deleteConfirmed.stdout).data.deleted).toBe(true);

    // 8b. dataset delete using --id and --yes
    const deleteByIdConfirmed = await execCli({
      argv: ['dataset', 'delete', '--id', OBJECT_ID_DATASET, '--yes', '--format', 'json'],
      configDir,
      isTTY: false,
      fetchFn: mockFetch
    });
    expect(deleteByIdConfirmed.exitCode).toBe(0);
    expect(JSON.parse(deleteByIdConfirmed.stdout).data.deleted).toBe(true);
  });

  it('blocks appKey with AUTH_MODE_UNSUPPORTED (exit code 3) on dataset commands', async () => {
    const configDir = await makeConfigDir();

    // 写入 app-scoped API key 凭据
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

  it('rejects invalid parameters with exit code 2 and structured validation issues (R5)', async () => {
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

    // Invalid type passed to create --dry-run
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
    const errJson = JSON.parse(res.stderr);
    expect(errJson.error.code).toBe('CLI_ARGUMENT_INVALID');

    // 显式传入非法页码 --page typo，必须返回退出码 2，且未发出 HTTP 请求（R3）
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

    // 显式传入非法页码 --page 0，必须返回退出码 2，且未发出 HTTP 请求（R3）
    const pageZeroRes = await execCli({
      argv: ['dataset', 'list', '--page', '0', '--format', 'json'],
      configDir,
      fetchFn: async () => {
        httpCalled = true;
        return jsonResp({});
      }
    });
    expect(pageZeroRes.exitCode).toBe(2);
    expect(httpCalled).toBe(false);

    // 显式传入非法检索模式 --mode typo，必须返回退出码 2，且未发出 HTTP 请求（R3）
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

  it('executes collection, data, train, synonym, and batch commands end-to-end and enforces token-only guards', async () => {
    const configDir = await makeConfigDir();
    const OBJECT_ID_COL = '68ad85a7463006c963799a11';
    const OBJECT_ID_DATA = '68ad85a7463006c963799a12';
    const OBJECT_ID_SYN = '68ad85a7463006c963799a13';

    await writeFile(
      join(configDir, 'config.json'),
      JSON.stringify({
        schemaVersion: 1,
        currentProfile: 'default',
        profiles: {
          default: {
            baseUrl: 'https://cloud.fastgpt.cn/api',
            authType: 'token',
            updatedAt: Date.now()
          },
          personal: {
            baseUrl: 'https://cloud.fastgpt.cn/api',
            authType: 'apikey',
            apiKeyType: 'personal',
            updatedAt: Date.now()
          }
        }
      })
    );
    await writeFile(
      join(configDir, 'credentials.json'),
      JSON.stringify({ default: 'u1:session-secret-token-123456', personal: RAW_KEY }),
      { mode: 0o600 }
    );
    if (process.platform !== 'win32') {
      await chmod(join(configDir, 'credentials.json'), 0o600).catch(() => {});
    }

    const sampleFile = join(configDir, 'notes.md');
    await writeFile(sampleFile, '# FastGPT CLI Guide\nHello world');
    const chunksJson = join(configDir, 'chunks.json');
    await writeFile(chunksJson, JSON.stringify([{ q: 'Chunk 1', a: 'Answer 1' }]));
    const exportCsv = join(configDir, 'exported.csv');

    const mockFetch: CliFetchFn = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes('/core/dataset/collection/listV2')) {
        return jsonResp({ total: 1, list: [{ _id: OBJECT_ID_COL, name: 'notes.md' }] });
      }
      if (url.includes('/core/dataset/collection/create/localFile')) {
        return jsonResp({ collectionId: OBJECT_ID_COL, results: { insertLen: 1 } });
      }
      if (url.includes('/core/dataset/collection/create/text')) {
        return jsonResp({ collectionId: OBJECT_ID_COL, results: { insertLen: 1 } });
      }
      if (url.includes('/core/dataset/collection/delete')) {
        return jsonResp({});
      }
      if (url.includes('/core/dataset/data/v2/list')) {
        return jsonResp({ total: 1, list: [{ _id: OBJECT_ID_DATA, q: 'Q', a: 'A' }] });
      }
      if (url.includes('/core/dataset/data/pushData')) {
        return jsonResp({ insertLen: 1, dataIds: [OBJECT_ID_DATA] });
      }
      if (url.includes('/core/dataset/data/delete')) {
        return jsonResp({});
      }
      if (url.includes('/core/dataset/training/getDatasetTrainingQueue')) {
        return jsonResp({ hasTrainingTask: false });
      }
      if (url.includes('/core/dataset/training/hasDatasetTrainingError')) {
        return jsonResp({ hasError: false });
      }
      if (url.includes('/core/dataset/exportAll')) {
        return new Response('q,a\nfoo,bar', { status: 200 });
      }
      if (url.includes('/proApi/core/dataset/tag/getAllTags')) {
        return jsonResp([{ _id: '68ad85a7463006c963799a14', tag: 'Docs' }]);
      }
      if (url.includes('/core/dataset/synonym/detail')) {
        return jsonResp({ rebuilding: false });
      }
      if (url.includes('/core/dataset/synonym/download')) {
        return new Response('standard,synonyms\nAI,人工智能', { status: 200 });
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

    // 1. collection create-file & list & delete guard
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

    // 2. data push --file & list & delete guard
    const pushRes = await execCli({
      argv: ['dataset', 'data', 'push', OBJECT_ID_COL, '--file', chunksJson, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(pushRes.exitCode).toBe(0);
    expect(JSON.parse(pushRes.stdout).data.insertLen).toBe(1);

    const dataDelGuard = await execCli({
      argv: ['dataset', 'data', 'delete', OBJECT_ID_DATA, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(dataDelGuard.exitCode).toBe(2);

    // 3. train wait
    const trainWaitRes = await execCli({
      argv: ['dataset', 'train', 'wait', OBJECT_ID_DATASET, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(trainWaitRes.exitCode).toBe(0);
    expect(JSON.parse(trainWaitRes.stdout).data.completed).toBe(true);

    // 4. export --output
    const exportRes = await execCli({
      argv: ['dataset', 'export', OBJECT_ID_DATASET, '--output', exportCsv, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(exportRes.exitCode).toBe(0);
    expect(JSON.parse(exportRes.stdout).data.outputPath).toBe(exportCsv);

    // 5. token-only enforcement on personalKey for dataset tag list & dataset export
    const tagWithPersonalKey = await execCli({
      argv: [
        'dataset',
        'tag',
        'list',
        OBJECT_ID_DATASET,
        '--profile',
        'personal',
        '--format',
        'json'
      ],
      configDir,
      fetchFn: mockFetch
    });
    expect(tagWithPersonalKey.exitCode).toBe(3);
    expect(JSON.parse(tagWithPersonalKey.stderr).error.code).toBe('AUTH_MODE_UNSUPPORTED');

    const tagWithToken = await execCli({
      argv: ['dataset', 'tag', 'list', OBJECT_ID_DATASET, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(tagWithToken.exitCode).toBe(0);

    // 6. synonym detail & download
    const synDetail = await execCli({
      argv: ['dataset', 'synonym', 'detail', OBJECT_ID_DATASET, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(synDetail.exitCode).toBe(0);

    const synDl = await execCli({
      argv: ['dataset', 'synonym', 'download', OBJECT_ID_SYN, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(synDl.exitCode).toBe(0);
    expect(JSON.parse(synDl.stdout).data.csv).toContain('standard,synonyms');

    // 7. batch-delete non-TTY guard & execution
    const batchDelOk = await execCli({
      argv: ['dataset', 'batch-delete', '--ids', OBJECT_ID_DATASET, '--yes', '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(batchDelOk.exitCode).toBe(0);
    expect(JSON.parse(batchDelOk.stdout).data.successIds).toEqual([OBJECT_ID_DATASET]);

    // 8. agent output efficiency flags: --fields projection & --pick --raw extraction
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

    // 9. OCR regression guards:
    // - train wait --no-fail-on-error exits 0 even when hasError is true
    const waitNoFail = await execCli({
      argv: [
        'dataset',
        'train',
        'wait',
        OBJECT_ID_DATASET,
        '--no-fail-on-error',
        '--format',
        'json'
      ],
      configDir,
      fetchFn: async (input) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.includes('getDatasetTrainingQueue')) {
          return jsonResp({ hasTrainingTask: false });
        }
        if (url.includes('hasDatasetTrainingError')) {
          return jsonResp({ hasError: true });
        }
        return jsonResp({});
      }
    });
    expect(waitNoFail.exitCode).toBe(0);
    expect(JSON.parse(waitNoFail.stdout).data.hasError).toBe(true);

    // - train wait --interval abc rejects NaN with exit code 2 (no infinite loop)
    const waitBadInterval = await execCli({
      argv: [
        'dataset',
        'train',
        'wait',
        OBJECT_ID_DATASET,
        '--interval',
        'abc',
        '--format',
        'json'
      ],
      configDir,
      fetchFn: mockFetch
    });
    expect(waitBadInterval.exitCode).toBe(2);

    // - batch-move missing --parent-id fails with exit code 2 instead of moving to root
    const batchMoveMissingParent = await execCli({
      argv: ['dataset', 'batch-move', '--ids', OBJECT_ID_DATASET, '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(batchMoveMissingParent.exitCode).toBe(2);

    // - tag bind --mode rm fails strictly with exit code 2
    const tagsJsonPath = join(configDir, 'tags.json');
    await writeFile(
      tagsJsonPath,
      JSON.stringify([{ tagId: '68ad85a7463006c963799a14', value: 'v' }])
    );
    const badTagMode = await execCli({
      argv: [
        'dataset',
        'tag',
        'bind',
        '--dataset-id',
        OBJECT_ID_DATASET,
        '--collection-ids',
        OBJECT_ID_COL,
        '--mode',
        'rm',
        '--file',
        tagsJsonPath,
        '--format',
        'json'
      ],
      configDir,
      fetchFn: mockFetch
    });
    expect(badTagMode.exitCode).toBe(2);

    // - dataset data update without --q fails cleanly with exit code 2
    const dataUpdateNoQ = await execCli({
      argv: ['dataset', 'data', 'update', OBJECT_ID_DATA, '--a', 'Only answer', '--format', 'json'],
      configDir,
      fetchFn: mockFetch
    });
    expect(dataUpdateNoQ.exitCode).toBe(2);

    // - dataset export to unwritable path returns exit code 2 (CliArgumentError)
    const badExportDir = join(configDir, 'not-a-dir');
    await writeFile(badExportDir, 'file-blocking-dir');
    const exportFail = await execCli({
      argv: [
        'dataset',
        'export',
        OBJECT_ID_DATASET,
        '--output',
        join(badExportDir, 'out.csv'),
        '--format',
        'json'
      ],
      configDir,
      fetchFn: mockFetch
    });
    expect(exportFail.exitCode).toBe(2);
    expect(JSON.parse(exportFail.stderr).error.code).toBe('CLI_ARGUMENT_INVALID');
  });
});
