import { test, expect, type Page } from '@playwright/test';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum
} from '../../../../../packages/global/core/workflow/constants';
import { IfElseNode } from '../../../../../packages/global/core/workflow/template/system/ifElse';
import { VariableConditionEnum } from '../../../../../packages/global/core/workflow/template/system/ifElse/constant';
import { buildWorkflowGraph, withWorkflowApp, workflowEditor } from './workflow.browser';

const caseId = 'FG-APP-WORKFLOW-014';
const graph = buildWorkflowGraph(
  ['Start', 'A', 'B', 'C', 'Free'],
  [
    ['Start', 'A'],
    ['A', 'B'],
    ['B', 'C']
  ]
);
graph.edges[1] = {
  ...graph.edges[1],
  sourceHandle: 'A-source-left',
  targetHandle: 'B-target-right'
};

const branchGraph = buildWorkflowGraph(
  ['Start', 'A', 'Branch', 'C', 'Exit'],
  [
    ['Start', 'A'],
    ['A', 'Branch'],
    ['Branch', 'C'],
    ['Branch', 'Exit']
  ]
);
branchGraph.nodes[2] = {
  ...branchGraph.nodes[2],
  ...IfElseNode,
  name: 'Branch',
  inputs: IfElseNode.inputs.map((input) => ({
    ...input,
    value: [
      {
        condition: 'AND',
        list: [
          {
            variable: ['Start', NodeOutputKeyEnum.userChatInput],
            condition: VariableConditionEnum.equalTo,
            value: 'again',
            valueType: 'input'
          }
        ]
      }
    ]
  }))
};
branchGraph.edges[2].sourceHandle = 'Branch-source-IF';
branchGraph.edges[3].sourceHandle = 'Branch-source-ELSE';

test(`[${caseId}/C1] 导入旧 IF 分支并折叠展开`, async ({ page }, testInfo) => {
  await withWorkflowApp({
    page,
    testInfo,
    graph,
    run: async () => {
      const editor = workflowEditor(page, testInfo);
      await editor.importGraph(branchGraph);
      const before = await editor.exportGraph();
      const handles = page.locator(
        '.react-flow__node[data-id="Branch"] .react-flow__handle.source'
      );
      const checkHandles = async () => {
        for (const key of ['IF', 'ELSE']) {
          await expect(
            handles.and(page.locator(`[data-handleid="Branch-source-${key}"]`))
          ).toBeAttached();
        }
        await expect(page.locator('.react-flow__edge')).toHaveCount(branchGraph.edges.length);
      };
      await checkHandles();
      await editor.setFolded('Branch', true);
      const folded = await editor.exportGraph();
      expect(folded.nodes.find((node) => node.nodeId === 'Branch')?.isFolded).toBe(true);
      await editor.setFolded('Branch', false);
      await checkHandles();
      const after = await editor.exportGraph();
      const branchIds = [before, folded, after].map((snapshot) =>
        snapshot.nodes
          .find((node) => node.nodeId === 'Branch')
          ?.inputs.find((input) => input.key === NodeInputKeyEnum.ifElseList)
          ?.value.map((branch: { branchId?: string }) => branch.branchId)
      );
      await testInfo.attach('branch-round-trip', {
        body: JSON.stringify({
          branchIds,
          before: before.edges,
          folded: folded.edges,
          after: after.edges
        }),
        contentType: 'application/json'
      });
      expect(branchIds).toEqual([['IF'], ['IF'], ['IF']]);
      expect(editor.tupleSet(folded)).toEqual(editor.tupleSet(before));
      expect(editor.tupleSet(after)).toEqual(editor.tupleSet(before));
    }
  });
});

test(`[${caseId}/C2] 导入旧方向后可正常渲染`, async ({ page }, testInfo) => {
  await withWorkflowApp({
    page,
    testInfo,
    graph: branchGraph,
    run: async () => {
      const editor = workflowEditor(page, testInfo);
      const snapshot = await editor.importGraph(graph);
      const edge = page.locator(
        '.react-flow__edge[aria-label="Edge from A to B"] path.react-flow__edge-interaction'
      );
      await expect(edge).toBeAttached();
      const source = page.locator(
        '.react-flow__node[data-id="A"] .react-flow__handle.source[data-handleid="A-source-right"]'
      );
      const target = page.locator(
        '.react-flow__node[data-id="B"] .react-flow__handle.target[data-handleid="B-target-left"]'
      );
      await expect(source).toBeAttached();
      await expect(target).toBeAttached();
      const renderedEdges = await page
        .locator('.react-flow__edge[aria-label]')
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('aria-label')).sort()
        );
      await testInfo.attach('legacy-direction', {
        body: JSON.stringify({
          relations: editor.tupleSet(snapshot),
          renderedEdges,
          path: await edge.getAttribute('d'),
          source: await source.getAttribute('data-handleid'),
          target: await target.getAttribute('data-handleid')
        }),
        contentType: 'application/json'
      });
      expect(renderedEdges).toEqual([
        'Edge from A to B',
        'Edge from B to C',
        'Edge from Start to A'
      ]);
      expect(editor.tupleSet(snapshot)).toEqual(editor.tupleSet(graph));
    }
  });
});

test(`[${caseId}/C3] 导入后条件回流允许、串行回环拒绝`, async ({ page }, testInfo) => {
  await withWorkflowApp({
    page,
    testInfo,
    graph,
    run: async () => {
      const editor = workflowEditor(page, testInfo);
      for (const [baseline, allowed] of [
        [branchGraph, true],
        [graph, false]
      ] as const) {
        await editor.importGraph(baseline);
        await editor.drag('C', 'A', allowed);
      }
    }
  });
});

test(`[${caseId}/C6] 历史端口的普通边会拒绝重复连接`, async ({ page }, testInfo) => {
  await withWorkflowApp({
    page,
    testInfo,
    graph,
    run: async () => {
      const editor = workflowEditor(page, testInfo);
      await editor.fitCanvas();
      const before = await editor.exportGraph();
      expect(editor.tupleSet(before)).toEqual(editor.tupleSet(graph));
      await editor.drag('A', 'B', false);
    }
  });
});

/** 点击真实线条，避开悬停时显示在连线中部的删除图标。 */
async function selectEdge({
  page,
  source,
  target
}: {
  page: Page;
  source: string;
  target: string;
}) {
  const edge = page.locator(`.react-flow__edge[aria-label="Edge from ${source} to ${target}"]`);
  const path = edge.locator('path.react-flow__edge-interaction');
  await expect(path).toBeAttached();
  const point = await path.evaluate((element: SVGPathElement) => {
    const point = element.getPointAtLength(element.getTotalLength() / 4);
    const screen = point.matrixTransform(element.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.click(point.x, point.y);
  await expect(edge).toHaveClass(/\bselected\b/);
}

for (const variant of [
  { item: 'C4', name: '新旧连线批量删除', retained: ['B'] },
  { item: 'C5', name: '图标删除单条历史连线', retained: ['Start', 'B'] }
]) {
  test(`[${caseId}/${variant.item}] ${variant.name}可撤销`, async ({ page }, testInfo) => {
    await withWorkflowApp({
      page,
      testInfo,
      graph,
      run: async () => {
        const editor = workflowEditor(page, testInfo);
        await editor.fitCanvas();
        const before = await editor.exportGraph();
        expect(editor.tupleSet(before)).toEqual(editor.tupleSet(graph));
        await selectEdge({ page, source: 'A', target: 'B' });

        if (variant.item === 'C4') {
          const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
          await page.keyboard.down(modifier);
          try {
            await selectEdge({ page, source: 'Start', target: 'A' });
          } finally {
            await page.keyboard.up(modifier);
          }
          await expect(page.locator('.react-flow__edge.selected')).toHaveCount(2);
          await page.keyboard.press('Backspace');
        } else {
          await page
            .locator('svg[data-fastgpt-icon-scoped$="-core/workflow/closeEdge"]')
            .filter({ visible: true })
            .click();
        }

        const legacyEdge = page.locator('.react-flow__edge[aria-label="Edge from A to B"]');
        await testInfo.attach('canvas-after-delete', {
          body: JSON.stringify({ remained: await legacyEdge.count() }),
          contentType: 'application/json'
        });
        await expect(legacyEdge).toHaveCount(0);

        const after = await editor.exportGraph();
        await testInfo.attach('delete', {
          body: JSON.stringify({ before: before.edges, after: after.edges }),
          contentType: 'application/json'
        });
        expect(editor.tupleSet(after)).toEqual(
          editor.tupleSet({
            ...graph,
            edges: graph.edges.filter((edge) => variant.retained.includes(edge.source))
          })
        );
        expect(after.nodes.map((node) => node.nodeId)).toEqual(
          before.nodes.map((node) => node.nodeId)
        );

        await page
          .locator('button')
          .filter({ has: page.locator('svg[data-fastgpt-icon-scoped$="-core/workflow/undo"]') })
          .click();
        const restored = await editor.exportGraph();
        await testInfo.attach('undo', {
          body: JSON.stringify({ restored: restored.edges }),
          contentType: 'application/json'
        });
        expect(editor.tupleSet(restored)).toEqual(editor.tupleSet(before));
      }
    });
  });
}
