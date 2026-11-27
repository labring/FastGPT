import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getCliCommandSpecs } from '../../src/cli/registry';
import { runCli } from '../../src/cli/run';
import type { CliFetchFn } from '../../src/shared/types';

const AGENT_ID = '68ad85a7463006c963799a05';
const FOLDER_ID = '68ad85a7463006c963799a06';
const VERSION_ID = '68ad85a7463006c963799a07';
const RAW_PERSONAL_KEY = 'fastgpt-personal-key-1234567890abcdef123456';

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-cli-agent-'));
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
  fetchFn,
  readStdin
}: {
  argv: string[];
  configDir: string;
  fetchFn?: CliFetchFn;
  readStdin?: () => Promise<string>;
}) {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const exitCode = await runCli({
    argv,
    cwd: configDir,
    env: {
      FASTGPT_CONFIG_DIR: configDir,
      FASTGPT_SECRET_STORE: 'file'
    },
    isTTY: false,
    fetchFn,
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

describe('Agent CLI Commands integration', () => {
  it('removes legacy app group completely and provides migration hint on misuse', async () => {
    const specs = getCliCommandSpecs();
    expect(specs.filter((s) => s.path[0] === 'app')).toHaveLength(0);
    expect(specs.filter((s) => s.path[0] === 'agent')).toHaveLength(19);

    const configDir = await makeTempDir();
    const res = await execCli({
      configDir,
      argv: ['app', 'list', '--format', 'json']
    });
    expect(res.exitCode).toBe(2);
    const err = JSON.parse(res.stderr);
    expect(err.error.hint).toContain('fastgpt agent list');
  });

  it('enforces authModes and --yes destructive guard locally without HTTP calls', async () => {
    const configDir = await makeTempDir();
    let calls = 0;

    // agent get is token-only
    const getWithKey = await execCli({
      configDir,
      argv: [
        'agent',
        'get',
        AGENT_ID,
        '--api-key',
        RAW_PERSONAL_KEY,
        '--base-url',
        'https://cloud.fastgpt.cn',
        '--format',
        'json'
      ],
      fetchFn: async () => {
        calls += 1;
        return jsonResp({});
      }
    });
    expect(getWithKey.exitCode).toBe(3);
    expect(calls).toBe(0);

    // agent delete without --yes blocked in JSON mode
    const delNoYes = await execCli({
      configDir,
      argv: [
        'agent',
        'delete',
        AGENT_ID,
        '--token',
        'session-token',
        '--base-url',
        'https://cloud.fastgpt.cn',
        '--format',
        'json'
      ],
      fetchFn: async () => {
        calls += 1;
        return jsonResp([]);
      }
    });
    expect(delNoYes.exitCode).toBe(2);
    expect(calls).toBe(0);
  });

  it('executes agent lifecycle, folder, version, and logs CLI flows end-to-end', async () => {
    const configDir = await makeTempDir();
    const storeFile = join(configDir, 'store-workflow.json');
    await writeFile(storeFile, JSON.stringify({ nodes: [], edges: [], chatConfig: {} }));

    const seenRequests: Array<{ method: string; path: string; body?: any }> = [];
    const fetchFn: CliFetchFn = async (input, init) => {
      const req = input instanceof Request ? input : new Request(input, init);
      const url = new URL(req.url);
      const body =
        req.method === 'POST' || req.method === 'PUT'
          ? await req.json().catch(() => undefined)
          : undefined;
      seenRequests.push({ method: req.method, path: url.pathname, body });

      if (url.pathname === '/api/core/app/create') {
        return jsonResp(body?.type === AppTypeEnum.folder ? FOLDER_ID : AGENT_ID);
      }
      if (url.pathname === '/api/core/app/listV2') {
        return jsonResp({ total: 1, list: [{ _id: AGENT_ID, name: 'Bot', type: 'chatAgent' }] });
      }
      if (url.pathname === '/api/core/app/detail') {
        const appId = url.searchParams.get('appId');
        return jsonResp({
          _id: appId,
          type: appId === FOLDER_ID ? AppTypeEnum.folder : AppTypeEnum.workflow,
          name: 'Flow'
        });
      }
      if (url.pathname === '/api/core/app/version/list') {
        return jsonResp({ total: 1, list: [{ _id: VERSION_ID, versionName: 'v1' }] });
      }
      if (url.pathname === '/api/core/app/version/latest') {
        return jsonResp({ versionId: VERSION_ID, versionName: 'v1', nodes: [], edges: [] });
      }
      if (url.pathname === '/api/core/app/version/detail') {
        return jsonResp({ _id: VERSION_ID, appId: AGENT_ID, versionName: 'v1', nodes: [] });
      }
      if (url.pathname === '/api/core/app/logs/search') {
        return jsonResp({
          list: [{ _id: AGENT_ID, chatId: 'c1', title: 'Hi' }],
          nextCursor: { timestamp: 1735689600000, id: AGENT_ID }
        });
      }
      if (url.pathname === '/api/core/app/logs/getUsers') {
        return jsonResp({
          total: 1,
          list: [{ outLinkUid: null, tmbId: 't1', name: 'u', count: 1 }]
        });
      }
      if (url.pathname === '/api/core/app/del') {
        return jsonResp([url.searchParams.get('appId')]);
      }
      return jsonResp(null);
    };

    const auth = [
      '--token',
      'session-token',
      '--base-url',
      'http://localhost:3005',
      '--format',
      'json'
    ];

    // 1. agent create with --file store-workflow.json
    const createRes = await execCli({
      configDir,
      argv: [
        'agent',
        'create',
        '--name',
        'Order Flow',
        '--type',
        'advanced',
        '--file',
        storeFile,
        '--parent-id',
        FOLDER_ID,
        ...auth
      ],
      fetchFn
    });
    expect(createRes.exitCode, createRes.stderr).toBe(0);
    expect(JSON.parse(createRes.stdout).data).toMatchObject({
      agentId: AGENT_ID,
      type: 'advanced',
      parentId: FOLDER_ID
    });

    // 2. agent version list --published & mutual exclusion
    const verListRes = await execCli({
      configDir,
      argv: ['agent', 'version', 'list', AGENT_ID, '--published', ...auth],
      fetchFn
    });
    expect(verListRes.exitCode, verListRes.stderr).toBe(0);

    const verConflictRes = await execCli({
      configDir,
      argv: ['agent', 'version', 'list', AGENT_ID, '--published', '--draft', ...auth],
      fetchFn
    });
    expect(verConflictRes.exitCode).toBe(2);

    // 3. agent version get (latest & specific) + update
    const verLatest = await execCli({
      configDir,
      argv: ['agent', 'version', 'get', AGENT_ID, ...auth],
      fetchFn
    });
    expect(verLatest.exitCode, verLatest.stderr).toBe(0);

    const verSpecific = await execCli({
      configDir,
      argv: ['agent', 'version', 'get', AGENT_ID, VERSION_ID, ...auth],
      fetchFn
    });
    expect(verSpecific.exitCode, verSpecific.stderr).toBe(0);

    const verUpdate = await execCli({
      configDir,
      argv: ['agent', 'version', 'update', AGENT_ID, VERSION_ID, '--name', 'v1.1', ...auth],
      fetchFn
    });
    expect(verUpdate.exitCode, verUpdate.stderr).toBe(0);

    // 4. agent logs list with cursor & filters + users
    const logsList = await execCli({
      configDir,
      argv: [
        'agent',
        'logs',
        'list',
        AGENT_ID,
        '--sources',
        'api,online',
        '--search',
        'Hi',
        '--search-type',
        'title',
        '--feedback-type',
        'good',
        '--unread-only',
        '--error-filter',
        'has_error',
        '--cursor',
        JSON.stringify({ timestamp: 1735689600000, id: AGENT_ID }),
        ...auth
      ],
      fetchFn
    });
    expect(logsList.exitCode, logsList.stderr).toBe(0);
    expect(JSON.parse(logsList.stdout).meta).toMatchObject({ count: 1, hasMore: true });

    const logsUsers = await execCli({
      configDir,
      argv: ['agent', 'logs', 'users', AGENT_ID, '--search', 'u', '--sources', 'online', ...auth],
      fetchFn
    });
    expect(logsUsers.exitCode, logsUsers.stderr).toBe(0);

    // 5. agent folder create / update / delete + agent delete
    const folderCreate = await execCli({
      configDir,
      argv: ['agent', 'folder', 'create', '--name', 'My Agents', ...auth],
      fetchFn
    });
    expect(folderCreate.exitCode, folderCreate.stderr).toBe(0);

    const folderDelete = await execCli({
      configDir,
      argv: ['agent', 'folder', 'delete', FOLDER_ID, '--yes', ...auth],
      fetchFn
    });
    expect(folderDelete.exitCode, folderDelete.stderr).toBe(0);

    const agentDelete = await execCli({
      configDir,
      argv: ['agent', 'delete', AGENT_ID, '--yes', ...auth],
      fetchFn
    });
    expect(agentDelete.exitCode, agentDelete.stderr).toBe(0);
  });

  it('executes agent test via /core/chat/chatTest SSE stream with dry-run, detail, and error handling', async () => {
    const configDir = await makeTempDir();
    const auth = [
      '--token',
      'session-token',
      '--base-url',
      'http://localhost:3005',
      '--format',
      'json'
    ];
    let seenChatTestBody: any;

    const sseFetch: CliFetchFn = async (input, init) => {
      const req = input instanceof Request ? input : new Request(input, init);
      const url = new URL(req.url);
      if (url.pathname === '/api/core/app/detail') {
        return jsonResp({
          _id: AGENT_ID,
          name: 'Draft Agent',
          type: AppTypeEnum.workflow,
          nodes: [],
          edges: [],
          chatConfig: {},
          permission: { hasWritePer: true }
        });
      }
      if (url.pathname === '/api/core/chat/chatTest') {
        seenChatTestBody = await req.json();
        if (seenChatTestBody.chatId === 'err-chat') {
          const errStream = [
            'event: error',
            'data: {"message":"Model quota exceeded","statusText":"quota_error"}',
            '',
            ''
          ].join('\n');
          return new Response(errStream, {
            status: 200,
            headers: { 'content-type': 'text/event-stream' }
          });
        }
        const sseBody = [
          'event: answer',
          'data: {"choices":[{"delta":{"reasoning_content":"think..."}}]}',
          '',
          'event: answer',
          'data: {"choices":[{"delta":{"content":"Hello "}}]}',
          '',
          'event: fastAnswer',
          'data: {"choices":[{"delta":{"content":"World!"}}]}',
          '',
          'event: flowNodeResponse',
          'data: {"nodeId":"reply1","moduleName":"Assigned Reply","runningTime":0.02}',
          '',
          'event: updateVariables',
          'data: {"step":2}',
          '',
          'event: workflowDuration',
          'data: {"durationSeconds":0.15}',
          '',
          'event: answer',
          'data: [DONE]',
          '',
          ''
        ].join('\n');
        return new Response(sseBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' }
        });
      }
      return jsonResp(null);
    };

    // Dry-run validates without calling /core/chat/chatTest
    const dryRes = await execCli({
      configDir,
      argv: [
        'agent',
        'test',
        AGENT_ID,
        '--text',
        'Hi draft',
        '--variables',
        '{"apiKey":"super-secret"}',
        '--dry-run',
        ...auth
      ],
      fetchFn: sseFetch
    });
    expect(dryRes.exitCode, dryRes.stderr).toBe(0);
    expect(dryRes.stdout).not.toContain('super-secret');
    expect(JSON.parse(dryRes.stdout).data).toMatchObject({
      dryRun: true,
      operation: 'agent test',
      path: '/core/chat/chatTest',
      source: 'remote'
    });
    expect(seenChatTestBody).toBeUndefined();

    // Live SSE aggregation with --detail
    const liveRes = await execCli({
      configDir,
      argv: [
        'agent',
        'test',
        '--id',
        AGENT_ID,
        '--text',
        'Hi draft',
        '--chat-id',
        'test-chat-1',
        '--detail',
        ...auth
      ],
      fetchFn: sseFetch
    });
    expect(liveRes.exitCode, liveRes.stderr).toBe(0);
    expect(JSON.parse(liveRes.stdout).data).toMatchObject({
      appId: AGENT_ID,
      appName: 'Draft Agent',
      chatId: 'test-chat-1',
      source: 'remote',
      answerText: 'Hello World!',
      reasoningText: 'think...',
      durationSeconds: 0.15,
      newVariables: { step: 2 },
      executedNodeCount: 1,
      nodeResponses: [{ nodeId: 'reply1', moduleName: 'Assigned Reply', runningTime: 0.02 }]
    });

    // SSE error event maps to exit code 4
    const errRes = await execCli({
      configDir,
      argv: ['agent', 'test', AGENT_ID, '--text', 'Hi', '--chat-id', 'err-chat', ...auth],
      fetchFn: sseFetch
    });
    expect(errRes.exitCode).toBe(4);
    expect(JSON.parse(errRes.stderr).error.message).toContain('Model quota exceeded');

    // Conflicting flags blocked locally
    const conflictRes = await execCli({
      configDir,
      argv: ['agent', 'test', AGENT_ID, '--text', 'Hi', '--local', '--remote', ...auth],
      fetchFn: sseFetch
    });
    expect(conflictRes.exitCode).toBe(2);
  });
});
