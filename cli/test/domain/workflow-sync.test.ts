import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { formatModels } from '@fastgpt/global/common/workflow/model';
import type { WorkflowTemplateBasicType } from '@fastgpt/global/core/workflow/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowDebugBodySchema } from '@fastgpt/global/openapi/core/workflow/api';
import { getWorkflowChecksum } from '@fastgpt/workflow-core/domain/checksum';
import { decompileStoreWorkflow } from '@fastgpt/workflow-core/store/decompile';
import {
  WORKFLOW_SYNC_FILE_NAME,
  type WorkflowSyncState
} from '../../src/domain/workflow/workflow-workspace';

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

/** 运行真实同步服务，仅模拟远端保存、模型归一化和其他成员的并发写入。 */
async function createSyncedServices() {
  const dir = await makeDir();
  const seed = createServices(dir, vi.fn());
  await seed.local.init({ dir, locale: 'en', name: 'Remote App' });
  await seed.local.nodeAdd({
    dir,
    locale: 'en',
    nodeId: 'chat',
    template: 'builtin:ai-chat',
    after: 'start@next'
  });
  const built = await seed.local.build({ dir, output: join(dir, 'seed.json') });
  const remote = {
    workflow: (built.data as { workflow: WorkflowTemplateBasicType }).workflow,
    includeReceipt: true,
    normalizeOnSave: false,
    overwriteAfterReceipt: false,
    detailReadCount: 0,
    saveCount: 0
  };
  const debugRequests: ReturnType<typeof WorkflowDebugBodySchema.parse>[] = [];
  const fetchFn: CliFetchFn = vi.fn(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === '/api/core/workflow/debug') {
      debugRequests.push(WorkflowDebugBodySchema.parse(await request.json()));
      return jsonResponse({
        memoryEdges: [],
        memoryNodes: [],
        entryNodeIds: ['start'],
        nodeResponses: { chat: { nodeId: 'chat', type: 'run' } },
        newVariables: {},
        usageId: 'usage_123'
      });
    }
    if (path === '/api/core/app/detail') {
      remote.detailReadCount += 1;
      return jsonResponse({
        _id: APP_ID,
        name: 'Remote App',
        intro: '',
        ...remote.workflow,
        permission: { hasWritePer: true }
      });
    }
    if (path === '/api/core/app/version/publish') {
      const body = (await request.json()) as WorkflowTemplateBasicType & {
        returnWorkflow?: boolean;
      };
      expect(body.returnWorkflow).toBe(true);
      remote.saveCount += 1;
      const saved = structuredClone({
        nodes: body.nodes,
        edges: body.edges,
        chatConfig: body.chatConfig ?? {},
        referenceSnapshots: body.referenceSnapshots
      });
      if (remote.normalizeOnSave) {
        formatModels({
          ...saved,
          models: [{ modelId: 'system-llm', model: 'mock-llm', type: ModelTypeEnum.llm }],
          defaultModelIds: { [ModelTypeEnum.llm]: 'system-llm' },
          modelReferencePolicy: 'preserve'
        });
      }
      remote.workflow = structuredClone(saved);
      if (remote.overwriteAfterReceipt) {
        remote.workflow.chatConfig = { ...saved.chatConfig, welcomeText: 'Concurrent edit' };
      }
      return jsonResponse(remote.includeReceipt ? { workflow: saved } : null);
    }
    throw new Error(`Unexpected endpoint ${path}`);
  });
  const services = createServices(dir, fetchFn);
  await services.sync.pull({
    client: services.client,
    dir,
    locale: 'en',
    appId: APP_ID,
    force: true
  });
  return { dir, ...services, remote, debugRequests };
}

describe('WorkflowSyncService', () => {
  it('compares inherited snapshots by save semantics and still detects an explicit clear', async () => {
    const { dir, client, sync, remote } = await createSyncedServices();
    const snapshot = {
      reference: ['removed', 'result'] as [string, string],
      sourceLabel: 'Removed'
    };
    const prompt = remote.workflow.nodes
      .find(({ nodeId }) => nodeId === 'chat')!
      .inputs.find(({ key }) => key === NodeInputKeyEnum.aiSystemPrompt)!;
    prompt.value = '{{$removed.result$}}';
    remote.workflow.referenceSnapshots = [snapshot];
    await sync.pull({ client, dir, locale: 'en', force: true });

    const file = join(dir, 'workflow.json');
    const local = JSON.parse(await readFile(file, 'utf8'));
    delete local.referenceSnapshots;
    await writeFile(file, JSON.stringify(local));
    expect((await sync.diff({ client, dir })).data).toMatchObject({
      inSync: true,
      summary: { referenceSnapshotsChanged: false }
    });

    await writeFile(file, JSON.stringify({ ...local, referenceSnapshots: [] }));
    expect((await sync.diff({ client, dir })).data).toMatchObject({
      inSync: false,
      summary: { referenceSnapshotsChanged: true }
    });
  });
  it('protects a local explicit snapshot clear while treating absent remote snapshots as empty', async () => {
    const { dir, client, sync, remote } = await createSyncedServices();
    const file = join(dir, 'workflow.json');
    const local = JSON.parse(await readFile(file, 'utf8'));
    expect(local.referenceSnapshots).toBeUndefined();
    remote.workflow.referenceSnapshots = [];
    expect((await sync.diff({ client, dir })).data).toMatchObject({ inSync: true });

    await writeFile(file, JSON.stringify({ ...local, referenceSnapshots: [] }));
    remote.workflow.referenceSnapshots = undefined;
    await expect(sync.pull({ client, dir, locale: 'en' })).rejects.toThrow(
      /Local workflow.json has unpushed modifications/
    );
    await sync.save({ client, dir });
    expect(remote.workflow.referenceSnapshots).toEqual([]);
  });

  it('preserves stale optional references through save, publish and local execution', async () => {
    const { dir, client, local, sync, remote, debugRequests } = await createSyncedServices();
    const snapshots: NonNullable<WorkflowTemplateBasicType['referenceSnapshots']> = [
      { reference: ['deleted', 'output'], sourceLabel: 'Deleted node' }
    ];
    const prompt = remote.workflow.nodes
      .find(({ nodeId }) => nodeId === 'chat')!
      .inputs.find(({ key }) => key === NodeInputKeyEnum.aiSystemPrompt)!;
    const stalePrompt = {
      ...prompt,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.reference,
      required: false,
      value: snapshots[0].reference
    };
    Object.assign(prompt, stalePrompt);
    remote.workflow.referenceSnapshots = snapshots;
    await sync.pull({ client, dir, locale: 'en' });
    await local.configSet({
      dir,
      locale: 'en',
      path: 'welcomeText',
      valueInput: { value: 'Hello' }
    });
    const onDisk = JSON.parse(await readFile(join(dir, 'workflow.json'), 'utf8'));
    expect(onDisk.referenceSnapshots).toEqual(snapshots);

    for (const write of [sync.save, sync.publish]) {
      await write({ client, dir });
      const savedPrompt = remote.workflow.nodes
        .find(({ nodeId }) => nodeId === 'chat')
        ?.inputs.find(({ key }) => key === NodeInputKeyEnum.aiSystemPrompt);
      expect(savedPrompt?.value).toEqual(snapshots[0].reference);
      expect(remote.workflow.referenceSnapshots).toEqual(snapshots);
    }

    await sync.debug({ client, dir, query: 'Hello' });
    await sync.test({ client, dir, query: 'Hello' });
    expect(debugRequests).toHaveLength(2);
    for (const { nodes } of debugRequests) {
      const input = nodes
        .find(({ nodeId }) => nodeId === 'chat')
        ?.inputs.find(({ key }) => key === NodeInputKeyEnum.aiSystemPrompt);
      expect(input).toMatchObject({ value: snapshots[0].reference, debugValueOverride: false });
    }

    remote.workflow.referenceSnapshots = [
      { ...snapshots[0], sourceLabel: 'Concurrent label edit' }
    ];
    const diff = await sync.diff({ client, dir });
    expect(diff.data).toMatchObject({
      inSync: false,
      summary: { referenceSnapshotsChanged: true }
    });
    await expect(sync.save({ client, dir })).rejects.toThrow(/Remote workflow has changed/);
  });

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

  it('executes pull -> local edit -> diff -> save -> publish and detects remote conflicts', async () => {
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

    const pushRes = await sync.save({ client, dir });
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
    await expect(sync.save({ client, dir })).rejects.toBeInstanceOf(CliArgumentError);

    // 带 --force 可强制覆盖
    const forcedPush = await sync.save({ client, dir, force: true });
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

  it('runs debug and evaluates structured App test assertions', async () => {
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

  it('keeps remote sync baseline consistent across metadata edits and unbound init-to-save flows', async () => {
    const seedDir = await makeDir();
    const seedServices = createServices(seedDir, vi.fn());
    await seedServices.local.init({ dir: seedDir, locale: 'en', name: 'Server Name' });
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

    const fetchFn: CliFetchFn = vi.fn(async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
      if (url.includes('/api/core/app/detail')) {
        return jsonResponse({
          _id: APP_ID,
          name: 'Server Name',
          intro: 'Server Intro',
          nodes: remoteStore.nodes,
          edges: remoteStore.edges,
          chatConfig: remoteStore.chatConfig,
          permission: { hasWritePer: true }
        });
      }
      if (url.includes('/api/core/app/version/publish')) {
        const rawBody =
          init?.body !== undefined
            ? String(init.body)
            : input instanceof Request
              ? await input.clone().text()
              : '{}';
        const body = JSON.parse(rawBody || '{}') as {
          nodes: unknown[];
          edges: unknown[];
          chatConfig: unknown;
        };
        remoteStore = {
          nodes: body.nodes,
          edges: body.edges,
          chatConfig: body.chatConfig
        };
        return jsonResponse({ workflow: remoteStore });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    // 场景 1：pull -> meta set -> save -> 修改 welcomeText -> save，不应误报远端冲突
    const pullDir = await makeDir();
    const pullServices = createServices(pullDir, fetchFn);
    await pullServices.sync.pull({
      client: pullServices.client,
      dir: pullDir,
      locale: 'en',
      appId: APP_ID
    });
    await pullServices.local.metaSet({ dir: pullDir, locale: 'en', name: 'Renamed Locally' });
    await pullServices.sync.save({ client: pullServices.client, dir: pullDir });

    await pullServices.local.configSet({
      dir: pullDir,
      locale: 'en',
      path: 'welcomeText',
      valueInput: { value: 'Updated welcome' }
    });
    const secondPush = await pullServices.sync.save({ client: pullServices.client, dir: pullDir });
    expect(secondPush.changed).toBe(true);

    // 场景 2：init -> node add -> save <appId> -> 编辑 -> save <appId>，本地无 appId 时同样不应误报冲突
    const initDir = await makeDir();
    const initServices = createServices(initDir, fetchFn);
    await initServices.local.init({ dir: initDir, locale: 'en', name: 'Local Only Name' });
    await initServices.local.nodeAdd({
      dir: initDir,
      locale: 'en',
      nodeId: 'chat1',
      template: 'builtin:ai-chat',
      after: 'start@next'
    });
    await initServices.sync.save({ client: initServices.client, dir: initDir, appId: APP_ID });
    await initServices.local.configSet({
      dir: initDir,
      locale: 'en',
      path: 'welcomeText',
      valueInput: { value: 'Second edit' }
    });
    const initSecondPush = await initServices.sync.save({
      client: initServices.client,
      dir: initDir,
      appId: APP_ID
    });
    expect(initSecondPush.changed).toBe(true);

    // 若远端确实被他人修改，仍必须触发冲突保护
    remoteStore = {
      ...remoteStore,
      chatConfig: { welcomeText: 'External remote change' }
    };
    await initServices.local.configSet({
      dir: initDir,
      locale: 'en',
      path: 'welcomeText',
      valueInput: { value: 'Conflicting local edit' }
    });
    await expect(
      initServices.sync.save({ client: initServices.client, dir: initDir, appId: APP_ID })
    ).rejects.toBeInstanceOf(CliArgumentError);
  });

  it.each(['save', 'publish'] as const)(
    'migrates legacy sync state after %s while preserving dry-run and conflict protection',
    async (action) => {
      const { dir, local, sync, client, remote } = await createSyncedServices();
      const statePath = join(dir, WORKFLOW_SYNC_FILE_NAME);
      const legacyState = JSON.parse(await readFile(statePath, 'utf8')) as WorkflowSyncState;
      delete legacyState.lastRemoteChecksum;
      await writeFile(statePath, JSON.stringify(legacyState));
      await local.configSet({
        dir,
        locale: 'en',
        path: 'welcomeText',
        valueInput: { value: 'Local edit after upgrade' }
      });

      await sync[action]({ client, dir, dryRun: true });
      expect(remote.saveCount).toBe(0);
      expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual(legacyState);

      await expect(sync[action]({ client, dir })).resolves.toMatchObject({ changed: true });
      const migrated = JSON.parse(await readFile(statePath, 'utf8')) as WorkflowSyncState;
      expect(migrated.lastRemoteChecksum).toBe(
        await getWorkflowChecksum(decompileStoreWorkflow({ workflow: remote.workflow }))
      );
      remote.workflow.chatConfig = { welcomeText: 'Changed by another user' };
      await expect(sync[action]({ client, dir })).rejects.toBeInstanceOf(CliArgumentError);
    }
  );

  it.each(['save', 'publish'] as const)(
    'still rejects a changed remote when a legacy sync state is used for %s',
    async (action) => {
      const { dir, local, sync, client, remote } = await createSyncedServices();
      const statePath = join(dir, WORKFLOW_SYNC_FILE_NAME);
      const legacyState = JSON.parse(await readFile(statePath, 'utf8')) as WorkflowSyncState;
      delete legacyState.lastRemoteChecksum;
      await writeFile(statePath, JSON.stringify(legacyState));
      await local.configSet({
        dir,
        locale: 'en',
        path: 'welcomeText',
        valueInput: { value: 'Unpushed local edit' }
      });
      remote.workflow.chatConfig = { welcomeText: 'Remote edit before upgrading' };

      await expect(sync[action]({ client, dir })).rejects.toBeInstanceOf(CliArgumentError);
      expect(remote.saveCount).toBe(0);
      expect(JSON.parse(await readFile(statePath, 'utf8'))).toEqual(legacyState);
    }
  );

  it.each(['save', 'publish'] as const)(
    'uses normalized save receipts for consecutive %s calls',
    async (action) => {
      const { dir, local, sync, client, remote } = await createSyncedServices();
      remote.normalizeOnSave = true;
      await local.configSet({
        dir,
        locale: 'en',
        path: 'questionGuide',
        valueInput: { valueJson: '{"open":true}' }
      });
      await sync[action]({ client, dir });
      expect(remote.workflow.chatConfig?.questionGuide?.modelId).toBe('system-llm');
      const savedState = JSON.parse(
        await readFile(join(dir, WORKFLOW_SYNC_FILE_NAME), 'utf8')
      ) as WorkflowSyncState;
      expect(savedState.lastRemoteChecksum).toBe(
        await getWorkflowChecksum(decompileStoreWorkflow({ workflow: remote.workflow }))
      );

      await local.configSet({
        dir,
        locale: 'en',
        path: 'welcomeText',
        valueInput: { value: 'Another local edit' }
      });
      await expect(sync[action]({ client, dir })).resolves.toMatchObject({ changed: true });
      expect(remote.saveCount).toBe(2);

      remote.workflow.chatConfig = { welcomeText: 'Another user changed the remote' };
      await expect(sync[action]({ client, dir })).rejects.toBeInstanceOf(CliArgumentError);
    }
  );

  it.each(['save', 'publish'] as const)(
    'supports consecutive %s calls without a receipt when saved content is unchanged',
    async (action) => {
      const { dir, local, sync, client, remote } = await createSyncedServices();
      remote.includeReceipt = false;
      const readsBeforeSave = remote.detailReadCount;
      const saved = await sync[action]({ client, dir });

      expect(saved).toMatchObject({
        changed: true,
        warnings: [expect.stringContaining('did not return a saved workflow snapshot')]
      });
      expect(remote.detailReadCount).toBe(readsBeforeSave + 1);

      await local.configSet({
        dir,
        locale: 'en',
        path: 'welcomeText',
        valueInput: { value: 'Next local edit' }
      });
      await expect(sync[action]({ client, dir })).resolves.toMatchObject({ changed: true });
      expect(remote.saveCount).toBe(2);
      expect(remote.detailReadCount).toBe(readsBeforeSave + 2);
    }
  );

  it.each(['save', 'publish'] as const)(
    'requires an explicit pull after %s is normalized without a save receipt',
    async (action) => {
      const { dir, local, sync, client, remote } = await createSyncedServices();
      remote.includeReceipt = false;
      remote.normalizeOnSave = true;
      await local.configSet({
        dir,
        locale: 'en',
        path: 'questionGuide',
        valueInput: { valueJson: '{"open":true}' }
      });
      const saved = await sync[action]({ client, dir });
      expect(saved.warnings).toEqual([
        expect.stringContaining('did not return a saved workflow snapshot')
      ]);
      expect(remote.workflow.chatConfig?.questionGuide?.modelId).toBe('system-llm');

      const statePath = join(dir, WORKFLOW_SYNC_FILE_NAME);
      const savedStateText = await readFile(statePath, 'utf8');
      const savedState = JSON.parse(savedStateText) as WorkflowSyncState;
      expect(savedState.lastRemoteChecksum).not.toBe(
        await getWorkflowChecksum(decompileStoreWorkflow({ workflow: remote.workflow }))
      );
      await expect(sync[action]({ client, dir })).rejects.toBeInstanceOf(CliArgumentError);
      expect(remote.saveCount).toBe(1);
      expect(await readFile(statePath, 'utf8')).toBe(savedStateText);

      await sync.pull({ client, dir, locale: 'en' });
      await local.configSet({
        dir,
        locale: 'en',
        path: 'welcomeText',
        valueInput: { value: 'Local edit after reviewing normalized content' }
      });
      await expect(sync[action]({ client, dir })).resolves.toMatchObject({ changed: true });
      expect(remote.saveCount).toBe(2);
    }
  );

  it.each([
    { action: 'save' as const, includeReceipt: true },
    { action: 'publish' as const, includeReceipt: true },
    { action: 'save' as const, includeReceipt: false },
    { action: 'publish' as const, includeReceipt: false }
  ])(
    'does not absorb another user save after $action (receipt=$includeReceipt)',
    async ({ action, includeReceipt }) => {
      const { dir, local, sync, client, remote } = await createSyncedServices();
      remote.includeReceipt = includeReceipt;
      remote.overwriteAfterReceipt = true;
      await sync[action]({ client, dir });
      const savedState = JSON.parse(
        await readFile(join(dir, WORKFLOW_SYNC_FILE_NAME), 'utf8')
      ) as WorkflowSyncState;
      expect(savedState.lastRemoteChecksum).not.toBe(
        await getWorkflowChecksum(decompileStoreWorkflow({ workflow: remote.workflow }))
      );

      await local.configSet({
        dir,
        locale: 'en',
        path: 'welcomeText',
        valueInput: { value: 'Local edit after concurrent save' }
      });
      await expect(sync[action]({ client, dir })).rejects.toBeInstanceOf(CliArgumentError);
      expect(remote.saveCount).toBe(1);
      expect(remote.workflow.chatConfig?.welcomeText).toBe('Concurrent edit');
    }
  );

  it('fails app test when array vs plain object types mismatch in either direction or nested', async () => {
    const dir = await makeDir();
    const casesFile = join(dir, 'type-mismatch-cases.json');
    const buildCases = (expectedVariables: Record<string, unknown>) =>
      JSON.stringify({
        appId: APP_ID,
        cases: [{ name: 'mismatch', query: 'hi', expect: { variables: expectedVariables } }]
      });

    let responseVariables: Record<string, unknown> = { payload: {} };
    const fetchFn: CliFetchFn = vi.fn(async (input) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
      if (url.includes('/api/core/workflow/debug')) {
        return jsonResponse({
          memoryEdges: [],
          memoryNodes: [],
          entryNodeIds: ['start'],
          nodeResponses: { start: { nodeId: 'start', type: 'run' } },
          newVariables: responseVariables
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const { local, sync, client } = createServices(dir, fetchFn);
    await local.init({ dir, locale: 'en', name: 'Type Check Flow' });
    await local.nodeAdd({
      dir,
      locale: 'en',
      nodeId: 'chat1',
      template: 'builtin:ai-chat',
      after: 'start@next'
    });

    // actual={}, expected=[]
    await writeFile(casesFile, buildCases({ payload: [] }));
    await expect(sync.test({ client, dir, casesSource: casesFile })).rejects.toBeInstanceOf(
      CliApiError
    );

    // actual=[], expected={}
    responseVariables = { payload: [] };
    await writeFile(casesFile, buildCases({ payload: {} }));
    await expect(sync.test({ client, dir, casesSource: casesFile })).rejects.toBeInstanceOf(
      CliApiError
    );

    // 嵌套结构差异：actual={ nested: {} }, expected={ nested: [] }
    responseVariables = { payload: { nested: {} } };
    await writeFile(casesFile, buildCases({ payload: { nested: [] } }));
    await expect(sync.test({ client, dir, casesSource: casesFile })).rejects.toBeInstanceOf(
      CliApiError
    );
  });
});
