import { expect, type Page, type TestInfo } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { TextEditorNode } from '../../../../../packages/global/core/workflow/template/system/textEditor';
import { WorkflowStart } from '../../../../../packages/global/core/workflow/template/system/workflowStart';
import { NodeInputKeyEnum } from '../../../../../packages/global/core/workflow/constants';
import type { AppChatConfigType } from '../../../../../packages/global/core/app/type';
import type { StoreNodeItemType } from '../../../../../packages/global/core/workflow/type/node';

type Edge = { source: string; sourceHandle: string; target: string; targetHandle: string };
export type Graph = {
  type: 'advanced';
  nodes: StoreNodeItemType[];
  edges: Edge[];
  chatConfig: AppChatConfigType;
};

/** 用真实模板构造固定文本图；不调用模型、不伪造端口或运行时节点能力。 */
export function buildWorkflowGraph(ids: string[], relations: [string, string][]): Graph {
  return {
    type: 'advanced' as const,
    nodes: ids.map((id, index) => {
      const template = structuredClone(id === 'Start' ? WorkflowStart : TextEditorNode);
      if (id !== 'Start')
        template.inputs.find((input) => input.key === NodeInputKeyEnum.textareaInput)!.value =
          '固定文本 ' + id;
      return {
        ...template,
        nodeId: id,
        name: id,
        isFolded: false,
        position: { x: (index % 3) * 900, y: Math.floor(index / 3) * 850 }
      };
    }),
    edges: relations.map(([source, target]) => ({
      source,
      target,
      sourceHandle: source + '-source-right',
      targetHandle: target + '-target-left'
    })),
    chatConfig: {}
  };
}

/** 只对由本次真实创建接口返回的应用 ID 执行编辑和清理。 */
export async function withWorkflowApp({
  page,
  testInfo,
  graph,
  run
}: {
  page: Page;
  testInfo: TestInfo;
  graph: Graph;
  run: (appId: string) => Promise<void>;
}) {
  const runId = `FG-TEST-${randomUUID()}`;
  const headers = { 'fastgpt-web-request': '1' };
  const created = await page.request.post('/api/core/app/create', {
    headers,
    data: { ...graph, name: runId }
  });
  expect(created.status()).toBe(200);
  const body = await created.json();
  expect(body.code).toBe(200);
  const appId = body.data;
  expect(appId).toMatch(/^[a-f\d]{24}$/);
  try {
    await testInfo.attach('temporary-app', {
      body: JSON.stringify({ appId, runId, createdAt: new Date().toISOString() }),
      contentType: 'application/json'
    });
    await openWorkflowApp(page, appId);
    await run(appId);
  } finally {
    const removed = await page.request.delete(`/api/core/app/del?appId=${appId}`, { headers });
    const { code, data } = await removed.json();
    await testInfo.attach('cleanup', {
      body: JSON.stringify({ appId, http: removed.status(), code }),
      contentType: 'application/json'
    });
    expect(removed.status()).toBe(200);
    expect(code).toBe(200);
    expect(data).toContain(appId);
  }
}

/** 经实际提示按钮关闭可能初次展示的公告和引导，等画布入口可用。 */
export async function openWorkflowApp(page: Page, appId: string) {
  page.setDefaultTimeout(15_000);
  await page.addLocatorHandler(
    page.getByRole('dialog').filter({ hasText: '请绑定联系方式' }),
    async (dialog) => {
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
    }
  );
  await page.addLocatorHandler(
    page.getByRole('dialog', { name: '系统消息', exact: true }),
    async (dialog) => {
      await dialog.getByRole('button', { name: '已读', exact: true }).click();
    }
  );
  await page.addLocatorHandler(
    page.getByRole('dialog').filter({ hasText: '系统配置移到这里啦~' }),
    async (dialog) => {
      await dialog.getByRole('button', { name: '知道了', exact: true }).click();
    }
  );
  await page.goto(`/app/detail?appId=${appId}`);
  await expect(page.getByRole('button', { name: 'Expand', exact: true })).toBeVisible({
    timeout: 30_000
  });
}

/** 在视口内查找真实可命中的空白画布，避开节点、连线和控制器。 */
export async function canvasBlankPoint(page: Page) {
  return page.locator('.react-flow__pane').evaluate((pane) => {
    const rect = pane.getBoundingClientRect();
    for (const vertical of [0.7, 0.55, 0.85, 0.35]) {
      for (const horizontal of [0.65, 0.45, 0.3, 0.75, 0.15]) {
        const x = rect.x + rect.width * horizontal;
        const y = rect.y + rect.height * vertical;
        if (document.elementFromPoint(x, y) === pane) return { x, y };
      }
    }
    throw new Error('视口内没有可命中的空白画布');
  });
}

/** 工作流测试只经导入/导出 UI 准备和读取图，经原生指针建边；不写 React 状态或调用内部校验。 */
export function workflowEditor(page: Page, testInfo: TestInfo) {
  const nodeById = (id: string) => page.locator('.react-flow__node[data-id="' + id + '"]');
  const tupleSet = (graph: Pick<Graph, 'edges'>) =>
    graph.edges
      .map((edge) => [edge.source, edge.sourceHandle, edge.target, edge.targetHandle])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const parents = (graph: Graph) =>
    graph.nodes
      .map((entry) => [
        entry.nodeId,
        (entry as typeof entry & { parentNodeId?: string }).parentNodeId ?? null
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  /** 从产品导出入口下载真实配置，避免把边数或临时 ID 当作语义一致。 */
  async function exportGraph() {
    const menu = page.getByRole('button', { name: 'Expand', exact: true });
    const downloadOption = page.getByText('导出为 JSON', { exact: true });
    // 连续导出时先离开上次的二级菜单，等关闭后再重新进入。
    await page.mouse.move(1, 1);
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(downloadOption).toHaveCount(0);
    await menu.hover();
    await page.getByText('导出配置', { exact: true }).hover();
    const [download] = await Promise.all([page.waitForEvent('download'), downloadOption.click()]);
    const file = await download.path();
    if (!file) throw new Error('导出 JSON 未产生文件');
    return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')) as Graph;
  }

  /** 每个独立变体恢复指定图；以节点/视口实际稳定为准，不复用旧端口坐标。 */
  async function fitCanvas() {
    const panelClose = page
      .getByText('系统配置', { exact: true })
      .locator('xpath=..')
      .getByRole('button', { name: '关闭', exact: true });
    if (await panelClose.isVisible()) {
      await panelClose.click();
      await expect(panelClose).toBeHidden();
    }
    await page.locator('.custom-workflow-fix_view').click();
    let previous = '',
      stable = 0;
    await expect
      .poll(async () => {
        const signature = await page.locator('.react-flow__viewport').getAttribute('style');
        stable = signature === previous ? stable + 1 : 0;
        previous = signature ?? '';
        return stable;
      })
      .toBeGreaterThanOrEqual(2);
  }

  async function importGraph(graph: Graph) {
    await page.getByRole('button', { name: 'Expand', exact: true }).hover();
    await page.getByText('导入配置', { exact: true }).click();
    const dialog = page.getByRole('dialog').filter({ has: page.locator('textarea') });
    await dialog.locator('textarea').fill(JSON.stringify(graph));
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.react-flow__node')).toHaveCount(graph.nodes.length);
    await fitCanvas();
    const imported = await exportGraph();
    expect(tupleSet(imported)).toEqual(tupleSet(graph));
    return imported;
  }

  /** 有效起拖后检查目标，真实释放后以完整导出图验证唯一新增关系或完全不变。 */
  async function drag(source: string, target: string, allowed: boolean) {
    const before = await exportGraph();
    await nodeById(source).getByText(source, { exact: true }).first().hover();
    const sourceHandle = nodeById(source).locator(
      '.react-flow__handle.source[data-handleid="' + source + '-source-right"]'
    );
    const targetHandle = nodeById(target).locator(
      '.react-flow__handle.target[data-handleid="' + target + '-target-left"]'
    );
    await expect(sourceHandle).toBeVisible();
    const start = await sourceHandle.boundingBox();
    if (!start) throw new Error('源端口未进入视口');
    const x = start.x + start.width / 2,
      y = start.y + start.height / 2;
    const sourceHit = await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest('.react-flow__handle')
          ?.getAttribute('data-handleid'),
      { x, y }
    );
    expect(sourceHit).toBe(source + '-source-right');
    await page.mouse.move(x, y);
    await page.mouse.down();
    let targetState;
    try {
      await page.mouse.move(x + 35, y + 12, { steps: 4 });
      await expect(page.locator('.react-flow__connection path')).toHaveCount(1);
      targetState = await targetHandle.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        return {
          x,
          y,
          hit: document
            .elementFromPoint(x, y)
            ?.closest('.react-flow__handle')
            ?.getAttribute('data-handleid'),
          visibility: getComputedStyle(element).visibility,
          connectable: element.classList.contains('connectableend')
        };
      });
      await page.mouse.move(targetState.x, targetState.y, { steps: 10 });
    } finally {
      await page.mouse.up();
    }
    await expect(page.locator('.react-flow__connection path')).toHaveCount(0);
    const after = await exportGraph();
    await testInfo.attach(source + '-to-' + target, {
      body: JSON.stringify({ sourceHit, targetState, allowed, before, after }),
      contentType: 'application/json'
    });
    const expected = allowed
      ? [
          ...tupleSet(before),
          [source, source + '-source-right', target, target + '-target-left']
        ].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      : tupleSet(before);
    expect(tupleSet(after)).toEqual(expected);
    expect(parents(after)).toEqual(parents(before));
    expect(targetState).toMatchObject({
      visibility: allowed ? 'visible' : 'hidden',
      connectable: allowed
    });
    if (allowed) expect(targetState?.hit).toBe(target + '-target-left');
  }

  /** 从节点操作菜单删除，避免点击可编辑标题后将删除键发给文本框。 */
  async function deleteNode(id: string) {
    await nodeById(id).hover();
    await nodeById(id).getByRole('button', { name: '删除', exact: true }).click();
    await expect(nodeById(id)).toHaveCount(0);
  }

  /** 经节点菜单折叠或展开，适用于实际会重算端口的节点。 */
  async function setFolded(id: string, folded: boolean) {
    const node = nodeById(id);
    await node.hover();
    await node.getByRole('button', { name: folded ? '折叠' : '展开', exact: true }).click();
  }
  return { importGraph, exportGraph, fitCanvas, drag, deleteNode, setFolded, tupleSet };
}
