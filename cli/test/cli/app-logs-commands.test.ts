import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCliCommandSpecs } from '../../src/cli/registry';
import { runCli } from '../../src/cli/run';
import type { CliFetchFn } from '../../src/shared/types';

const APP_ID = '68ad85a7463006c963799a05';
const OTHER_APP_ID = '68ad85a7463006c963799a06';
const tempDirs: string[] = [];

async function makeDir() {
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-applogs-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ code: status, data }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

async function seedApiKeyProfile({
  dir,
  apiKeyType,
  boundAppId
}: {
  dir: string;
  apiKeyType: 'personal' | 'app';
  boundAppId?: string;
}) {
  await writeFile(
    join(dir, 'config.json'),
    JSON.stringify({
      schemaVersion: 1,
      currentProfile: 'default',
      profiles: {
        default: {
          baseUrl: 'https://cloud.fastgpt.cn/api',
          authType: 'apikey',
          apiKeyType,
          ...(boundAppId ? { boundAppId } : {}),
          updatedAt: Date.now()
        }
      }
    })
  );
  await writeFile(
    join(dir, 'credentials.json'),
    JSON.stringify({ default: `fastgpt-${apiKeyType}-key-123456789012345678` }),
    { mode: 0o600 }
  );
}

async function exec({
  args,
  fetchFn = vi.fn(),
  dir,
  auth = ['--token', 'test-session'],
  format = 'json',
  readStdin
}: {
  args: string[];
  fetchFn?: CliFetchFn;
  dir?: string;
  auth?: string[];
  format?: 'text' | 'json';
  readStdin?: () => Promise<string>;
}) {
  const configDir = dir ?? (await makeDir());
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCli({
    argv: [...args, ...auth, '--format', format, '--no-color'],
    cwd: configDir,
    env: { FASTGPT_CONFIG_DIR: configDir, FASTGPT_SECRET_STORE: 'file' },
    isTTY: false,
    fetchFn,
    readStdin,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line)
  });
  return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n'), dir: configDir };
}

describe('app logs CLI commands', () => {
  it('registers all 6 app logs commands with verified authModes and examples', async () => {
    const specs = getCliCommandSpecs().filter(
      (spec) => spec.path[0] === 'app' && spec.path[1] === 'logs'
    );
    expect(specs.map((spec) => spec.path.join(' ')).sort()).toEqual([
      'app logs chart',
      'app logs export',
      'app logs list',
      'app logs search',
      'app logs stats',
      'app logs users'
    ]);

    const byName = new Map(specs.map((spec) => [spec.path[2], spec]));
    expect(byName.get('export')?.authModes).toEqual(['token', 'appKey']);
    for (const key of ['search', 'list', 'users', 'stats', 'chart']) {
      expect(byName.get(key)?.authModes).toEqual(['token', 'personalKey', 'appKey']);
    }

    const helpRes = await exec({ args: ['app', 'logs', '--help'], auth: [] });
    expect(helpRes.exitCode).toBe(0);
    expect(helpRes.stdout).toContain('Search, list, analyze, and export App conversation logs');
  });

  it('blocks personalKey on app logs export with exit code 3 before sending HTTP', async () => {
    const dir = await makeDir();
    await seedApiKeyProfile({ dir, apiKeyType: 'personal' });
    const fetchFn = vi.fn();

    const res = await exec({
      dir,
      auth: [],
      args: ['app', 'logs', 'export', APP_ID],
      fetchFn
    });

    expect(res.exitCode).toBe(3);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(JSON.parse(res.stderr).error.code).toBe('AUTH_MODE_UNSUPPORTED');
  });

  it('allows appKey without --app-id and rejects mismatched --app-id with exit code 2', async () => {
    const dir = await makeDir();
    await seedApiKeyProfile({ dir, apiKeyType: 'app', boundAppId: APP_ID });
    const fetchFn = vi.fn<CliFetchFn>(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      if (url.pathname === '/api/core/app/logs/exportLogs') {
        expect(await request.json()).not.toHaveProperty('appId');
        return new Response('\uFEFFchat logs\nrow', {
          status: 200,
          headers: { 'content-type': 'text/csv; charset=utf-8' }
        });
      }
      if (url.pathname === '/api/proApi/core/app/logs/getTotalData') {
        expect(url.searchParams.has('appId')).toBe(false);
        return jsonResponse({
          totalUsers: 1,
          totalChats: 2,
          totalPoints: 3,
          totalInputTokens: 4,
          totalOutputTokens: 5
        });
      }
      expect(await request.json()).not.toHaveProperty('appId');
      return jsonResponse({ list: [], total: 0 });
    });

    for (const sub of ['search', 'list', 'users', 'stats', 'chart', 'export']) {
      const okRes = await exec({ dir, auth: [], args: ['app', 'logs', sub], fetchFn });
      expect(okRes.exitCode, `${sub}: ${okRes.stderr}`).toBe(0);
    }
    expect(fetchFn).toHaveBeenCalledTimes(6);

    const mismatchRes = await exec({
      dir,
      auth: [],
      args: ['app', 'logs', 'list', '--app-id', OTHER_APP_ID],
      fetchFn
    });
    expect(mismatchRes.exitCode).toBe(2);
    expect(fetchFn).toHaveBeenCalledTimes(6);
  });

  it('forwards search cursor flags and exposes meta.nextCursor and meta.hasMore', async () => {
    const nextCursor = { timestamp: 1735689600000, id: OTHER_APP_ID };
    const fetchFn = vi.fn<CliFetchFn>(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      expect(new URL(request.url).pathname).toBe('/api/core/app/logs/search');
      expect(await request.json()).toEqual({
        appId: APP_ID,
        dateStart: '2026-11-01T00:00:00.000',
        dateEnd: '2026-11-08T00:00:00.000',
        chatSearch: 'invoice',
        searchType: 'title',
        sources: ['api', 'online'],
        unreadOnly: true,
        cursor: { timestamp: 1735689500000, id: APP_ID }
      });
      return jsonResponse({
        list: [
          { _id: APP_ID, chatId: 'c1', updateTime: '2026-11-02T00:00:00.000Z', source: 'api' }
        ],
        nextCursor
      });
    });

    const res = await exec({
      args: [
        'app',
        'logs',
        'search',
        APP_ID,
        '--date-start',
        '2026-11-01',
        '--date-end',
        '2026-11-08',
        '--chat-search',
        'invoice',
        '--search-type',
        'title',
        '--sources',
        'api,online',
        '--unread-only',
        '--cursor-timestamp',
        '1735689500000',
        '--cursor-id',
        APP_ID
      ],
      fetchFn
    });

    expect(res.exitCode, res.stderr).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.meta).toMatchObject({
      count: 1,
      nextCursor,
      hasMore: true
    });
  });

  it('maps HTTP 404 on stats and chart to a FastGPT Pro error with exit code 4', async () => {
    const fetchFn = vi.fn<CliFetchFn>(
      async () =>
        new Response(JSON.stringify({ code: 404, message: 'Not Found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' }
        })
    );

    const statsRes = await exec({ args: ['app', 'logs', 'stats', APP_ID], fetchFn });
    expect(statsRes.exitCode).toBe(4);
    expect(JSON.parse(statsRes.stderr).error.message).toContain('FastGPT Pro');

    const chartRes = await exec({ args: ['app', 'logs', 'chart', APP_ID], fetchFn });
    expect(chartRes.exitCode).toBe(4);
    expect(JSON.parse(chartRes.stderr).error.message).toContain('FastGPT Pro');
  });

  it('exports CSV to --output with --overwrite guard and supports --file', async () => {
    const dir = await makeDir();
    const outFile = join(dir, 'exported.csv');
    const reqFile = join(dir, 'export-req.json');
    await writeFile(
      reqFile,
      JSON.stringify({
        dateStart: '2026-11-01T00:00:00.000Z',
        dateEnd: '2026-11-05T00:00:00.000Z',
        title: 'custom header',
        logKeys: ['title', 'sessionId']
      })
    );

    const csv = '\uFEFFcustom header\n"hello","c1"';
    const fetchFn = vi.fn<CliFetchFn>(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      expect(new URL(request.url).pathname).toBe('/api/core/app/logs/exportLogs');
      const body = await request.json();
      expect(body).toMatchObject({
        appId: APP_ID,
        dateStart: '2026-11-01T00:00:00.000Z',
        dateEnd: '2026-11-05T00:00:00.000Z',
        title: 'custom header',
        logKeys: ['title', 'sessionId']
      });
      return new Response(csv, {
        status: 200,
        headers: { 'content-type': 'text/csv; charset=utf-8' }
      });
    });

    const firstWrite = await exec({
      dir,
      args: ['app', 'logs', 'export', APP_ID, '--file', reqFile, '--output', 'exported.csv'],
      fetchFn
    });
    expect(firstWrite.exitCode, firstWrite.stderr).toBe(0);
    expect(JSON.parse(firstWrite.stdout).data).toEqual({
      outputPath: outFile,
      bytes: new TextEncoder().encode(csv).byteLength
    });
    expect(await readFile(outFile, 'utf8')).toBe(csv);

    const blockedOverwrite = await exec({
      dir,
      args: ['app', 'logs', 'export', APP_ID, '--file', reqFile, '--output', 'exported.csv'],
      fetchFn
    });
    expect(blockedOverwrite.exitCode).toBe(2);
    expect(fetchFn).toHaveBeenCalledOnce();

    const allowedOverwrite = await exec({
      dir,
      args: [
        'app',
        'logs',
        'export',
        APP_ID,
        '--file',
        reqFile,
        '--output',
        'exported.csv',
        '--overwrite'
      ],
      fetchFn
    });
    expect(allowedOverwrite.exitCode, allowedOverwrite.stderr).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    const inlineFetchFn = vi.fn<CliFetchFn>(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const body = (await request.json()) as Record<string, unknown>;
      expect(body).toMatchObject({
        appId: APP_ID,
        title: 'chat logs',
        sourcesMap: expect.objectContaining({ api: { label: 'api' } }),
        logKeys: expect.arrayContaining(['source', 'title', 'feedback'])
      });
      return new Response(csv, {
        status: 200,
        headers: { 'content-type': 'text/csv; charset=utf-8' }
      });
    });

    const inlineRes = await exec({
      dir,
      format: 'text',
      args: ['app', 'logs', 'export', APP_ID, '--days', '2'],
      fetchFn: inlineFetchFn
    });
    expect(inlineRes.exitCode, inlineRes.stderr).toBe(0);
    expect(inlineRes.stdout).toContain('custom header');
  });

  it.each([
    ['app', 'logs', 'list'],
    ['app', 'logs', 'list', APP_ID, '--app-id', OTHER_APP_ID],
    ['app', 'logs', 'search', APP_ID, '--date-start', '2026-11-01'],
    [
      'app',
      'logs',
      'search',
      APP_ID,
      '--days',
      '7',
      '--date-start',
      '2026-11-01',
      '--date-end',
      '2026-11-02'
    ],
    ['app', 'logs', 'users', APP_ID, '--sources', ''],
    ['app', 'logs', 'chart', APP_ID, '--user-timespan', 'invalid'],
    ['app', 'logs', 'export', APP_ID, '--stdin', '--file', '-']
  ])('rejects invalid CLI arguments without HTTP: %j', async (...args) => {
    const fetchFn = vi.fn();
    const res = await exec({ args, fetchFn, readStdin: async () => '{}' });
    expect(res.exitCode).toBe(2);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
