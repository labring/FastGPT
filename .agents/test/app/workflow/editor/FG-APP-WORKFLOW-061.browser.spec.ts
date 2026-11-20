import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { AppReadChatLogRoleVal } from '../../../../../packages/global/support/permission/app/constant';
import {
  OwnerRoleVal,
  ReadRoleVal,
  WriteRoleVal
} from '../../../../../packages/global/support/permission/constant';
import {
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../../../packages/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '../../../../../packages/global/core/workflow/node/constant';
import { AssignedAnswerModule } from '../../../../../packages/global/core/workflow/template/system/assignedAnswer';
import { HttpNode468 } from '../../../../../packages/global/core/workflow/template/system/http468';
import {
  buildWorkflowGraph,
  canvasBlankPoint,
  withWorkflowApp,
  workflowEditor
} from './workflow.browser';

const caseId = 'FG-APP-WORKFLOW-061';
const graph = buildWorkflowGraph(
  ['Start', 'Answer', 'Http'],
  [
    ['Start', 'Answer'],
    ['Answer', 'Http']
  ]
);
graph.nodes[1] = {
  ...graph.nodes[1],
  ...AssignedAnswerModule,
  name: 'Answer',
  inputs: AssignedAnswerModule.inputs.map((input) => ({ ...input, value: '固定回复' }))
};
graph.nodes[2] = { ...graph.nodes[2], ...HttpNode468, name: 'Http' };
const updatePath = '/api/proApi/core/app/collaborator/update';
const listPath = '/api/proApi/core/app/collaborator/list';
const headers = { 'fastgpt-web-request': '1' };
const combinedRole = WriteRoleVal | AppReadChatLogRoleVal;

/** 比对菜单矩形和可视命中结果；矩形使用相同的 CSS 像素坐标。 */
async function menuEvidence({
  menu,
  trigger,
  option
}: {
  menu: Locator;
  trigger: Locator;
  option: Locator;
}) {
  await expect(menu).toBeInViewport();
  await expect
    .poll(() =>
      option.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        );
      })
    )
    .toBe(true);
  return { trigger: await trigger.boundingBox(), menu: await menu.boundingBox(), hit: true };
}

const attachPage = async ({
  page,
  testInfo,
  name
}: {
  page: Page;
  testInfo: TestInfo;
  name: string;
}) => testInfo.attach(name, { body: await page.screenshot(), contentType: 'image/png' });

async function openCollaborators(page: Page) {
  await page.getByRole('button', { name: 'Expand', exact: true }).hover();
  await page.getByText('权限设置', { exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '管理', exact: true }).click();
  const dialog = page.getByRole('dialog').filter({
    has: page.getByText('管理协作者', { exact: true })
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

const roleTrigger = (dialog: Locator, name: string) =>
  dialog
    .getByText(name, { exact: true })
    .locator('xpath=ancestor::div[.//button[@aria-haspopup="menu"]][1]')
    .locator('button[aria-haspopup="menu"]');

type Collaborator = { tmbId?: string; groupId?: string; orgId?: string; permission: number };
async function listCollaborators(page: Page, appId: string) {
  const response = await page.request.get(`${listPath}?appId=${appId}`, { headers });
  const body = await response.json();
  expect(response.status()).toBe(200);
  expect(body.code).toBe(200);
  const clbs: (Omit<Collaborator, 'permission'> & {
    permission: { role: number };
    name: string;
  })[] = body.data.clbs;
  return clbs
    .map(({ tmbId, groupId, orgId, permission, name }) => ({
      tmbId,
      groupId,
      orgId,
      permission: permission.role,
      name
    }))
    .sort((left, right) =>
      (left.tmbId ?? left.groupId ?? left.orgId ?? '').localeCompare(
        right.tmbId ?? right.groupId ?? right.orgId ?? ''
      )
    );
}

/** 查找实际滚动的协作者列，从未被下拉菜单覆盖的列左缘用鼠标滚动。 */
async function scrollCollaborators(page: Page, trigger: Locator) {
  const list = trigger.locator('xpath=ancestor::div[1]');
  const snapshot = () =>
    list.evaluate((element) => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (
          getComputedStyle(parent).overflowY === 'auto' &&
          parent.scrollHeight > parent.clientHeight
        ) {
          const rect = parent.getBoundingClientRect();
          const x = rect.left + 10;
          const y = [0.9, 0.8, 0.65, 0.5, 0.35, 0.2]
            .map((fraction) => rect.top + rect.height * fraction)
            .find((line) => {
              const hit = document.elementFromPoint(x, line);
              return hit && parent!.contains(hit) && !hit.closest('[role="menu"]');
            });
          if (y === undefined) throw new Error('菜单覆盖了本轮测试的全部滚动位置');
          return {
            x,
            y,
            scrollTop: parent.scrollTop,
            clientHeight: parent.clientHeight,
            scrollHeight: parent.scrollHeight
          };
        }
      }
      throw new Error('协作者列没有实际滚动空间');
    });
  const before = await snapshot();
  await page.mouse.move(before.x, before.y);
  await page.mouse.wheel(0, before.scrollTop > 0 ? -8 : 8);
  await expect.poll(async () => (await snapshot()).scrollTop).not.toBe(before.scrollTop);
  return { before, after: await snapshot() };
}

for (const item of ['C1', 'C2']) {
  test(`[${caseId}/${item}] 协作者权限菜单与持久化`, async ({ page }, testInfo) => {
    const membersPath = process.env.FASTGPT_TEST_WORKFLOW_MEMBERS;
    if (!membersPath) throw new Error('需要 FASTGPT_TEST_WORKFLOW_MEMBERS 预置本轮协作者 ID');
    const members = JSON.parse(await readFile(membersPath, 'utf8')) as {
      tmbId: string;
      name: string;
    }[];
    expect(members.length).toBeGreaterThanOrEqual(5);
    await withWorkflowApp({
      page,
      testInfo,
      graph,
      run: async (appId) => {
        const initial = await listCollaborators(page, appId);
        const owner = initial.find((member) => member.permission === OwnerRoleVal);
        expect(owner).toBeDefined();
        const collaborators = [
          ...initial,
          ...members.map<Collaborator>(({ tmbId }, index) => ({
            tmbId,
            permission: item === 'C2' && index === 0 ? combinedRole : ReadRoleVal
          }))
        ].map(({ tmbId, groupId, orgId, permission }) => ({ tmbId, groupId, orgId, permission }));
        const initialized = await page.request.post(updatePath, {
          headers,
          data: { appId, collaborators }
        });
        expect(initialized.status()).toBe(200);
        expect((await initialized.json()).code).toBe(200);
        const baseline = await listCollaborators(page, appId);
        const dialog = await openCollaborators(page);
        const menu = dialog.getByRole('menu').filter({ visible: true });
        const logs = menu.getByText('查看对话日志', { exact: true });
        if (item === 'C1') {
          const target = members[0];
          await roleTrigger(dialog, owner!.name).click();
          await expect(menu).toBeHidden();
          await roleTrigger(dialog, target.name).click();
          await menu.getByText('写权限', { exact: true }).click();
          await logs.click();
          const pending = page.waitForResponse(
            (res) => new URL(res.url()).pathname === updatePath && res.request().method() === 'POST'
          );
          await dialog.getByRole('button', { name: '确认', exact: true }).click();
          const response = await pending;
          const payload = response.request().postDataJSON();
          const body = await response.json();
          expect(response.status()).toBe(200);
          expect(body.code).toBe(200);
          await expect(dialog).toBeHidden();
          await page.reload();
          const reloadedDialog = await openCollaborators(page);
          const row = roleTrigger(reloadedDialog, target.name);
          await expect(row).toContainText('写权限');
          await row.click();
          await expect(
            logs.locator('xpath=ancestor::div[.//input[@type="checkbox"]][1]').getByRole('checkbox')
          ).toBeChecked();
          await attachPage({ page, testInfo, name: 'persisted-role-menu' });
          const persisted = await listCollaborators(page, appId);
          const expected = baseline.map((member) =>
            member.tmbId === target.tmbId ? { ...member, permission: combinedRole } : member
          );
          expect(persisted).toEqual(expected);
          await testInfo.attach('saved-roles', {
            body: JSON.stringify({ baseline, payload, code: body.code, persisted }),
            contentType: 'application/json'
          });
        } else {
          for (const viewport of [
            { width: 1280, height: 640 },
            { width: 390, height: 667 }
          ]) {
            await page.setViewportSize(viewport);
            const target = roleTrigger(dialog, members.at(-2)!.name);
            await target.click();
            const scrolling = await menu.evaluate((element) => ({
              clientHeight: element.clientHeight,
              scrollHeight: element.scrollHeight,
              scrollTop: element.scrollTop
            }));
            if (scrolling.scrollHeight > scrolling.clientHeight) {
              await menu.hover();
              await page.mouse.wheel(0, scrolling.scrollHeight);
              await expect
                .poll(() => menu.evaluate((element) => element.scrollTop))
                .toBeGreaterThan(scrolling.scrollTop);
            }
            await logs.scrollIntoViewIfNeeded();
            const rects = await menuEvidence({ menu, trigger: target, option: logs });
            const memberScroll = await scrollCollaborators(page, target);
            const afterScroll = await menuEvidence({ menu, trigger: target, option: logs });
            expect(afterScroll.menu!.x).toBeLessThan(
              afterScroll.trigger!.x + afterScroll.trigger!.width
            );
            expect(afterScroll.menu!.x + afterScroll.menu!.width).toBeGreaterThan(
              afterScroll.trigger!.x
            );
            expect(
              Math.abs(
                afterScroll.menu!.y - afterScroll.trigger!.y - (rects.menu!.y - rects.trigger!.y)
              )
            ).toBeLessThanOrEqual(16);
            await logs.click();
            await attachPage({ page, testInfo, name: `role-menu-${viewport.width}` });
            await dialog.getByText('管理协作者', { exact: true }).click();
            await expect(menu).toBeHidden();
            await roleTrigger(dialog, owner!.name).click();
            await expect(menu).toBeHidden();
            await testInfo.attach(`roles-${viewport.width}`, {
              body: JSON.stringify({
                viewport,
                ...rects,
                scrolling,
                memberScroll,
                afterScroll,
                dialog: await dialog.boundingBox()
              }),
              contentType: 'application/json'
            });
          }
          await dialog.getByRole('button', { name: '取消', exact: true }).click();
          await expect(dialog).toBeHidden();
          const afterCancel = await listCollaborators(page, appId);
          expect(afterCancel).toEqual(baseline);
          await testInfo.attach('cancelled-roles', {
            body: JSON.stringify({ baseline, afterCancel }),
            contentType: 'application/json'
          });
        }
      }
    });
  });
}

test(`[${caseId}/C3] HTTP 鉴权弹窗内切换输入方式`, async ({ page }, testInfo) => {
  await withWorkflowApp({
    page,
    testInfo,
    graph,
    run: async () => {
      const editor = workflowEditor(page, testInfo);
      await editor.fitCanvas();
      const before = await editor.exportGraph();
      await page
        .locator('.react-flow__node[data-id="Http"]')
        .getByRole('button', { name: '鉴权配置', exact: true })
        .click();
      const dialog = page.getByRole('dialog').filter({
        has: page.getByText('鉴权配置', { exact: true })
      });
      await page.setViewportSize({ width: 1280, height: 640 });
      await dialog.getByRole('button', { name: '无', exact: true }).click();
      await dialog.getByText('Bearer', { exact: true }).click();
      const manual = dialog.getByRole('button', { name: '手动输入', exact: true });
      await expect(dialog.getByPlaceholder('Value')).toBeVisible();
      await manual.click();
      const menu = dialog.getByRole('menu').filter({ hasText: '变量引用', visible: true });
      const reference = menu.getByText('变量引用', { exact: true });
      const observation = await menuEvidence({ menu, trigger: manual, option: reference });
      await attachPage({ page, testInfo, name: 'auth-menu' });
      await reference.click();
      await expect(dialog.getByPlaceholder('Value')).toBeHidden();
      const referenceTrigger = dialog.getByRole('button', { name: '变量引用', exact: true });
      await referenceTrigger.click();
      await dialog.getByText('鉴权类型', { exact: true }).click();
      await expect(menu).toBeHidden();
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await page.setViewportSize({ width: 1600, height: 1000 });
      const after = await editor.exportGraph();
      const secretConfig = (snapshot: typeof before) =>
        snapshot.nodes
          .find((node) => node.nodeId === 'Http')
          ?.inputs.find((input) => input.key === NodeInputKeyEnum.headerSecret)?.value;
      expect(secretConfig(after)).toEqual(secretConfig(before));
      await page
        .locator('.react-flow__node[data-id="Http"]')
        .getByRole('button', { name: '鉴权配置', exact: true })
        .click();
      await expect(dialog.getByRole('button', { name: '无', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await testInfo.attach('auth-mode', {
        body: JSON.stringify({
          ...observation,
          manualRestored: false,
          persisted: secretConfig(after)
        }),
        contentType: 'application/json'
      });
    }
  });
});

test(`[${caseId}/C4] 节点菜单跟随画布缩放并可切换`, async ({ page }, testInfo) => {
  await withWorkflowApp({
    page,
    testInfo,
    graph,
    run: async () => {
      const editor = workflowEditor(page, testInfo);
      const node = page.locator('.react-flow__node[data-id="Answer"]');
      const viewport = page.locator('.react-flow__viewport');
      const scale = () =>
        viewport.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
      await editor.fitCanvas();
      const before = await editor.exportGraph();
      for (const key of ['Minus', 'Equal']) {
        const point = await canvasBlankPoint(page);
        await page.mouse.move(point.x, point.y);
        await expect(page.locator('.react-flow__pane:hover')).toHaveCount(1);
        // 快捷键在画布进入状态提交后接管，跨一帧让指针进入与键盘输入分开。
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        );
        await page.mouse.click(point.x, point.y);
        const previous = await scale();
        await page.keyboard.press(`Control+${key}`);
        const zoomed = expect.poll(scale);
        if (key === 'Minus') await zoomed.toBeLessThan(previous);
        else await zoomed.toBeGreaterThan(previous);
        const manual = node.getByRole('button', { name: '手动输入', exact: true });
        const menu = page.getByRole('menu').filter({ visible: true });
        const option = menu.getByText('变量引用', { exact: true });
        await manual.click();
        const rects = await menuEvidence({ menu, trigger: manual, option });
        await attachPage({ page, testInfo, name: `canvas-menu-${key}` });
        await testInfo.attach(`zoom-${key}`, {
          body: JSON.stringify({
            ...rects,
            scale: { before: previous, after: await scale() },
            transform: await viewport.getAttribute('style')
          }),
          contentType: 'application/json'
        });
        expect(Math.abs(rects.menu!.x - rects.trigger!.x)).toBeLessThan(36);
        await option.click();
        await node.getByRole('button', { name: '变量引用', exact: true }).click();
        await menu.getByText('手动输入', { exact: true }).click();
        await manual.click();
        const blank = await canvasBlankPoint(page);
        await page.mouse.click(blank.x, blank.y);
        await expect(menu).toBeHidden();
      }
      const after = await editor.exportGraph();
      expect(editor.tupleSet(after)).toEqual(editor.tupleSet(before));
      expect(after.nodes.map(({ nodeId }) => nodeId)).toEqual(
        before.nodes.map(({ nodeId }) => nodeId)
      );
      await testInfo.attach('canvas-topology', {
        body: JSON.stringify({ before: before.edges, after: after.edges }),
        contentType: 'application/json'
      });
    }
  });
});

test(`[${caseId}/C5] cURL 导入只替换已知字段并支持一次撤销`, async ({ page }, testInfo) => {
  const fixture = structuredClone(graph);
  fixture.nodes[2].inputs.push({
    key: 'toString',
    label: '保留的业务参数',
    value: 'keep-current-value',
    canEdit: true,
    valueType: WorkflowIOValueTypeEnum.string,
    renderTypeList: [FlowNodeInputTypeEnum.input]
  });
  await withWorkflowApp({
    page,
    testInfo,
    graph: fixture,
    run: async () => {
      const editor = workflowEditor(page, testInfo);
      await editor.fitCanvas();
      const before = await editor.exportGraph();
      const http = page.locator('.react-flow__node[data-id="Http"]');
      await http.getByRole('button', { name: 'cURL 导入', exact: true }).click();
      const dialog = page.getByRole('dialog').filter({ hasText: 'cURL 导入' });
      await dialog.getByRole('textbox').fill('curl -X PUT "https://example.invalid/items?id=42"');
      await dialog.getByRole('button', { name: '确认', exact: true }).click();
      await expect(dialog).toBeHidden();
      const after = await editor.exportGraph();
      const inputs = (snapshot: typeof before) =>
        snapshot.nodes.find(({ nodeId }) => nodeId === 'Http')?.inputs;
      expect(inputs(after)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: NodeInputKeyEnum.httpMethod, value: 'PUT' }),
          expect.objectContaining({
            key: NodeInputKeyEnum.httpReqUrl,
            value: 'https://example.invalid/items'
          }),
          expect.objectContaining({ key: 'toString', value: 'keep-current-value' })
        ])
      );
      expect(editor.tupleSet(after)).toEqual(editor.tupleSet(before));
      await page
        .locator('button')
        .filter({ has: page.locator('svg[data-fastgpt-icon-scoped$="-core/workflow/undo"]') })
        .click();
      const undone = await editor.exportGraph();
      expect(undone).toEqual(before);
      await testInfo.attach('curl-inputs', {
        body: JSON.stringify({
          before: inputs(before),
          after: inputs(after),
          undone: inputs(undone)
        }),
        contentType: 'application/json'
      });
    }
  });
});
