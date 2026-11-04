import { expect, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { TextEditorNode } from '../../../../../packages/global/core/workflow/template/system/textEditor';
import { WorkflowStart } from '../../../../../packages/global/core/workflow/template/system/workflowStart';
import { NodeInputKeyEnum } from '../../../../../packages/global/core/workflow/constants';

type Edge = { source: string; sourceHandle: string; target: string; targetHandle: string };
type Graph = {
  type: 'advanced';
  nodes: ReturnType<typeof buildWorkflowGraph>['nodes'];
  edges: Edge[];
  chatConfig: Record<string, never>;
};

/** 用真实模板构造固定文本图；不调用模型、不伪造端口或运行时节点能力。 */
export function buildWorkflowGraph(ids: string[], relations: [string, string][]) {
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

/** 工作流测试只经导入/导出 UI 准备和读取图，经原生指针建边；不写 React 状态或调用内部校验。 */
export function workflowEditor(page: Page, testInfo: TestInfo) {
  const nodeById = (id: string) => page.locator('.react-flow__node[data-id="' + id + '"]');
  const tupleSet = (graph: Graph) =>
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
    await page.getByRole('button', { name: 'Expand', exact: true }).hover();
    await page.getByText('导出配置', { exact: true }).hover();
    const download = page.waitForEvent('download');
    await page.getByText('导出为 JSON', { exact: true }).click();
    const file = await (await download).path();
    if (!file) throw new Error('导出 JSON 未产生文件');
    return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')) as Graph;
  }

  /** 每个独立变体恢复指定图；以节点/视口实际稳定为准，不复用旧端口坐标。 */
  async function importGraph(graph: Graph) {
    await page.getByRole('button', { name: 'Expand', exact: true }).hover();
    await page.getByText('导入配置', { exact: true }).click();
    const dialog = page.getByRole('dialog').filter({ has: page.locator('textarea') });
    await dialog.locator('textarea').fill(JSON.stringify(graph));
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.react-flow__node')).toHaveCount(graph.nodes.length);
    const panelClose = page
      .locator('button')
      .filter({ has: page.locator('svg[data-fastgpt-icon-scoped$="-common/backFill"]') });
    if (await panelClose.first().isVisible()) await panelClose.first().click();
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
    expect(tupleSet(await exportGraph())).toEqual(tupleSet(graph));
  }

  /** 有效起拖后检查目标，真实释放后以完整导出图验证唯一新增关系或完全不变。 */
  async function drag(source: string, target: string, allowed: boolean) {
    const before = await exportGraph();
    await nodeById(source).getByText(source, { exact: true }).first().click();
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
    try {
      await page.mouse.move(x + 35, y + 12, { steps: 4 });
      await expect(page.locator('.react-flow__connection path')).toHaveCount(1);
      await expect(targetHandle).toHaveCSS('visibility', allowed ? 'visible' : 'hidden');
      if (allowed) await expect(targetHandle).toHaveClass(/connectableend/);
      else await expect(targetHandle).not.toHaveClass(/connectableend/);
      const end = await targetHandle.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });
      await page.mouse.move(end.x, end.y, { steps: 10 });
    } finally {
      await page.mouse.up();
    }
    await expect(page.locator('.react-flow__connection path')).toHaveCount(0);
    const after = await exportGraph();
    await testInfo.attach(source + '-to-' + target, {
      body: JSON.stringify({ sourceHit, allowed, before, after }),
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
  }

  /** 通过真实键盘删除选中节点，并等待画布卸载；不调用节点删除内部函数。 */
  async function deleteNode(id: string) {
    await nodeById(id).getByText(id, { exact: true }).first().click();
    await page.keyboard.press('Delete');
    await expect(nodeById(id)).toHaveCount(0);
  }
  return { importGraph, exportGraph, drag, deleteNode, tupleSet };
}
