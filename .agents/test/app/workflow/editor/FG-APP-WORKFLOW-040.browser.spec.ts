import { expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum
} from '../../../../../packages/global/core/workflow/constants';
import { IfElseNode } from '../../../../../packages/global/core/workflow/template/system/ifElse';
import { buildWorkflowGraph, workflowEditor } from './workflow.browser';
import {
  attachJson,
  chooseSave,
  graphSafe,
  isSave,
  openEditor,
  publishPath,
  responseData,
  test,
  waitForSave,
  webHeaders,
  type AppDetail,
  type WorkflowGraph
} from './workflow-persistence.browser';

const id = 'FG-APP-WORKFLOW-040';
const bad = buildWorkflowGraph(
  ['Start', 'A', 'B', 'C'],
  [
    ['Start', 'A'],
    ['A', 'B'],
    ['B', 'C'],
    ['C', 'A']
  ]
);
const good = (() => {
  const graph = buildWorkflowGraph(
    ['Start', 'A', 'Branch', 'C', 'Exit'],
    [
      ['Start', 'A'],
      ['A', 'Branch'],
      ['Branch', 'C'],
      ['Branch', 'Exit'],
      ['C', 'A']
    ]
  );
  const branch = structuredClone(IfElseNode);
  branch.inputs.find((input) => input.key === NodeInputKeyEnum.ifElseList)!.value = [
    {
      branchId: 'continue',
      condition: 'AND',
      list: [
        {
          variable: ['A', NodeOutputKeyEnum.text],
          condition: 'equalTo',
          value: 'continue',
          valueType: 'input'
        }
      ]
    }
  ];
  graph.nodes[2] = { ...graph.nodes[2], ...branch, name: 'Branch' };
  graph.edges[2].sourceHandle = 'Branch-source-continue';
  graph.edges[3].sourceHandle = 'Branch-source-ELSE';
  return graph;
})();

const namedGraph = (name: string): WorkflowGraph => ({
  ...graphSafe,
  nodes: graphSafe.nodes.map((node) => (node.nodeId === 'A' ? { ...node, name } : node))
});
const nodeName = (graph: Pick<WorkflowGraph, 'nodes'>) =>
  graph.nodes.find((node) => node.nodeId === 'A')?.name;
const draftKey = (app: AppDetail) =>
  `fastgpt_workflow_local_draft_v1:${JSON.stringify([app.tmbId, app._id])}`;
const readDraft = (page: Page, app: AppDetail) =>
  page.evaluate((key) => {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  }, draftKey(app));
const draftNotice = (page: Page) =>
  page.getByText('已恢复本地草稿，保存后将同步至云端。', { exact: true });
const preview = (page: Page) =>
  page.getByRole('separator', { name: '调整调试面板宽度', exact: true });
const publishDialog = (page: Page) =>
  page.getByRole('dialog').filter({
    has: page.getByRole('textbox', { name: '版本名称', exact: true }),
    hasText: '保存并发布'
  });
const detail = async (page: Page, appId: string) =>
  responseData<AppDetail>(
    await page.request.get('/api/core/app/detail', { params: { appId }, headers: webHeaders })
  );

const connectTestMongo = () => {
  const uri = process.env.FASTGPT_TEST_MONGODB_URI;
  if (!uri) throw new Error('需要本地 dev Mongo 的 FASTGPT_TEST_MONGODB_URI');
  const { mongo } = createRequire(path.resolve('packages/service/package.json'))('mongoose');
  return { connection: new mongo.MongoClient(uri, { serverSelectionTimeoutMS: 5000 }), mongo };
};

async function manualSave(page: Page, appId: string) {
  const response = waitForSave({ page, appId, autoSave: false });
  await chooseSave(page, '仅保存');
  const saved = await response;
  expect(await responseData(saved)).toBeNull();
  const payload = saved.request().postDataJSON();
  expect(payload.isPublish).not.toBe(true);
  const { nodes, edges, chatConfig, referenceSnapshots } = payload;
  return { nodes, edges, chatConfig, referenceSnapshots };
}

/** 使用用户已触发的离开确认，阻止页面卸载抢先取消当前请求。 */
async function attemptReload(page: Page) {
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.evaluate(() => {
    window.location.reload();
  });
}

test(`[${id}/C10] 退出后收到自动保存回执，清理对应的备份`, async ({ app, page }, info) => {
  const { name } = await responseData<{ name: string }>(
    await page.request.get('/api/core/app/detail', {
      params: { appId: app._id },
      headers: webHeaders
    })
  );
  await openEditor(page, app._id);
  await page.goto('/dashboard/agent');
  await page.getByText(name, { exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/app/detail\\?appId=' + app._id));

  const editedName = 'Leave with a pending save response';
  await workflowEditor(page, info).importGraph(namedGraph(editedName));

  let releaseResponse!: () => void;
  const responseReady = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route(
    (url) => isSave(url, app._id),
    async (route) => {
      const response = await route.fetch();
      await responseReady;
      await route.fulfill({ response });
    },
    { times: 1 }
  );
  const auto = waitForSave({ page, appId: app._id, autoSave: true });
  try {
    await attemptReload(page);
    await expect.poll(async () => nodeName(await detail(page, app._id))).toBe(editedName);
    expect(nodeName((await readDraft(page, app)).data)).toBe(editedName);
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\/agent/);
    await expect(page.locator('.react-flow')).toHaveCount(0);
  } finally {
    releaseResponse();
  }

  expect(await responseData(await auto)).toBeNull();
  await expect.poll(() => readDraft(page, app)).toBeNull();
  const saved = await detail(page, app._id);
  expect(nodeName(saved)).toBe(editedName);
  expect(saved.publishedVersionId).toEqual(app.publishedVersionId);
  await attachJson({
    testInfo: info,
    name: 'leave-save-receipt',
    data: {
      backup: await readDraft(page, app),
      persisted: nodeName(saved),
      publishedVersionId: saved.publishedVersionId
    }
  });
});

test(`[${id}/C1] 串行回环阻断运行与发布`, async ({ app, page }, info) => {
  await openEditor(page, app._id);
  const editor = workflowEditor(page, info);
  await editor.importGraph(bad);
  const checkFailed = page.getByText('工作流校验失败，请检查是否缺失、缺值，连线是否正常', {
    exact: true
  });
  const warnings = () =>
    checkFailed.evaluateAll((titles) =>
      titles.map((title) => ({
        id: title.id,
        description: title.parentElement?.textContent
      }))
    );
  const messages = [];
  for (const action of [
    () => page.getByRole('button', { name: '运行', exact: true }).click(),
    () => chooseSave(page, '保存并发布')
  ]) {
    const old = new Set((await warnings()).map(({ id }) => id));
    const fresh = async () => (await warnings()).find(({ id }) => id && !old.has(id));
    await action();
    // 两次操作各自产生新诊断，旧 Toast 仍停留时也不会误把它当作第二次结果。
    await expect.poll(async () => (await fresh())?.description).toMatch(/连线会形成纯串行回环/);
    messages.push(await fresh());
    await expect(preview(page)).not.toBeInViewport();
    await expect(publishDialog(page)).toBeHidden();
  }
  const exported = await editor.exportGraph();
  expect(editor.tupleSet(exported)).toEqual(editor.tupleSet(bad));
  await attachJson({
    testInfo: info,
    name: 'run-publish-guards',
    data: { messages, edges: exported.edges }
  });
});

test(`[${id}/C2] 回环图能够仅保存`, async ({ app, page }, info) => {
  await openEditor(page, app._id);
  const editor = workflowEditor(page, info);
  await editor.importGraph(bad);
  const payload = await manualSave(page, app._id);
  const saved = await detail(page, app._id);
  expect(editor.tupleSet(saved)).toEqual(editor.tupleSet(bad));
  expect(saved.publishedVersionId).toEqual(app.publishedVersionId);
  await expect(page.getByText(/保存成功！/).first()).toBeVisible();
  await attachJson({
    testInfo: info,
    name: 'manual-draft-response',
    data: {
      http: 200,
      code: 200,
      data: null,
      submitted: payload.edges,
      publishedVersionId: saved.publishedVersionId,
      persisted: saved.edges
    }
  });
});

test(`[${id}/C3] 刷新恢复图并核对 Mongo`, async ({ app, page }, info) => {
  const { connection, mongo } = connectTestMongo();
  const started = new Date();
  await openEditor(page, app._id);
  const editor = workflowEditor(page, info);
  await editor.importGraph(bad);
  await manualSave(page, app._id);
  await expect(page.getByText(/保存成功！/).first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(bad.nodes.length);
  const restored = await editor.exportGraph();
  expect(editor.tupleSet(restored)).toEqual(editor.tupleSet(bad));

  try {
    await connection.connect();
    const db = connection.db();
    const appId = new mongo.ObjectId(app._id);
    const version = await db
      .collection('app_versions')
      .findOne(
        { appId, time: { $gte: started }, isAutoSave: { $ne: true } },
        { sort: { time: -1, _id: -1 }, projection: { nodes: 1, edges: 1, isPublish: 1, time: 1 } }
      );
    const stored = await db
      .collection('apps')
      .findOne({ _id: appId }, { projection: { publishedVersionId: 1 } });
    expect(version).not.toBeNull();
    expect(stored).not.toBeNull();
    expect(version?.isPublish).not.toBe(true);
    const persisted = { ...bad, edges: version?.edges, nodes: version?.nodes };
    expect(editor.tupleSet(persisted)).toEqual(editor.tupleSet(bad));
    expect(
      persisted.nodes.map((node: WorkflowGraph['nodes'][number]) => node.nodeId).sort()
    ).toEqual(['A', 'B', 'C', 'Start']);
    expect(stored?.publishedVersionId?.toString()).toEqual(app.publishedVersionId);
    await attachJson({
      testInfo: info,
      name: 'mongo-draft-and-reload',
      data: {
        appId,
        started,
        restored: restored.edges,
        version,
        stored
      }
    });
  } finally {
    await connection.close();
  }
});

test(`[${id}/C11] 旧客户端读回历史图后可以原样保存`, async ({ app, page }, info) => {
  const { connection, mongo } = connectTestMongo();
  const dangling = {
    source: 'Removed',
    sourceHandle: 'Removed-source-right',
    target: 'A',
    targetHandle: 'A-target-left'
  };
  expect(app.publishedVersionId).toMatch(/^[\da-f]{24}$/);
  const version = {
    _id: new mongo.ObjectId(app.publishedVersionId),
    appId: new mongo.ObjectId(app._id),
    isPublish: true
  };
  try {
    await connection.connect();
    const versions = connection.db().collection('app_versions');
    const seed = await versions.updateOne(version, { $push: { edges: dangling } });
    expect(seed.modifiedCount).toBe(1);

    const { nodes, edges, chatConfig } = await detail(page, app._id);
    expect(edges).toEqual(graphSafe.edges);
    const save = (withEdges: typeof edges) =>
      page.request.post(publishPath, {
        params: { appId: app._id },
        headers: webHeaders,
        data: { nodes, edges: withEdges, chatConfig, isPublish: false, autoSave: true }
      });
    expect(await responseData(await save(edges))).toBeNull();
    const saved = await detail(page, app._id);
    expect(saved.edges).toEqual(edges);
    expect(saved.publishedVersionId).toBe(app.publishedVersionId);
    const invalid = await save([...edges, dangling]);
    const rejected = { http: invalid.status(), code: (await invalid.json()).code };
    expect(rejected).toEqual({ http: 400, code: 400 });
    expect((await versions.findOne(version))?.edges).toEqual([...edges, dangling]);
    await attachJson({
      testInfo: info,
      name: 'historical-edge-read-save',
      data: {
        historicalVersionId: app.publishedVersionId,
        dangling,
        edges,
        saved: saved.edges,
        rejected
      }
    });
  } finally {
    await connection.close();
  }
});

test(`[${id}/C4] 条件回流允许预览和发布确认`, async ({ app, page }, info) => {
  await openEditor(page, app._id);
  const editor = workflowEditor(page, info);
  await editor.importGraph(good);
  await page.getByRole('button', { name: '运行', exact: true }).click();
  await expect(preview(page)).toBeInViewport();
  await info.attach('run-preview', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await expect(preview(page)).not.toBeInViewport();
  await chooseSave(page, '保存并发布');
  const dialog = publishDialog(page);
  await expect(dialog).toBeInViewport();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toBeHidden();
  const exported = await editor.exportGraph();
  expect(editor.tupleSet(exported)).toEqual(editor.tupleSet(good));
  expect((await detail(page, app._id)).publishedVersionId).toEqual(app.publishedVersionId);
  await attachJson({
    testInfo: info,
    name: 'cancel-preserved-graph',
    data: {
      edges: exported.edges,
      publishedVersionId: app.publishedVersionId
    }
  });
});

for (const legacy of [false, true]) {
  test(`[${id}/C5] ${legacy ? '旧 JSON' : '当前 JSON'}等价备份不阻断自动保存`, async ({
    app,
    page
  }, info) => {
    await openEditor(page, app._id);
    const data = await manualSave(page, app._id);
    await expect(page.getByText(/保存成功！/).first()).toBeVisible();
    expect(data.referenceSnapshots).toEqual([]);
    if (legacy) delete data.referenceSnapshots;
    await page.evaluate(({ key, draft }) => localStorage.setItem(key, JSON.stringify(draft)), {
      key: draftKey(app),
      draft: {
        version: 1,
        appId: app._id,
        tmbId: app.tmbId,
        savedAt: Date.now(),
        restoreAfterLogin: false,
        data
      }
    });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Expand', exact: true })).toBeVisible();
    await expect.poll(() => readDraft(page, app)).toBeNull();
    await expect(draftNotice(page)).toBeHidden();
    const editor = workflowEditor(page, info);
    expect(nodeName(await editor.exportGraph())).toBe('A');
    await editor.importGraph(namedGraph('Edit after equivalent draft'));
    const auto = waitForSave({ page, appId: app._id, autoSave: true });
    await attemptReload(page);
    await expect
      .poll(async () => nodeName(await detail(page, app._id)))
      .toBe('Edit after equivalent draft');
    expect(await responseData(await auto)).toBeNull();
    const saved = await detail(page, app._id);
    expect(saved.publishedVersionId).toEqual(app.publishedVersionId);
    await attachJson({
      testInfo: info,
      name: 'equivalent-draft-autosave',
      data: {
        legacy,
        exists: false,
        requestName: nodeName((await auto).request().postDataJSON()),
        persisted: nodeName(saved),
        publishedVersionId: saved.publishedVersionId
      }
    });
  });
}

test(`[${id}/C6] 自动保存网络中断后保留草稿及显式恢复`, async ({ app, page, context }, info) => {
  await openEditor(page, app._id);
  const editor = workflowEditor(page, info);
  await editor.importGraph(namedGraph('Offline recoverable edit'));
  const save = (url: URL) => isSave(url, app._id);
  await page.route(save, (route) => route.abort('failed'), { times: 1 });
  const requestFailed = page.waitForEvent('requestfailed', (request) =>
    save(new URL(request.url()))
  );
  await attemptReload(page);
  const failed = await requestFailed;
  const onDisk = await readDraft(page, app);
  expect(failed.postDataJSON().autoSave).toBe(true);
  expect(nodeName(onDisk.data)).toBe('Offline recoverable edit');
  expect(nodeName(await detail(page, app._id))).toBe('A');
  await page.close();

  const restored = await context.newPage();
  await openEditor(restored, app._id);
  await expect(draftNotice(restored)).toBeVisible();
  await expect(
    restored.locator('.react-flow__node').getByText('Offline recoverable edit', { exact: true })
  ).toBeVisible();
  await restored
    .locator('.react-flow__node')
    .getByText('Offline recoverable edit', { exact: true })
    .click();
  const attempted: boolean[] = [];
  restored.on('request', (request) => {
    if (save(new URL(request.url()))) attempted.push(!!request.postDataJSON().autoSave);
  });
  await attemptReload(restored);
  await expect
    .poll(async () => (await readDraft(restored, app))?.savedAt)
    .toBeGreaterThan(onDisk.savedAt);
  expect(attempted).toEqual([]);
  expect(nodeName(await detail(restored, app._id))).toBe('A');
  await manualSave(restored, app._id);
  await expect.poll(() => readDraft(restored, app)).toBeNull();
  const saved = await detail(restored, app._id);
  expect(nodeName(saved)).toBe('Offline recoverable edit');
  expect(saved.publishedVersionId).toEqual(app.publishedVersionId);
  await attachJson({
    testInfo: info,
    name: 'draft-retry',
    data: {
      requestError: failed.failure()?.errorText,
      backup: onDisk,
      requestedAutosaveFlagsAfterRecovery: attempted,
      persisted: nodeName(saved),
      publishedVersionId: saved.publishedVersionId
    }
  });
  await restored.close();
});

test(`[${id}/C7] 晚到的保存响应保护后续编辑`, async ({ app, page }, info) => {
  await openEditor(page, app._id);
  const editor = workflowEditor(page, info);
  await editor.importGraph(namedGraph('First save'));
  const release = Promise.withResolvers<void>();
  const serverSaved = Promise.withResolvers<void>();
  await page.route(
    (url) => isSave(url, app._id),
    async (route) => {
      try {
        const response = await route.fetch();
        expect(await responseData(response)).toBeNull();
        serverSaved.resolve();
        await release.promise;
        await route.fulfill({ response });
      } catch (error) {
        serverSaved.reject(error);
        await route.abort();
      }
    },
    { times: 1 }
  );
  const first = waitForSave({ page, appId: app._id, autoSave: false });
  try {
    await chooseSave(page, '仅保存');
    await serverSaved.promise;
    expect(nodeName(await detail(page, app._id))).toBe('First save');
    await editor.importGraph(namedGraph('Second edit'));
  } finally {
    release.resolve();
  }
  expect(await responseData(await first)).toBeNull();
  expect(nodeName(await editor.exportGraph())).toBe('Second edit');
  await manualSave(page, app._id);
  const saved = await detail(page, app._id);
  expect(nodeName(saved)).toBe('Second edit');
  expect(saved.publishedVersionId).toEqual(app.publishedVersionId);
  await attachJson({
    testInfo: info,
    name: 'in-flight-and-follow-up',
    data: {
      firstName: nodeName((await first).request().postDataJSON()),
      persisted: nodeName(saved),
      publishedVersionId: saved.publishedVersionId
    }
  });
});

async function openSchedule(page: Page) {
  const triggerRow = page.getByText('定时执行', { exact: true }).locator('..');
  if (!(await triggerRow.isVisible())) {
    await page.getByRole('button', { name: '系统配置', exact: true }).click();
  }
  await triggerRow.getByRole('button').click();

  const schedule = page.getByRole('dialog').filter({ hasText: '定时执行配置' });
  await expect(schedule).toBeInViewport();
  return schedule;
}

test(`[${id}/C8] 查看定时配置不产生草稿改动`, async ({ app, page }, info) => {
  await openEditor(page, app._id);
  const schedule = await openSchedule(page);
  await expect(schedule.getByRole('switch').or(schedule.getByRole('checkbox'))).not.toBeChecked();
  await schedule.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(schedule).toBeHidden();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  expect((await workflowEditor(page, info).exportGraph()).chatConfig).not.toHaveProperty(
    'scheduledTriggerConfig'
  );
});

test(`[${id}/C9] 切换定时周期仅在选齐参数后写入表达式`, async ({ app, page }, info) => {
  await openEditor(page, app._id);
  const schedule = await openSchedule(page);
  const toggle = schedule.getByRole('switch').or(schedule.getByRole('checkbox'));
  await toggle.press('Space');
  await expect(toggle).toBeChecked();

  const daily = schedule.getByRole('button', { name: '每天 0:00', exact: true });
  await daily.click();
  await page.getByRole('menuitem', { name: '每周执行', exact: true }).click();
  await expect(daily).toBeVisible();
  await page.getByRole('menuitem', { name: '星期一', exact: true }).click();
  await expect(daily).toBeVisible();
  await page.getByRole('menuitem', { name: '08:00', exact: true }).click();
  await expect(
    schedule.getByRole('button', { name: '每周 星期一 8:00', exact: true })
  ).toBeVisible();
  await info.attach('schedule-completed', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });
  await schedule.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(schedule).toBeHidden();

  const payload = await manualSave(page, app._id);
  const saved = await detail(page, app._id);
  expect(payload.chatConfig.scheduledTriggerConfig?.cronString).toBe('0 8 * * 1');
  expect(saved.chatConfig.scheduledTriggerConfig).toEqual(
    payload.chatConfig.scheduledTriggerConfig
  );
  expect(saved.publishedVersionId).toEqual(app.publishedVersionId);
  await attachJson({
    testInfo: info,
    name: 'schedule-draft',
    data: {
      submitted: payload.chatConfig.scheduledTriggerConfig,
      persisted: saved.chatConfig.scheduledTriggerConfig,
      publishedVersionId: saved.publishedVersionId
    }
  });
});
