import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowLocalService } from '../../src/domain/workflow/workflow-local-service';
import { createWorkflowSyncService } from '../../src/domain/workflow/workflow-sync-service';
import { createNodeFileIoAdapter } from '../../src/infra/fs/file-io';
import { createFastGptHttpClient } from '../../src/infra/http/fastgpt-http-client';
import { createNonTtyPrompter } from '../../src/infra/ui/prompter';
import { createWorkflowTemplateLoader } from '../../src/infra/workflow/template-loader';
import { CliApiError, CliArgumentError, CliAuthError } from '../../src/shared/errors';
import type { CliFetchFn } from '../../src/shared/types';

const APP_ID = '68ad85a7463006c963799a05';
const VERSION_ID = '68ad85a7463006c963799a09';
const tempDirs: string[] = [];

async function makeDir() {
  const dir = await mkdtemp(join(tmpdir(), 'fastgpt-wf-sync-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ code: 200, statusText: '', message: '', data }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function createServices(dir: string, fetchFn: CliFetchFn) {
  const fileIo = createNodeFileIoAdapter({ cwd: dir });
  const templateLoader = createWorkflowTemplateLoader({ fileIo });
  const local = createWorkflowLocalService({
    fileIo,
    templateLoader,
    env: {},
    prompter: createNonTtyPrompter(),
    readStdin: async () => ''
  });
  const sync = createWorkflowSyncService({
    fileIo,
    templateLoader,
    env: {},
    readStdin: async () => ''
  });
  const baseClient = createFastGptHttpClient({
    baseUrl: 'http://127.0.0.1:3000/api',
    cliVersion: '0.1.0-test',
    fetchFn
  });
  const auth = { authType: 'token' as const, secret: 'token-123' };
  const client = {
    baseUrl: baseClient.baseUrl,
    request: <T = unknown>(params: Parameters<typeof baseClient.request>[0]) =>
      baseClient.request<T>({ ...params, auth }),
    requestRaw: (params: Parameters<typeof baseClient.requestRaw>[0]) =>
      baseClient.requestRaw({ ...params, auth }),
    uploadMultipart: <T = unknown>(params: Parameters<typeof baseClient.uploadMultipart>[0]) =>
      baseClient.uploadMultipart<T>({ ...params, auth }),
    streamSse: (params: Parameters<typeof baseClient.streamSse>[0]) =>
      baseClient.streamSse({ ...params, auth })
  };
  return { local, sync, client };
}

describe('WorkflowSyncService', () => {
  it('rejects pull when user lacks write permission on the App', async () => {
    const dir = await makeDir();
    const fetchFn: CliFetchFn = vi.fn(async () =>
      jsonResponse({
        _id: APP_ID,
        name: 'Readonly App',
        intro: '',
        nodes: [],
        edges: [],
        chatConfig: {},
        permission: { hasWritePer: false }
      })
    );
    const { sync, client } = createServices(dir, fetchFn);
    await expect(sync.pull({ client, dir, locale: 'en', appId: APP_ID })).rejects.toBeInstanceOf(
      CliAuthError
    );
  });

  it('executes pull -> local edit -> diff -> push -> publish and detects remote conflicts', async () => {
    const dir = await makeDir();
    const seedDir = await makeDir();
    const seedServices = createServices(seedDir, vi.fn());
    await seedServices.local.init({ dir: seedDir, locale: 'en', name: 'Remote Flow' });
    await seedServices.local.nodeAdd({
      dir: seedDir,
      locale: 'en',
      nodeId: 'chat0',
      template: 'builtin:ai-chat',
      after: 'start@next'
    });
    const seedBuilt = await seedServices.local.build({
      dir: seedDir,
      output: join(seedDir, 'seed.json')
    });
    let remoteStore = (
      seedBuilt.data as { workflow: { nodes: unknown[]; edges: unknown[]; chatConfig: unknown } }
    ).workflow;
    const publishedCalls: unknown[] = [];

    const fetchFn: CliFetchFn = vi.fn(async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
      if (url.includes('/api/core/app/detail')) {
        return jsonResponse({
          _id: APP_ID,
          name: 'Remote Flow',
          intro: 'Demo',
          nodes: remoteStore.nodes,
          edges: remoteStore.edges,
          chatConfig: remoteStore.chatConfig,
          permission: { hasWritePer: true }
        });
      }
      if (url.includes('/api/core/app/version/detail')) {
        return jsonResponse({
          _id: VERSION_ID,
          appId: APP_ID,
          nodes: remoteStore.nodes,
          edges: remoteStore.edges,
          chatConfig: remoteStore.chatConfig
        });
      }
      if (url.includes('/api/core/app/version/publish')) {
        const rawBody =
          init?.body !== undefined
            ? String(init.body)
            : input instanceof Request
              ? await input.clone().text()
              : '{}';
        const body = JSON.parse(rawBody || '{}');
        publishedCalls.push(body);
        remoteStore = {
          nodes: body.nodes,
          edges: body.edges,
          chatConfig: body.chatConfig
        };
        return jsonResponse(null);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { local, sync, client } = createServices(dir, fetchFn);
    const pullRes = await sync.pull({ client, dir, locale: 'en', appId: APP_ID });
    expect(pullRes.changed).toBe(true);

    const diffBefore = await sync.diff({ client, dir });
    expect((diffBefore.data as { inSync: boolean }).inSync).toBe(true);

    await local.nodeAdd({
      dir,
      locale: 'en',
      nodeId: 'chat1',
      template: 'builtin:ai-chat',
      after: 'start@next'
    });

    // 未 --force 时拉取有未推送改动的本地文件应报错
    await expect(sync.pull({ client, dir, locale: 'en' })).rejects.toBeInstanceOf(CliArgumentError);

    const diffAfter = await sync.diff({ client, dir });
    expect((diffAfter.data as { inSync: boolean }).inSync).toBe(false);
    expect((diffAfter.data as { summary: { addedNodes: number } }).summary.addedNodes).toBe(1);

    const pushRes = await sync.push({ client, dir });
    expect(pushRes.changed).toBe(true);
    expect(publishedCalls[0]).toMatchObject({ isPublish: false, autoSave: true });

    const publishRes = await sync.publish({ client, dir, versionName: 'v1.0.0' });
    expect(publishRes.changed).toBe(true);
    expect(publishedCalls[1]).toMatchObject({ isPublish: true, versionName: 'v1.0.0' });

    // 模拟远端被他人更新，本地再次修改应触发冲突保护
    remoteStore = {
      ...remoteStore,
      chatConfig: { welcomeText: 'Changed remotely' }
    };
    await local.metaSet({ dir, locale: 'en', intro: 'Local edit' });
    await expect(sync.push({ client, dir })).rejects.toBeInstanceOf(CliArgumentError);

    // 带 --force 可强制覆盖
    const forcedPush = await sync.push({ client, dir, force: true });
    expect(forcedPush.changed).toBe(true);

    // 支持拉取指定历史版本
    const pullVersion = await sync.pull({
      client,
      dir,
      locale: 'en',
      appId: APP_ID,
      versionId: VERSION_ID,
      force: true
    });
    expect((pullVersion.data as { versionId: string }).versionId).toBe(VERSION_ID);
  });

  it('runs debug, sandbox-packages, optimize-code SSE, and structured workflow test assertions', async () => {
    const dir = await makeDir();
    const casesFile = join(dir, 'cases.json');
    await writeFile(
      casesFile,
      JSON.stringify({
        appId: APP_ID,
        cases: [
          {
            name: 'greets-user',
            query: 'hi',
            expect: {
              answerContains: ['Hello from FastGPT'],
              nodeExecuted: ['start', 'chat1'],
              nodeSkipped: ['branch2'],
              variables: { ok: true },
              noNodeError: true
            }
          },
          {
            name: 'fails-on-missing-text',
            query: 'fail',
            expect: {
              answerContains: ['MUST_FAIL']
            }
          }
        ]
      })
    );

    const fetchFn: CliFetchFn = vi.fn(async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
      if (url.includes('/api/core/workflow/getSandboxPackages')) {
        return jsonResponse({ js: ['lodash'], python: ['numpy'], builtinGlobals: ['URL'] });
      }
      if (url.includes('/api/core/workflow/optimizeCode')) {
        const ssePayload = [
          'event: answer\ndata: {"choices":[{"delta":{"content":"function main() {"}}]}\n\n',
          'event: answer\ndata: {"choices":[{"delta":{"content":" return {}; }"}}]}\n\n',
          'event: answer\ndata: [DONE]\n\n'
        ].join('');
        return new Response(ssePayload, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' }
        });
      }
      if (url.includes('/api/core/workflow/debug')) {
        return jsonResponse({
          memoryEdges: [],
          memoryNodes: [],
          entryNodeIds: ['start'],
          nodeResponses: {
            start: { nodeId: 'start', type: 'run' },
            chat1: {
              nodeId: 'chat1',
              type: 'run',
              response: { textOutput: 'Hello from FastGPT' }
            },
            branch2: { nodeId: 'branch2', type: 'skip' }
          },
          newVariables: { ok: true },
          usageId: 'usage_123'
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { local, sync, client } = createServices(dir, fetchFn);
    await local.init({ dir, locale: 'en', name: 'Debug Flow' });
    await local.nodeAdd({
      dir,
      locale: 'en',
      nodeId: 'chat1',
      template: 'builtin:ai-chat',
      after: 'start@next'
    });

    const pkgRes = await sync.sandboxPackages({ client });
    expect((pkgRes.data as { js: string[] }).js).toEqual(['lodash']);

    const optRes = await sync.optimizeCode({
      client,
      prompt: 'return empty object',
      modelId: 'gpt-4o-mini'
    });
    expect((optRes.data as { content: string }).content).toBe('function main() { return {}; }');

    const debugRes = await sync.debug({
      client,
      dir,
      appId: APP_ID,
      query: 'hello'
    });
    expect((debugRes.data as { answerText: string }).answerText).toBe('Hello from FastGPT');

    await expect(sync.test({ client, dir, casesSource: casesFile })).rejects.toBeInstanceOf(
      CliApiError
    );

    const smokeRes = await sync.test({
      client,
      dir,
      appId: APP_ID,
      query: 'hello'
    });
    expect(smokeRes.data as { passed: number; failed: number }).toMatchObject({
      passed: 1,
      failed: 0
    });
  });
});
