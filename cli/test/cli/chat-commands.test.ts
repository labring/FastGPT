import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/cli/run';
import { createChatCommandSpecs } from '../../src/cli/commands/chat';
import { createNonTtyPrompter } from '../../src/infra/ui/prompter';
import type { CliFetchFn } from '../../src/shared/types';
import type { Prompter } from '../../src/infra/ui/prompter';

const APP_ID = '68ad85a7463006c963799a05';
const tempDirs: string[] = [];

async function makeDir() {
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-chat-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function response(data: unknown, status = 200) {
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
  format = 'json',
  prompter,
  readStdin
}: {
  args: string[];
  fetchFn?: CliFetchFn;
  dir?: string;
  auth?: string[];
  format?: 'text' | 'json';
  prompter?: Prompter;
  readStdin?: () => Promise<string>;
}) {
  const configDir = dir ?? (await makeDir());
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCli({
    argv: [...args, ...auth, '--format', format, '--no-color'],
    cwd: configDir,
    env: { FASTGPT_CONFIG_DIR: configDir, FASTGPT_SECRET_STORE: 'file' },
    isTTY: prompter?.isInteractive ?? false,
    prompter,
    fetchFn,
    readStdin,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line)
  });
  return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

describe('createChatCommandSpecs', () => {
  it('registers exactly ten App-only commands with discoverable parameters and examples', async () => {
    const specs = createChatCommandSpecs();
    expect(specs).toHaveLength(10);
    expect(
      specs.every(
        (spec) =>
          spec.summary.includes('App') && spec.examples?.length && spec.authModes.includes('appKey')
      )
    ).toBe(true);
    const manifest = await exec({ args: ['commands'], auth: [] });
    expect(manifest.exitCode).toBe(0);
    expect(manifest.stdout).toContain('chat history mark-read');
    for (const spec of specs) {
      expect(
        spec.options.some((option) =>
          ['skillId', 'sourceType', 'shareId', 'outLinkUid'].includes(option.name)
        )
      ).toBe(false);
    }
    expect(
      specs.some((spec) => spec.path.includes('list-cursor') || spec.path.includes('v1'))
    ).toBe(false);
  });

  it.each([
    {
      command: ['run'],
      flags: ['--text', 'Hello', '--detail'],
      path: '/v2/chat/completions',
      method: 'POST',
      payload: { stream: false, messages: [{ role: 'user', content: 'Hello' }], detail: true },
      data: { id: 'chat', choices: [{ message: { content: [{ text: 'answer' }] } }] }
    },
    {
      command: ['stop'],
      flags: ['--chatId', 'chat'],
      path: '/v2/chat/stop',
      method: 'POST',
      payload: { chatId: 'chat' },
      data: { success: true, completed: false }
    },
    {
      command: ['init'],
      flags: ['--chatId', 'chat'],
      path: '/core/chat/init',
      method: 'GET',
      payload: { chatId: 'chat' },
      data: { title: 'App title', variables: {} }
    },
    {
      command: ['history', 'list'],
      flags: [
        '--pageNum',
        '2',
        '--pageSize',
        '10',
        '--source',
        'api',
        '--startCreateTime',
        '2026-11-01',
        '--endCreateTime',
        '2026-11-11',
        '--startUpdateTime',
        '2026-11-02',
        '--endUpdateTime',
        '2026-11-12'
      ],
      path: '/core/chat/history/getHistories',
      method: 'POST',
      payload: {
        pageNum: 2,
        pageSize: 10,
        source: 'api',
        startCreateTime: '2026-11-01',
        endCreateTime: '2026-11-11',
        startUpdateTime: '2026-11-02',
        endUpdateTime: '2026-11-12'
      },
      data: { list: [], total: 0 }
    },
    {
      command: ['history', 'status'],
      flags: ['--chatIds', ' chat-1,chat-2 '],
      path: '/core/chat/history/getHistoryStatus',
      method: 'POST',
      payload: { chatIds: ['chat-1', 'chat-2'] },
      data: { list: [{ chatId: 'chat-1', hasBeenRead: false }] }
    },
    {
      command: ['history', 'mark-read'],
      flags: ['--chatId', 'chat'],
      path: '/core/chat/history/markRead',
      method: 'POST',
      payload: { chatId: 'chat' },
      data: null
    },
    {
      command: ['history', 'update'],
      flags: ['--chatId', 'chat', '--top', 'false', '--customTitle', '', '--title', 'new'],
      path: '/core/chat/history/updateHistory',
      method: 'PUT',
      payload: { chatId: 'chat', top: false, customTitle: '', title: 'new' },
      data: null
    },
    {
      command: ['history', 'delete'],
      flags: ['--chatId', 'chat /?&', '--yes'],
      path: '/core/chat/history/delHistory',
      method: 'DELETE',
      payload: { chatId: 'chat /?&' },
      data: null
    },
    {
      command: ['record', 'list'],
      flags: [
        '--chatId',
        'chat',
        '--pageSize',
        '2',
        '--prevId',
        'oldest-id',
        '--loadCustomFeedbacks',
        '--includeDeleted'
      ],
      path: '/core/chat/record/getRecords_v2',
      method: 'POST',
      payload: {
        chatId: 'chat',
        pageSize: 2,
        prevId: 'oldest-id',
        includeDeleted: true,
        loadCustomFeedbacks: true
      },
      data: {
        list: [
          { dataId: 'first', obj: 'Human' },
          { dataId: 'last', obj: 'AI' }
        ],
        total: 20,
        hasMorePrev: true,
        hasMoreNext: false,
        prevCursor: 'first',
        nextCursor: null
      }
    },
    {
      command: ['record', 'detail'],
      flags: ['--chatId', 'chat', '--dataId', 'response-data-id'],
      path: '/core/chat/record/getResData',
      method: 'GET',
      payload: { chatId: 'chat', dataId: 'response-data-id' },
      data: [{ moduleName: 'App answer', runningTime: 1 }]
    }
  ])(
    'maps $command to $method $path and preserves the response',
    async ({ command, flags, method, path, payload, data }) => {
      const fetchFn = vi.fn<CliFetchFn>(async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);
        expect(url.pathname).toBe(`/api${path}`);
        expect(request.method).toBe(method);
        expect(request.headers.get('token')).toBe('test-session');
        const actual =
          method === 'GET' || method === 'DELETE'
            ? Object.fromEntries(url.searchParams)
            : await request.json();
        expect(actual).toMatchObject({ appId: APP_ID, ...payload });
        expect(actual).not.toHaveProperty('sourceType');
        expect(actual).not.toHaveProperty('sourceId');
        return command[0] === 'run'
          ? new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
          : response(data);
      });
      const result = await exec({
        args: ['chat', ...command, '--appId', APP_ID, ...flags],
        fetchFn
      });
      expect(result.stderr).toBe('');
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ data });
      expect(fetchFn).toHaveBeenCalledOnce();
    }
  );

  it('renders a text response and encodes Query proxy identity exactly once', async () => {
    const result = await exec({
      args: [
        'chat',
        'init',
        '--appId',
        APP_ID,
        '--chatId',
        'id?&/',
        '--authProxy',
        '{"username":"alice"}'
      ],
      auth: ['--api-key', 'fastgpt-personal-key-123456789012345678'],
      format: 'text',
      fetchFn: async (input) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        expect(url.searchParams.get('chatId')).toBe('id?&/');
        expect(JSON.parse(url.searchParams.get('authProxy')!)).toEqual({ username: 'alice' });
        return response({ title: 'App title', chatId: 'id?&/' });
      }
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('App title');
  });

  it('loads a JSON request file relative to cwd and maps all generation flags', async () => {
    const dir = await makeDir();
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe it' },
          { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }
        ]
      }
    ];
    await writeFile(join(dir, 'request.json'), JSON.stringify({ messages }));
    const result = await exec({
      dir,
      args: [
        'chat',
        'run',
        '--appId',
        APP_ID,
        '--file',
        'request.json',
        '--chatId',
        'existing',
        '--variables',
        '{"count":0}',
        '--metadata',
        '{"tag":"sample"}',
        '--responseChatItemId',
        'answer-id',
        '--retainDatasetCite',
        '--showSkillReferences',
        '--customUid',
        'visitor',
        '--timeoutMs',
        '600000'
      ],
      auth: ['--api-key', 'fastgpt-raw-key-123456789012345678'],
      fetchFn: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        expect(request.headers.get('authorization')).toBe(
          'Bearer fastgpt-raw-key-123456789012345678'
        );
        expect(await request.json()).toEqual({
          appId: APP_ID,
          chatId: 'existing',
          messages,
          variables: { count: 0 },
          metadata: { tag: 'sample' },
          responseChatItemId: 'answer-id',
          customUid: 'visitor',
          retainDatasetCite: true,
          showSkillReferences: true,
          detail: false,
          stream: false
        });
        return response({ id: 'existing', choices: [] });
      }
    });
    expect(result.exitCode, result.stderr).toBe(0);
  });

  it.each([{ flags: ['--stdin'] }, { flags: ['--file', '-'] }])(
    'reads generation input through %j and previews without HTTP',
    async ({ flags }) => {
      const fetchFn = vi.fn();
      const result = await exec({
        args: ['chat', 'run', ...flags, '--dry-run'],
        readStdin: async () =>
          JSON.stringify({
            appId: APP_ID,
            messages: [{ role: 'user', content: 'Hello' }],
            metadata: { password: 'secret-value' }
          }),
        fetchFn
      });
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        changed: false,
        data: { dryRun: true, body: { stream: false } }
      });
      expect(result.stdout).not.toContain('secret-value');
      expect(fetchFn).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['chat', 'run', '--appId', APP_ID, '--text', 'hello', '--messages', '[]'],
    ['chat', 'run', '--appId', APP_ID, '--variables', '{bad-json'],
    ['chat', 'run', '--appId', APP_ID, '--metadata', '[]'],
    ['chat', 'run', '--stdin', '--file', '-'],
    ['chat', 'run', '--file', 'does-not-exist.json'],
    ['chat', 'run', '--stdin'],
    ['chat', 'init', '--chatId', 'chat'],
    ['chat', 'record', 'list', '--appId', APP_ID],
    ['chat', 'history', 'update', '--appId', APP_ID, '--chatId', 'chat', '--top', 'nonsense'],
    ['chat', 'history', 'status', '--appId', APP_ID, '--chatIds', 'a,,b'],
    ['chat', 'history', 'delete', '--appId', APP_ID, '--chatId', 'chat'],
    ['chat', 'record', 'list-cursor']
  ])('rejects invalid command arguments without HTTP: %j', async (...args) => {
    const fetchFn = vi.fn();
    const result = await exec({ args, fetchFn, readStdin: async () => 'not-json' });
    expect(result.exitCode).toBe(2);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    { appId: APP_ID, skillId: APP_ID },
    { appId: APP_ID, sourceType: 'chatAgentHelper' },
    { appId: APP_ID, outLinkAuthData: { shareId: 's', outLinkUid: 'u' } },
    { appId: APP_ID, stream: true },
    [],
    null
  ])('rejects unsupported JSON request targets and shapes: %j', async (input) => {
    const fetchFn = vi.fn();
    const result = await exec({
      args: ['chat', 'run', '--stdin'],
      readStdin: async () => JSON.stringify(input),
      fetchFn
    });
    expect(result.exitCode).toBe(2);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects ambiguous duplicate fields across file input and flags', async () => {
    const result = await exec({
      args: ['chat', 'run', '--stdin', '--appId', APP_ID],
      readStdin: async () => JSON.stringify({ appId: APP_ID })
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('not both');
  });

  it('uses saved App Key bindings for all commands and rejects an explicit different target locally', async () => {
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
    const fetchFn = vi.fn<CliFetchFn>(async () => response({ list: [], total: 0 }));
    const result = await exec({ dir, auth: [], args: ['chat', 'history', 'list'], fetchFn });
    expect(result.exitCode, result.stderr).toBe(0);
    const rejected = await exec({
      dir,
      auth: [],
      args: ['chat', 'history', 'list', '--appId', '68ad85a7463006c963799a06'],
      fetchFn
    });
    expect(rejected.exitCode).toBe(2);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('requires login before any request', async () => {
    const fetchFn = vi.fn();
    const result = await exec({
      args: ['chat', 'history', 'list', '--appId', APP_ID],
      auth: [],
      fetchFn
    });
    expect(result.exitCode).toBe(3);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([false, true])('honors interactive deletion confirmation %s', async (confirmed) => {
    const confirm = vi.fn().mockResolvedValue(confirmed);
    const prompter = { ...createNonTtyPrompter(), isInteractive: true, confirm };
    const fetchFn = vi.fn<CliFetchFn>(async () => response(null));
    const result = await exec({
      args: ['chat', 'history', 'delete', '--appId', APP_ID, '--chatId', 'chat'],
      format: 'text',
      prompter,
      fetchFn
    });
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining(APP_ID), initialValue: false })
    );
    expect(result.exitCode).toBe(confirmed ? 0 : 2);
    expect(fetchFn).toHaveBeenCalledTimes(confirmed ? 1 : 0);
  });

  it('allows deletion dry-run without confirmation or HTTP', async () => {
    const fetchFn = vi.fn();
    const result = await exec({
      args: ['chat', 'history', 'delete', '--appId', APP_ID, '--chatId', 'chat', '--dry-run'],
      fetchFn
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      changed: false,
      data: { method: 'DELETE', query: { appId: APP_ID, chatId: 'chat' } }
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    { status: 404, code: 404, exitCode: 4 },
    { status: 500, code: 514, exitCode: 3 },
    { status: 500, code: 504000, exitCode: 3 },
    { status: 409, code: 409, exitCode: 4 }
  ])(
    'maps HTTP $status / business $code without retrying generation',
    async ({ status, code, exitCode }) => {
      const fetchFn = vi.fn<CliFetchFn>(
        async () =>
          new Response(JSON.stringify({ code, message: 'App request rejected' }), {
            status,
            headers: { 'content-type': 'application/json' }
          })
      );
      const result = await exec({
        args: ['chat', 'run', '--appId', APP_ID, '--text', 'hello'],
        fetchFn
      });
      expect(result.exitCode).toBe(exitCode);
      expect(fetchFn).toHaveBeenCalledOnce();
    }
  );

  it('maps a network failure without retrying generation', async () => {
    const fetchFn = vi.fn<CliFetchFn>().mockRejectedValue(new Error('Connection refused'));
    const result = await exec({
      args: ['chat', 'run', '--appId', APP_ID, '--text', 'hello'],
      fetchFn
    });
    expect(result.exitCode).toBe(5);
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
