import { expect, test } from '@playwright/test';
import { CodeNode } from '../../../../../packages/global/core/workflow/template/system/sandbox';
import { buildWorkflowGraph, withWorkflowApp, workflowEditor } from './workflow.browser';

const graph = buildWorkflowGraph(
  ['Start', 'Code', 'Success', 'Legacy', 'Modern'],
  [
    ['Start', 'Code'],
    ['Code', 'Success'],
    ['Code', 'Legacy'],
    ['Code', 'Modern']
  ]
);
graph.nodes[1] = { ...graph.nodes[1], ...CodeNode, name: 'Code', catchError: true };
graph.edges[2] = {
  ...graph.edges[2],
  sourceHandle: 'Code-source_catch-right',
  targetHandle: 'Legacy-target-right'
};
graph.edges[3].sourceHandle = 'Code-source_catch-right';

test('[FG-APP-WORKFLOW-024/C6] 关闭捕获并撤销新旧异常边', async ({ page }, testInfo) => {
  await withWorkflowApp({
    page,
    testInfo,
    graph,
    run: async () => {
      const editor = workflowEditor(page, testInfo);
      await editor.fitCanvas();
      const section = page
        .locator('.react-flow__node[data-id="Code"]')
        .getByText('报错捕获', { exact: true })
        .locator('xpath=..');
      const checkbox = section.getByRole('checkbox');
      const legacy = page.locator('.react-flow__edge[aria-label="Edge from Code to Legacy"]');
      const modern = page.locator('.react-flow__edge[aria-label="Edge from Code to Modern"]');
      await expect(checkbox).toBeChecked();
      await expect(legacy).toBeVisible();
      await expect(modern).toBeVisible();
      const before = await editor.exportGraph();
      expect(editor.tupleSet(before)).toEqual(editor.tupleSet(graph));
      await section.locator('label').click();
      const after = await editor.exportGraph();
      await testInfo.attach('catch-toggle', {
        body: JSON.stringify({ before, after }),
        contentType: 'application/json'
      });
      await expect(checkbox).not.toBeChecked();
      await expect(legacy).toHaveCount(0);
      await expect(modern).toHaveCount(0);
      expect(after.nodes.find(({ nodeId }) => nodeId === 'Code')?.catchError).toBe(false);
      expect(editor.tupleSet(after)).toEqual(editor.tupleSet({ edges: graph.edges.slice(0, 2) }));

      await page
        .locator('button')
        .filter({ has: page.locator('svg[data-fastgpt-icon-scoped$="-core/workflow/undo"]') })
        .click();
      await expect(checkbox).toBeChecked();
      await expect(legacy).toBeVisible();
      await expect(modern).toBeVisible();
      const restored = await editor.exportGraph();
      await testInfo.attach('catch-undo', {
        body: JSON.stringify({ restored }),
        contentType: 'application/json'
      });
      expect(restored.nodes.find(({ nodeId }) => nodeId === 'Code')?.catchError).toBe(true);
      expect(editor.tupleSet(restored)).toEqual(editor.tupleSet(before));
    }
  });
});
