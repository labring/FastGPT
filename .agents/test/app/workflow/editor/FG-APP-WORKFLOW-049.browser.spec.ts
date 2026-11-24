import { test, expect, type Page } from '@playwright/test';
import {
  buildWorkflowGraph,
  canvasBlankPoint,
  withWorkflowApp,
  workflowEditor
} from './workflow.browser';

const id = 'FG-APP-WORKFLOW-049';
const graph = buildWorkflowGraph(
  ['Start', 'A', 'B', 'C', 'Free'],
  [
    ['Start', 'A'],
    ['A', 'B'],
    ['B', 'C']
  ]
);
const output = (page: Page) =>
  page.locator(
    '.react-flow__node[data-id="A"] .react-flow__handle.source[data-handleid="A-source-right"]'
  );
const scale = (page: Page) =>
  page
    .locator('.react-flow__viewport')
    .evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);

/** 在同一屏幕坐标系读取普通出口矩形与 SVG 路径起点。 */
async function geometry(page: Page) {
  const handle = output(page);
  const path = page.locator(
    '.react-flow__edge[aria-label="Edge from A to B"] path.react-flow__edge-interaction'
  );
  await expect(handle).toBeVisible();
  await expect(path).toBeAttached();
  const rect = (await handle.boundingBox())!;
  const { x, y, d } = await path.evaluate((element: SVGPathElement) => {
    const point = element.getPointAtLength(0).matrixTransform(element.getScreenCTM()!);
    return { x: point.x, y: point.y, d: element.getAttribute('d') };
  });
  return {
    rect,
    d,
    screenPosition: { x, y },
    handleId: await handle.getAttribute('data-handleid'),
    transform: await page.locator('.react-flow__viewport').getAttribute('style'),
    delta: { x: Math.abs(x - rect.x - rect.width), y: Math.abs(y - rect.y - rect.height / 2) }
  };
}

for (const item of ['C1', 'C2', 'C3']) {
  test(`[${id}/${item}] 端口几何与原有连线保持`, async ({ page }, testInfo) => {
    await withWorkflowApp({
      page,
      testInfo,
      graph,
      run: async () => {
        const editor = workflowEditor(page, testInfo);
        await editor.fitCanvas();
        const beforeGraph = await editor.exportGraph();
        const before = await geometry(page);
        const edgeLabels = () =>
          page
            .locator('.react-flow__edge[aria-label]')
            .evaluateAll((elements) =>
              elements.map((element) => element.getAttribute('aria-label')).sort()
            );
        const renderedBefore = await edgeLabels();
        let folded: Awaited<ReturnType<typeof geometry>> | undefined;

        if (item === 'C1') {
          await output(page).hover();
        } else if (item === 'C2') {
          await editor.setFolded('A', true);
          const node = page.locator('.react-flow__node[data-id="A"] [data-workflow-node-card]');
          await expect(node).toHaveCSS('width', '240px');
          folded = await geometry(page);
          const { x, y, width, height } = folded.rect;
          const start = { x: x + width / 2, y: y + height / 2 };
          const blank = await canvasBlankPoint(page);
          await page.mouse.move(start.x, start.y);
          await page.mouse.down();
          try {
            await page.mouse.move(blank.x, blank.y, { steps: 10 });
            await expect(page.locator('.react-flow__connection path')).toHaveCount(1);
            await expect(node).not.toHaveCSS('width', '240px');
            const renderedDuring = await edgeLabels();
            await testInfo.attach('during-drag', {
              body: JSON.stringify({ renderedBefore, renderedDuring }),
              contentType: 'application/json'
            });
            expect(renderedDuring).toEqual(renderedBefore);
          } finally {
            await page.mouse.up();
          }
          await expect(page.locator('.react-flow__connection path')).toHaveCount(0);
        } else {
          const zoomBefore = await scale(page);
          const blank = await canvasBlankPoint(page);
          await page.mouse.move(blank.x, blank.y);
          await page.keyboard.down('Control');
          try {
            await page.mouse.wheel(0, -150);
            await expect.poll(() => scale(page)).not.toBe(zoomBefore);
          } finally {
            await page.keyboard.up('Control');
          }
          const zoomed = await geometry(page);
          await testInfo.attach('zoomed', {
            body: JSON.stringify(zoomed),
            contentType: 'application/json'
          });
          expect(zoomed.delta.x).toBeLessThanOrEqual(1);
          expect(zoomed.delta.y).toBeLessThanOrEqual(1);
          await editor.fitCanvas();
          await editor.setFolded('A', true);
          folded = await geometry(page);
          await editor.setFolded('A', false);
        }

        await expect.poll(async () => (await geometry(page)).delta.x).toBeLessThanOrEqual(1);
        const after = await geometry(page);
        const afterGraph = await editor.exportGraph();
        await testInfo.attach('geometry-and-edges', {
          body: JSON.stringify({
            before,
            folded,
            after,
            beforeEdges: beforeGraph.edges,
            afterEdges: afterGraph.edges
          }),
          contentType: 'application/json'
        });
        for (const position of [before, after]) {
          expect(position.delta.x).toBeLessThanOrEqual(1);
          expect(position.delta.y).toBeLessThanOrEqual(1);
          expect(position.handleId).toBe('A-source-right');
        }
        if (item === 'C1') {
          expect(after.rect).toEqual(before.rect);
          expect(after.d).toBe(before.d);
        }
        expect(editor.tupleSet(afterGraph)).toEqual(editor.tupleSet(beforeGraph));
      }
    });
  });
}
