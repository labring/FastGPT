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

      if (url.includes('/core/dataset/update') && method === 'POST') {
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
  });
});
