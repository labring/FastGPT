import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { buildWorkflowGraph, workflowEditor } from './workflow.browser';

const caseId = 'FG-APP-WORKFLOW-007';
const g1 = buildWorkflowGraph(
  ['Start', 'A', 'B', 'C', 'Free'],
  [
    ['Start', 'A'],
    ['A', 'B'],
    ['B', 'C']
  ]
);
const g2 = buildWorkflowGraph(
  ['Start', 'A', 'B', 'D', 'C'],
  [
    ['Start', 'A'],
    ['A', 'B'],
    ['B', 'D'],
    ['A', 'C']
  ]
);
let appId: string;

/** 每次 worker 使用独立临时应用，认证由外部测试环境提供，失败也执行应用清理。 */
test.beforeAll(async ({ request }, testInfo) => {
  if (!process.env.FASTGPT_TEST_STORAGE_STATE)
    throw new Error(
      '需要 FASTGPT_TEST_STORAGE_STATE 指向仓库外的测试账号认证状态；由 AI 补齐环境后复测'
    );
  const response = await request.post('/api/core/app/create', {
    headers: { 'fastgpt-web-request': '1' },
    data: { ...g1, name: 'FG-TEST-' + caseId + '-' + randomUUID().slice(0, 8) }
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.code).toBe(200);
  expect(typeof body.data).toBe('string');
  appId = body.data;
  await testInfo.attach('temporary-app', {
    body: JSON.stringify({ appId, createdAt: new Date().toISOString() }),
    contentType: 'application/json'
  });
});
test.afterAll(async ({ request }, testInfo) => {
  if (!appId) return;
  const response = await request.delete('/api/core/app/del?appId=' + appId, {
    headers: { 'fastgpt-web-request': '1' }
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  await testInfo.attach('cleanup', {
    body: JSON.stringify({ appId, http: response.status(), body }),
    contentType: 'application/json'
  });
  expect(body.code).toBe(200);
  expect(body.data).toContain(appId);
});
test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => {
    void dialog.dismiss();
  });
  await page.goto('/app/detail?appId=' + appId);
  await expect(page.getByRole('button', { name: 'Expand', exact: true })).toBeVisible();
});

test('[' + caseId + '/C1] 自连、重复同端口和纯串行回环', async ({ page }, testInfo) => {
  const editor = workflowEditor(page, testInfo);
  for (const [source, target] of [
    ['A', 'A'],
    ['A', 'B'],
    ['C', 'A']
  ]) {
    await test.step(source + ' → ' + target, async () => {
      await editor.importGraph(g1);
      await editor.drag(source, target, false);
    });
  }
});
test('[' + caseId + '/C2] 同一普通出口可以分叉', async ({ page }, testInfo) => {
  const editor = workflowEditor(page, testInfo);
  await editor.importGraph(g1);
  await editor.drag('A', 'C', true);
});
test('[' + caseId + '/C3] 无环分支可以汇合', async ({ page }, testInfo) => {
  const editor = workflowEditor(page, testInfo);
  await editor.importGraph(g2);
  await editor.drag('D', 'C', true);
});
test('[' + caseId + '/C4] 删除节点后按新拓扑允许连接', async ({ page }, testInfo) => {
  const editor = workflowEditor(page, testInfo);
  await editor.importGraph(g1);
  await editor.deleteNode('B');
  const afterDelete = await editor.exportGraph();
  expect(editor.tupleSet(afterDelete)).toEqual([
    ['Start', 'Start-source-right', 'A', 'A-target-left']
  ]);
  expect(afterDelete.nodes.map((node) => node.nodeId).sort()).toEqual(['A', 'C', 'Free', 'Start']);
  await testInfo.attach('after-delete-B', {
    body: JSON.stringify(afterDelete),
    contentType: 'application/json'
  });
  await editor.drag('C', 'A', true);
});
