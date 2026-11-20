import { expect, test } from '@playwright/test';
import {
  buildWorkflowGraph,
  canvasBlankPoint,
  withWorkflowApp,
  workflowEditor
} from './workflow.browser';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum
} from '../../../../../packages/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '../../../../../packages/global/core/workflow/node/constant';
import { UserSelectNode } from '../../../../../packages/global/core/workflow/template/system/interactive/userSelect';

test('[FG-APP-WORKFLOW-067/C1] 240 节点工作流缩放、导航和导出', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const ids = ['Start', ...Array.from({ length: 239 }, (_, index) => `N${index + 1}`)];
  const graph = buildWorkflowGraph(
    ids,
    ids.slice(1).map((target, index) => [ids[index], target])
  );
  graph.nodes.forEach((node, index) => {
    node.position = { x: (index % 16) * 540, y: Math.floor(index / 16) * 450 + (index % 2) * 40 };
  });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await withWorkflowApp({
    page,
    testInfo,
    graph,
    run: async () => {
      const editor = workflowEditor(page, testInfo);
      await editor.fitCanvas();
      const before = await editor.exportGraph();
      expect(before.nodes).toHaveLength(240);
      expect(editor.tupleSet(before)).toEqual(editor.tupleSet(graph));

      const viewport = page.locator('.react-flow__viewport');
      const fitTransform = await viewport.getAttribute('style');
      const blank = await page.locator('.react-flow__pane').evaluate((pane) => {
        const rect = pane.getBoundingClientRect();
        const x = rect.x + rect.width * 0.91;
        const y = rect.y + rect.height * 0.16;
        if (document.elementFromPoint(x, y) !== pane) throw new Error('画布右上留白被遮挡');
        return { x, y };
      });
      await page.mouse.click(blank.x, blank.y);
      for (let step = 0; step < 6; step++) await page.keyboard.press('Control+Equal');
      await expect(viewport).not.toHaveAttribute('style', fitTransform ?? '');

      const map = page.getByRole('img', { name: '页面居中' });
      const box = await map.boundingBox();
      if (!box) throw new Error('小地图不可见');
      const frames = page.evaluate(
        () =>
          new Promise<number[]>((resolve) => {
            const times: number[] = [];
            const frame = (now: number) => {
              times.push(now);
              if (times.length < 90) requestAnimationFrame(frame);
              else resolve(times.slice(1).map((time, index) => time - times[index]));
            };
            requestAnimationFrame(frame);
          })
      );
      const observations = [];
      for (const step of [
        { name: 'top-left', x: 0.25, y: 0.16, node: 'Start', edge: 'Edge from Start to N1' },
        { name: 'bottom-right', x: 0.75, y: 0.84, node: 'N239', edge: 'Edge from N238 to N239' },
        { name: 'return', x: 0.25, y: 0.16, node: 'Start', edge: 'Edge from Start to N1' }
      ]) {
        await map.click({
          position: { x: box.width * step.x, y: box.height * step.y }
        });
        await expect(page.locator(`.react-flow__node[data-id="${step.node}"]`)).toBeInViewport();
        await expect(page.locator(`.react-flow__edge[aria-label="${step.edge}"]`)).toBeVisible();
        const mounted = await page
          .locator('.react-flow__node')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-id')));
        const transform = await viewport.getAttribute('style');
        await testInfo.attach(step.name, {
          body: await page.screenshot(),
          contentType: 'image/png'
        });
        observations.push({ name: step.name, mounted, transform });
        expect(mounted.length).toBeLessThan(ids.length);
      }
      expect(observations[0].mounted).not.toContain('N239');
      expect(observations[1].mounted).not.toContain('Start');

      await editor.fitCanvas();
      const after = await editor.exportGraph();
      const positions = (input: typeof graph) =>
        input.nodes.map(({ nodeId, position }) => [nodeId, position]);
      const frameIntervals = await frames;
      const sorted = frameIntervals.slice().sort((a, b) => a - b);
      await testInfo.attach('viewport-observations', {
        body: JSON.stringify({
          observations,
          frameIntervals,
          p95FrameIntervalMs: sorted[Math.ceil(sorted.length * 0.95) - 1],
          pageErrors,
          before: { positions: positions(before), edges: editor.tupleSet(before) },
          after: { positions: positions(after), edges: editor.tupleSet(after) }
        }),
        contentType: 'application/json'
      });
      expect(positions(after)).toEqual(positions(before));
      expect(editor.tupleSet(after)).toEqual(editor.tupleSet(before));
      expect(pageErrors).toEqual([]);
    }
  });
});

test('[FG-APP-WORKFLOW-067/C2] 贴右的多选引用菜单仍可点击第二列', async ({ page }, testInfo) => {
  const width = 920;
  await page.setViewportSize({ width, height: 820 });
  const graph = buildWorkflowGraph(
    ['Start', 'Producer', 'Picker'],
    [
      ['Start', 'Producer'],
      ['Producer', 'Picker']
    ]
  );
  const sourceLabel = 'Source with a long workflow node name';
  graph.nodes[1].name = sourceLabel;
  graph.nodes[2] = {
    ...graph.nodes[2],
    ...UserSelectNode,
    name: 'Picker',
    inputs: UserSelectNode.inputs.map((input) =>
      input.key === NodeInputKeyEnum.userSelectOptions
        ? { ...input, selectedType: FlowNodeInputTypeEnum.reference, value: [] }
        : input
    )
  };
  await withWorkflowApp({
    page,
    testInfo,
    graph,
    run: async () => {
      const editor = workflowEditor(page, testInfo);
      await editor.fitCanvas();
      const trigger = page
        .locator('.react-flow__node[data-id="Picker"]')
        .getByRole('button', { name: '请选择变量', exact: true });
      const bounds = await trigger.boundingBox();
      if (!bounds) throw new Error('多选引用入口不可见');
      const blank = await canvasBlankPoint(page);
      await page.mouse.move(blank.x, blank.y);
      await page.mouse.down();
      await page.mouse.move(blank.x + width - 24 - bounds.x - bounds.width, blank.y, { steps: 8 });
      await page.mouse.up();
      await expect
        .poll(async () => {
          const box = await trigger.boundingBox();
          return box ? Math.abs(width - 24 - box.x - box.width) : Infinity;
        })
        .toBeLessThan(6);

      await trigger.click();
      await page.getByRole('menuitem', { name: sourceLabel, exact: true }).click();
      const output = page.getByRole('menuitemcheckbox', { name: '拼接结果', exact: true });
      await expect(output).toBeInViewport({ ratio: 0.99 });
      await testInfo.attach('reference-menu-at-right-edge', {
        body: await page.screenshot(),
        contentType: 'image/png'
      });
      await output.click();
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1600, height: 1000 });
      const savedOptions = (await editor.exportGraph()).nodes
        .find(({ nodeId }) => nodeId === 'Picker')
        ?.inputs.find(({ key }) => key === NodeInputKeyEnum.userSelectOptions)?.value;
      expect(savedOptions).toEqual([['Producer', NodeOutputKeyEnum.text]]);
    }
  });
});
