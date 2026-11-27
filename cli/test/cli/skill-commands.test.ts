import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/run';
import type { CliFetchFn } from '../../src/shared/types';

const OBJECT_ID_SKILL = '68ad85a7463006c963799a21';
const RAW_KEY = 'fastgpt-personal-key-1234567890abcdef123456';
const RAW_APP_KEY = 'fastgpt-app-key-1234567890abcdef123456';

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-skill-'));
  tempDirs.push(dir);
  return dir;
}

async function setupAppKeyProfile(configDir: string) {
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
          boundAppId: '68ad85a7463006c963799a11',
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
  fetchFn
}: {
  argv: string[];
  configDir: string;
  isTTY?: boolean;
  fetchFn?: CliFetchFn;
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
    stdout: (line) => stdoutLines.push(line),
    stderr: (line) => stderrLines.push(line)
  });

  return {
    exitCode,
    stdout: stdoutLines.join('\n'),
    stderr: stderrLines.join('\n')
  };
}

describe('Skill CLI Commands integration (cli/src/cli/commands/skill.ts)', () => {
  it('blocks appKey locally for skill create and skill import', async () => {
    const configDir = await makeTempDir();
    await setupAppKeyProfile(configDir);
    let calls = 0;

    const createRes = await execCli({
      configDir,
      argv: ['skill', 'create', '--name', 'My Skill', '--format', 'json'],
      fetchFn: async () => {
        calls += 1;
        return jsonResp(OBJECT_ID_SKILL);
      }
    });
    expect(createRes.exitCode).toBe(3);
    expect(calls).toBe(0);
  });

  it('creates, imports (.zip), lists, and inspects platform skills in text and json formats', async () => {
    const configDir = await makeTempDir();
    const zipFile = join(configDir, 'helper.zip');
    await writeFile(zipFile, Buffer.from([80, 75, 3, 4, 0, 0]));

    const createRes = await execCli({
      configDir,
      argv: [
        'skill',
        'create',
        '--name',
        'Helper Skill',
        '--description',
        'Migration helper',
        '--category',
        'tool,coding',
        '--api-key',
        RAW_KEY,
        '--base-url',
        'https://cloud.fastgpt.cn',
        '--format',
        'text'
      ],
      fetchFn: async () => jsonResp(OBJECT_ID_SKILL)
    });
    expect(createRes.exitCode).toBe(0);
    expect(createRes.stdout).toContain(OBJECT_ID_SKILL);

    const dryImport = await execCli({
      configDir,
      argv: [
        'skill',
        'import',
        zipFile,
        '--name',
        'Imported Helper',
        '--dry-run',
        '--api-key',
        RAW_KEY,
        '--base-url',
        'https://cloud.fastgpt.cn',
        '--format',
        'json'
      ],
      fetchFn: async () => {
        throw new Error('should not fetch in dry-run');
      }
    });
    expect(dryImport.exitCode).toBe(0);
    expect(JSON.parse(dryImport.stdout)).toMatchObject({
      ok: true,
      changed: false,
      data: { dryRun: true, filename: 'helper.zip', risk: 'write' }
    });

    const realImport = await execCli({
      configDir,
      argv: [
        'skill',
        'import',
        zipFile,
        '--name',
        'Imported Helper',
        '--api-key',
        RAW_KEY,
        '--base-url',
        'https://cloud.fastgpt.cn',
        '--format',
        'json'
      ],
      fetchFn: async (input, init) => {
        const reqUrl = input instanceof Request ? input.url : String(input);
        const reqMethod = input instanceof Request ? input.method : init?.method;
        expect(reqUrl).toContain('/core/ai/skill/import');
        expect(reqUrl).toContain('filename=helper.zip');
        expect(reqMethod).toBe('POST');
        return jsonResp(OBJECT_ID_SKILL);
      }
    });
    expect(realImport.exitCode).toBe(0);
    expect(JSON.parse(realImport.stdout)).toMatchObject({
      ok: true,
      changed: true,
      data: { skillId: OBJECT_ID_SKILL, name: 'Imported Helper' }
    });
  });

  it('requires --yes for non-interactive skill delete and maps server errors', async () => {
    const configDir = await makeTempDir();
    let calls = 0;

    const blocked = await execCli({
      configDir,
      argv: [
        'skill',
        'delete',
        OBJECT_ID_SKILL,
        '--api-key',
        RAW_KEY,
        '--base-url',
        'https://cloud.fastgpt.cn',
        '--format',
        'json'
      ],
      fetchFn: async () => {
        calls += 1;
        return jsonResp(null);
      }
    });
    expect(blocked.exitCode).toBe(2);
    expect(calls).toBe(0);

    const notFound = await execCli({
      configDir,
      argv: [
        'skill',
        'get',
        OBJECT_ID_SKILL,
        '--api-key',
        RAW_KEY,
        '--base-url',
        'https://cloud.fastgpt.cn',
        '--format',
        'json'
      ],
      fetchFn: async () =>
        new Response(JSON.stringify({ code: 404, message: 'Skill not found', data: null }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        })
    });
    expect(notFound.exitCode).toBe(4);
    expect(JSON.parse(notFound.stderr).error.code).toBe('API_ERROR');
  });

  it('passes page (not pageNum) on skill list, maps 514 on skill import to exit code 3, and hints skills for misuse', async () => {
    const configDir = await makeTempDir();
    const zipFile = join(configDir, 'helper.zip');
    await writeFile(zipFile, Buffer.from([80, 75, 3, 4, 0, 0]));

    const listRes = await execCli({
      configDir,
      argv: [
        'skill',
        'list',
        '--search',
        'helper',
        '--page',
        '2',
        '--page-size',
        '5',
        '--api-key',
        RAW_KEY,
        '--base-url',
        'https://cloud.fastgpt.cn',
        '--format',
        'json'
      ],
      fetchFn: async (input, init) => {
        const body =
          input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body));
        expect(body.page).toBe(2);
        expect(body.pageNum).toBeUndefined();
        expect(body.parentId).toBeUndefined();
        return jsonResp({ total: 12, list: [{ _id: OBJECT_ID_SKILL, name: 'helper' }] });
      }
    });
    expect(listRes.exitCode).toBe(0);
    expect(JSON.parse(listRes.stdout).meta).toMatchObject({
      page: 2,
      pageSize: 5,
      total: 12,
      hasMore: true
    });

    const authFailImport = await execCli({
      configDir,
      argv: [
        'skill',
        'import',
        zipFile,
        '--api-key',
        RAW_KEY,
        '--base-url',
        'https://cloud.fastgpt.cn',
        '--format',
        'json'
      ],
      fetchFn: async () =>
        new Response(
          JSON.stringify({ code: 514, statusText: 'unAuthApiKey', message: 'Invalid API key' }),
          { status: 500, headers: { 'content-type': 'application/json' } }
        )
    });
    expect(authFailImport.exitCode).toBe(3);
    expect(JSON.parse(authFailImport.stderr).error.code).toBe('AUTH_INVALID');

    const misuseRes = await execCli({
      configDir,
      argv: ['skill', 'install', 'fastgpt', '--format', 'json']
    });
    expect(misuseRes.exitCode).toBe(2);
    expect(JSON.parse(misuseRes.stderr).error.hint).toContain('fastgpt skills install');

    const updateRes = await execCli({
      configDir,
      argv: [
        'skill',
        'update',
        OBJECT_ID_SKILL,
        '--avatar',
        '/api/system/img/avatar/team/file/skill.png',
        '--api-key',
        RAW_KEY,
        '--base-url',
        'https://cloud.fastgpt.cn',
        '--format',
        'json'
      ],
      fetchFn: async (input, init) => {
        const req = input instanceof Request ? input : new Request(input, init);
        expect(req.method).toBe('POST');
        expect(req.url).toContain('/core/ai/skill/update');
        expect(await req.clone().json()).toEqual({
          skillId: OBJECT_ID_SKILL,
          avatar: '/api/system/img/avatar/team/file/skill.png'
        });
        return jsonResp(null);
      }
    });
    expect(updateRes.exitCode).toBe(0);
    expect(JSON.parse(updateRes.stdout)).toMatchObject({
      ok: true,
      changed: true,
      data: { updated: true, skillId: OBJECT_ID_SKILL }
    });

    const folderId = '68ad85a7463006c963799a22';
    const createFolderRes = await execCli({
      configDir,
      argv: [
        'skill',
        'folder',
        'create',
        '--name',
        'Coze Skills',
        '--description',
        'Migrated',
        '--api-key',
        RAW_KEY,
        '--base-url',
        'https://cloud.fastgpt.cn',
        '--format',
        'json'
      ],
      fetchFn: async (input, init) => {
        const req = input instanceof Request ? input : new Request(input, init);
        expect(req.url).toContain('/core/ai/skill/folder/create');
        return jsonResp({ folderId });
      }
    });
    expect(createFolderRes.exitCode).toBe(0);
    expect(JSON.parse(createFolderRes.stdout).data).toMatchObject({
      folderId,
      name: 'Coze Skills'
    });

    const delFolderNoYes = await execCli({
      configDir,
      argv: [
        'skill',
        'folder',
        'delete',
        folderId,
        '--api-key',
        RAW_KEY,
        '--base-url',
        'https://cloud.fastgpt.cn',
        '--format',
        'json'
      ],
      fetchFn: async () => jsonResp(null)
    });
    expect(delFolderNoYes.exitCode).toBe(2);
  });
});
