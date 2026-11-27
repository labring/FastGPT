import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-feedback-'));
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

async function exec({
  args,
  fetchFn = vi.fn(),
  dir,
  auth = ['--token', 'test-session'],
  format = 'json'
}: {
  args: string[];
  fetchFn?: CliFetchFn;
  dir?: string;
  auth?: string[];
  format?: 'text' | 'json';
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
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line)
  });
  return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

describe('chat feedback CLI commands', () => {
  it('registers chat feedback update with exact metadata and group description', async () => {
    const spec = getCliCommandSpecs().find(
      (item) => item.path.join(' ') === 'chat feedback update'
    );
    expect(spec).toBeDefined();
    expect(spec?.risk).toBe('write');
    expect(spec?.authModes).toEqual(['token', 'personalKey', 'appKey']);
    expect(spec?.examples?.length).toBeGreaterThan(0);

    const helpRes = await exec({ args: ['chat', 'feedback', '--help'], auth: [] });
    expect(helpRes.exitCode).toBe(0);
    expect(helpRes.stdout).toContain('Manage user feedback on App conversation messages');
  });

  it('sends --good, --bad, and --clear payloads to updateUserFeedback', async () => {
    const sentBodies: Record<string, unknown>[] = [];
    const fetchFn = vi.fn<CliFetchFn>(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      expect(new URL(request.url).pathname).toBe('/api/core/chat/feedback/updateUserFeedback');
      expect(request.method).toBe('POST');
      sentBodies.push((await request.json()) as Record<string, unknown>);
      return jsonResponse(null);
    });

    const goodRes = await exec({
      args: [
        'chat',
        'feedback',
        'update',
        '--appId',
        APP_ID,
        '--chatId',
        'chat-1',
        '--dataId',
        'data-1',
        '--good',
        'Helpful answer'
      ],
      fetchFn
    });
    expect(goodRes.exitCode, goodRes.stderr).toBe(0);
    expect(JSON.parse(goodRes.stdout)).toMatchObject({
      ok: true,
      command: 'chat feedback update',
      changed: true,
      data: null
    });

    const badRes = await exec({
      args: [
        'chat',
        'feedback',
        'update',
        '--appId',
        APP_ID,
        '--chatId',
        'chat-1',
        '--dataId',
        'data-1',
        '--bad',
        'Wrong step'
      ],
      fetchFn
    });
    expect(badRes.exitCode, badRes.stderr).toBe(0);

    const clearRes = await exec({
      args: [
        'chat',
        'feedback',
        'update',
        '--appId',
        APP_ID,
        '--chatId',
        'chat-1',
        '--dataId',
        'data-1',
        '--clear'
      ],
      format: 'text',
      fetchFn
    });
    expect(clearRes.exitCode, clearRes.stderr).toBe(0);
    expect(clearRes.stdout).toContain('Cleared user feedback.');

    expect(sentBodies[0]).toEqual({
      appId: APP_ID,
      chatId: 'chat-1',
      dataId: 'data-1',
      userGoodFeedback: 'Helpful answer'
    });
    expect(sentBodies[1]).toEqual({
      appId: APP_ID,
      chatId: 'chat-1',
      dataId: 'data-1',
      userBadFeedback: 'Wrong step'
    });
    expect(sentBodies[2]).toEqual({
      appId: APP_ID,
      chatId: 'chat-1',
      dataId: 'data-1'
    });
    expect(sentBodies[2]).not.toHaveProperty('userGoodFeedback');
    expect(sentBodies[2]).not.toHaveProperty('userBadFeedback');
  });

  it('supports --dry-run preview with redacted secrets and zero HTTP calls', async () => {
    const fetchFn = vi.fn();
    const res = await exec({
      args: [
        'chat',
        'feedback',
        'update',
        '--appId',
        APP_ID,
        '--chatId',
        'chat-1',
        '--dataId',
        'data-1',
        '--good',
        'Bearer fastgpt-secret-key-12345678901234567890',
        '--authProxy',
        '{"username":"alice"}',
        '--dry-run'
      ],
      auth: ['--api-key', 'fastgpt-personal-key-12345678901234567890'],
      fetchFn
    });

    expect(res.exitCode, res.stderr).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed).toMatchObject({
      changed: false,
      data: {
        dryRun: true,
        operation: 'chat feedback update',
        risk: 'write',
        method: 'POST',
        path: '/core/chat/feedback/updateUserFeedback'
      }
    });
    expect(res.stdout).not.toContain('fastgpt-secret-key-12345678901234567890');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('allows saved App Key without --appId and rejects mismatched --appId or --authProxy', async () => {
    const dir = await makeDir();
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({
        schemaVersion: 1,
        currentProfile: 'default',
        profiles: {
          default: {
            baseUrl: 'https://cloud.fastgpt.cn/api',
            authType: 'apikey',
            apiKeyType: 'app',
            boundAppId: APP_ID,
            updatedAt: Date.now()
          }
        }
      })
    );
    await writeFile(
      join(dir, 'credentials.json'),
      JSON.stringify({ default: 'fastgpt-app-key-123456789012345678' }),
      { mode: 0o600 }
    );

    const fetchFn = vi.fn<CliFetchFn>(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      expect(await request.json()).toEqual({
        chatId: 'chat-1',
        dataId: 'data-1',
        customUid: 'end-user-1',
        userGoodFeedback: 'Great'
      });
      return jsonResponse(null);
    });

    const okRes = await exec({
      dir,
      auth: [],
      args: [
        'chat',
        'feedback',
        'update',
        '--chatId',
        'chat-1',
        '--dataId',
        'data-1',
        '--customUid',
        'end-user-1',
        '--good',
        'Great'
      ],
      fetchFn
    });
    expect(okRes.exitCode, okRes.stderr).toBe(0);

    const mismatchRes = await exec({
      dir,
      auth: [],
      args: [
        'chat',
        'feedback',
        'update',
        '--appId',
        OTHER_APP_ID,
        '--chatId',
        'chat-1',
        '--dataId',
        'data-1',
        '--good',
        'Great'
      ],
      fetchFn
    });
    expect(mismatchRes.exitCode).toBe(2);

    const proxyRes = await exec({
      dir,
      auth: [],
      args: [
        'chat',
        'feedback',
        'update',
        '--chatId',
        'chat-1',
        '--dataId',
        'data-1',
        '--authProxy',
        '{"username":"alice"}',
        '--good',
        'Great'
      ],
      fetchFn
    });
    expect(proxyRes.exitCode).toBe(2);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it.each([
    ['chat', 'feedback', 'update', '--appId', APP_ID, '--chatId', 'chat-1', '--dataId', 'data-1'],
    [
      'chat',
      'feedback',
      'update',
      '--appId',
      APP_ID,
      '--chatId',
      'chat-1',
      '--dataId',
      'data-1',
      '--good',
      'ok',
      '--clear'
    ],
    [
      'chat',
      'feedback',
      'update',
      '--appId',
      APP_ID,
      '--chatId',
      'chat-1',
      '--dataId',
      'data-1',
      '--bad',
      'bad',
      '--clear'
    ],
    [
      'chat',
      'feedback',
      'update',
      '--appId',
      APP_ID,
      '--chatId',
      'chat-1',
      '--dataId',
      'data-1',
      '--good',
      'ok',
      '--customUid',
      'u1'
    ],
    [
      'chat',
      'feedback',
      'update',
      '--appId',
      APP_ID,
      '--chatId',
      'chat-1',
      '--dataId',
      'data-1',
      '--good',
      'ok',
      '--authProxy',
      '{"username":"alice"}'
    ],
    [
      'chat',
      'feedback',
      'update',
      '--appId',
      APP_ID,
      '--chatId',
      'chat-1',
      '--dataId',
      'data-1',
      '--good',
      'ok',
      '--authProxy',
      '{bad-json'
    ],
    ['chat', 'feedback', 'update', '--chatId', 'chat-1', '--dataId', 'data-1', '--good', 'ok']
  ])('rejects invalid CLI arguments without HTTP: %j', async (...args) => {
    const fetchFn = vi.fn();
    const res = await exec({ args, fetchFn });
    expect(res.exitCode).toBe(2);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('requires authentication and maps server errors properly', async () => {
    const fetchFn = vi.fn();
    const unauth = await exec({
      args: [
        'chat',
        'feedback',
        'update',
        '--appId',
        APP_ID,
        '--chatId',
        'chat-1',
        '--dataId',
        'data-1',
        '--good',
        'ok'
      ],
      auth: [],
      fetchFn
    });
    expect(unauth.exitCode).toBe(3);
    expect(fetchFn).not.toHaveBeenCalled();

    const forbiddenFn = vi.fn<CliFetchFn>(
      async () =>
        new Response(
          JSON.stringify({ code: 504000, statusText: 'unAuthChat', message: 'Denied' }),
          {
            status: 500,
            headers: { 'content-type': 'application/json' }
          }
        )
    );
    const forbidden = await exec({
      args: [
        'chat',
        'feedback',
        'update',
        '--appId',
        APP_ID,
        '--chatId',
        'chat-1',
        '--dataId',
        'data-1',
        '--good',
        'ok'
      ],
      fetchFn: forbiddenFn
    });
    expect(forbidden.exitCode).toBe(3);
  });
});
