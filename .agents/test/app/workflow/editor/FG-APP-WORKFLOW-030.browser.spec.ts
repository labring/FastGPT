import { test, expect } from '@playwright/test';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../../../packages/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  LoopRunModeEnum
} from '../../../../../packages/global/core/workflow/node/constant';
import { AssignedAnswerModule } from '../../../../../packages/global/core/workflow/template/system/assignedAnswer';
import { LoopRunNode } from '../../../../../packages/global/core/workflow/template/system/loopRun/loopRun';
import { LoopRunStartNode } from '../../../../../packages/global/core/workflow/template/system/loopRun/loopRunStart';
import { LoopRunBreakNode } from '../../../../../packages/global/core/workflow/template/system/loopRun/loopRunBreak';
import { CodeNode } from '../../../../../packages/global/core/workflow/template/system/sandbox';
import { LoopStartNode } from '../../../../../packages/global/core/workflow/template/system/loop/loopStart';
import { LoopEndNode } from '../../../../../packages/global/core/workflow/template/system/loop/loopEnd';
import { ParallelRunNode } from '../../../../../packages/global/core/workflow/template/system/parallelRun/parallelRun';
import { UserSelectNode } from '../../../../../packages/global/core/workflow/template/system/interactive/userSelect';
import type { FlowNodeTemplateType } from '../../../../../packages/global/core/workflow/type/node';
import {
  buildWorkflowGraph,
  withWorkflowApp,
  workflowEditor,
  type Graph
} from './workflow.browser';
import { attachJson, publishPath, responseData, webHeaders } from './workflow-persistence.browser';

const graph = buildWorkflowGraph(
  ['Start', 'Loop', 'Exit', 'Loop-Start', 'L1', 'L-Break'],
  [
    ['Start', 'Loop'],
    ['Loop', 'Exit'],
    ['Loop-Start', 'L1'],
    ['L1', 'L-Break']
  ]
);
graph.nodes[1] = {
  ...graph.nodes[1],
  ...LoopRunNode,
  inputs: structuredClone(LoopRunNode.inputs),
  name: 'Loop'
};
const loopInputs = graph.nodes[1].inputs;
loopInputs.find((input) => input.key === NodeInputKeyEnum.childrenNodeIdList)!.value = ['stale'];
loopInputs.find((input) => input.key === NodeInputKeyEnum.loopRunMode)!.value =
  LoopRunModeEnum.conditional;
graph.nodes[3] = { ...graph.nodes[3], ...structuredClone(LoopRunStartNode), name: 'Loop-Start' };
graph.nodes[3].inputs.find((input) => input.key === NodeInputKeyEnum.loopRunMode)!.value =
  LoopRunModeEnum.conditional;
graph.nodes[5] = { ...graph.nodes[5], ...LoopRunBreakNode, name: 'L-Break' };
for (const node of graph.nodes.slice(3)) node.parentNodeId = 'Loop';

const children = ({ nodes }: Pick<Graph, 'nodes'>) =>
  nodes
    .find(({ nodeId }) => nodeId === 'Loop')
    ?.inputs.find(({ key }) => key === NodeInputKeyEnum.childrenNodeIdList)?.value;
const childIds = ['L-Break', 'L1', 'Loop-Start'];

test('[FG-APP-WORKFLOW-030/C10] 正式执行读取循环内捕获的错误', async ({ page }, testInfo) => {
  const marker = 'fg-caught-in-loop';
  const output = { key: 'caught', label: 'Caught', valueType: WorkflowIOValueTypeEnum.string };
  const loopGraph = buildWorkflowGraph(
    ['Start', 'Loop', 'Reply', 'Loop-Start', 'Code', 'Caught'],
    [
      ['Start', 'Loop'],
      ['Loop', 'Reply'],
      ['Loop-Start', 'Code'],
      ['Code', 'Caught']
    ]
  );
  loopGraph.nodes[1] = {
    ...loopGraph.nodes[1],
    ...LoopRunNode,
    inputs: [
      ...LoopRunNode.inputs.map((input) => {
        if (input.key === NodeInputKeyEnum.loopRunInputArray) return { ...input, value: [1] };
        if (input.key === NodeInputKeyEnum.childrenNodeIdList) {
          return { ...input, value: ['Loop-Start', 'Code', 'Caught'] };
        }
        return input;
      }),
      {
        ...output,
        canEdit: true,
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        value: ['Code', NodeOutputKeyEnum.error]
      }
    ],
    outputs: [
      ...LoopRunNode.outputs,
      { ...output, id: output.key, type: FlowNodeOutputTypeEnum.dynamic }
    ]
  };
  loopGraph.nodes[2] = {
    ...loopGraph.nodes[2],
    ...AssignedAnswerModule,
    inputs: AssignedAnswerModule.inputs.map((input) => ({
      ...input,
      selectedType: FlowNodeInputTypeEnum.reference,
      value: ['Loop', output.key]
    }))
  };
  loopGraph.nodes[3] = { ...loopGraph.nodes[3], ...LoopRunStartNode, parentNodeId: 'Loop' };
  loopGraph.nodes[4] = {
    ...loopGraph.nodes[4],
    ...CodeNode,
    parentNodeId: 'Loop',
    catchError: true,
    inputs: CodeNode.inputs
      .filter(({ key }) => key !== 'data1' && key !== 'data2')
      .map((input) =>
        input.key === NodeInputKeyEnum.code
          ? { ...input, value: `function main() { throw new Error('${marker}'); }` }
          : input
      ),
    outputs: CodeNode.outputs.filter(({ key }) => key === NodeOutputKeyEnum.error)
  };
  loopGraph.nodes[5].parentNodeId = 'Loop';
  loopGraph.edges.find(({ source }) => source === 'Code')!.sourceHandle = 'Code-source_catch-right';

  await withWorkflowApp({
    page,
    testInfo,
    graph: loopGraph,
    run: async (appId) => {
      const loaded = await workflowEditor(page, testInfo).exportGraph();
      const customOutput = loaded.nodes
        .find(({ nodeId }) => nodeId === 'Loop')
        ?.inputs.find(({ key }) => key === output.key)?.value;
      expect(customOutput).toEqual(['Code', NodeOutputKeyEnum.error]);
      await responseData(
        await page.request.post(publishPath, {
          params: { appId },
          headers: webHeaders,
          data: { ...loaded, isPublish: true }
        })
      );
      const response = await page.request.post('/api/v2/chat/completions', {
        headers: webHeaders,
        data: { appId, messages: [{ role: 'user', content: 'Run caught loop' }], stream: false }
      });
      expect(response.status()).toBe(200);
      const { choices } = await response.json();
      const content = choices[0].message.content;
      await attachJson({ testInfo, name: 'caught-loop-output', data: { customOutput, content } });
      expect(content).toContain(marker);
    }
  });
});

test('[FG-APP-WORKFLOW-030/C9] 空父级的历史根节点可拖入循环并撤销', async ({ page }, testInfo) => {
  const loose = buildWorkflowGraph(['Loose'], []).nodes[0];
  const legacy = {
    ...graph,
    nodes: [...graph.nodes, { ...loose, parentNodeId: '', position: { x: 2500, y: 0 } }]
  };
  const rootParent = ({ nodes }: Pick<Graph, 'nodes'>) =>
    nodes.find(({ nodeId }) => nodeId === 'Loose')?.parentNodeId;

  await withWorkflowApp({
    page,
    testInfo,
    graph: legacy,
    run: async (appId) => {
      const original = await responseData<Graph>(
        await page.request.get('/api/core/app/detail', { params: { appId }, headers: webHeaders })
      );
      expect(rootParent(original)).toBe('');

      const editor = workflowEditor(page, testInfo);
      await editor.fitCanvas();
      const card = page.locator('.react-flow__node[data-id="Loose"]');
      const container = page.locator(
        '.react-flow__node[data-id="Loop"] [data-workflow-container-content="true"]'
      );
      const title = card.getByText('Loose', { exact: true });
      await expect(title).toBeInViewport();
      await expect(container).toBeInViewport();
      const before = await editor.exportGraph();
      await title.hover();
      const source = (await title.boundingBox())!;
      const target = (await container.boundingBox())!;
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down();
      await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
        steps: 18
      });
      await page.mouse.up();

      const after = await editor.exportGraph();
      expect(rootParent(after)).toBe('Loop');
      expect(editor.tupleSet(after)).toEqual(editor.tupleSet(before));
      const undo = page.locator('button').filter({
        has: page.locator('svg[data-fastgpt-icon-scoped$="-core/workflow/undo"]')
      });
      await undo.click();
      const reverted = await editor.exportGraph();
      expect(rootParent(reverted)).toBeUndefined();
      expect(reverted.nodes.find(({ nodeId }) => nodeId === 'Loose')?.position).toEqual(
        before.nodes.find(({ nodeId }) => nodeId === 'Loose')?.position
      );
      await attachJson({
        testInfo,
        name: 'legacy-root-drag',
        data: {
          originalParent: rootParent(original),
          attachedParent: rootParent(after),
          restoredAsRoot: rootParent(reverted) === undefined,
          relations: editor.tupleSet(reverted)
        }
      });
    }
  });
});

const scopeNodes: [string, number, number, FlowNodeTemplateType?, string?][] = [
  ['Start', 0, 0],
  ['Outer', 0, 570],
  ['Loop', 780, 0, LoopRunNode],
  ['Loop-Start', 870, 190, LoopRunStartNode, 'Loop'],
  ['L1', 1490, 190, undefined, 'Loop'],
  ['L2', 2110, 190, undefined, 'Loop'],
  ['L3', 1490, 750, undefined, 'Loop'],
  ['L-Break', 2110, 750, LoopRunBreakNode, 'Loop'],
  ['Parallel', 2850, 0, ParallelRunNode],
  ['P-Start', 2940, 190, LoopStartNode, 'Parallel'],
  ['P1', 3560, 190, undefined, 'Parallel'],
  ['P2', 4180, 190, undefined, 'Parallel'],
  ['P-End', 4800, 190, LoopEndNode, 'Parallel'],
  ['P3', 3560, 750, undefined, 'Parallel'],
  ['P-Select', 4180, 750, UserSelectNode, 'Parallel']
];
const scopeGraph = buildWorkflowGraph(
  scopeNodes.map(([id]) => id),
  [
    ['Start', 'Loop'],
    ['Loop', 'Parallel'],
    ['Loop-Start', 'L1'],
    ['L1', 'L2'],
    ['P-Start', 'P1'],
    ['P1', 'P2'],
    ['P2', 'P-End']
  ]
);
scopeGraph.nodes = scopeGraph.nodes.map((node, index) => {
  const [id, x, y, template, parentNodeId] = scopeNodes[index];
  return { ...node, ...template, name: id, position: { x, y }, parentNodeId };
});

const scopeScenarios: [string, [string, string, boolean][]][] = [
  [
    'C1',
    [
      ['Outer', 'L1', false],
      ['Outer', 'P3', false],
      ['Outer', 'Loop', true],
      ['Outer', 'Parallel', true]
    ]
  ],
  [
    'C2',
    [
      ['L1', 'L3', true],
      ['L1', 'L-Break', true]
    ]
  ],
  ['C3', [['P1', 'P3', true]]],
  [
    'C4',
    [
      ['L1', 'Outer', false],
      ['L1', 'P3', false]
    ]
  ],
  ['C5', [['P1', 'P-Select', false]]]
];
for (const [item, checks] of scopeScenarios) {
  test(`[FG-APP-WORKFLOW-030/${item}] 容器作用域及节点限制`, async ({ page }, testInfo) => {
    await withWorkflowApp({
      page,
      testInfo,
      graph,
      run: async () => {
        const editor = workflowEditor(page, testInfo);
        await editor.importGraph(scopeGraph);
        for (const [index, [source, target, allowed]] of checks.entries()) {
          if (item === 'C1' && index > 0) await editor.importGraph(scopeGraph);
          await test.step(`${source} → ${target}`, () => editor.drag(source, target, allowed));
        }
      }
    });
  });
}

test('[FG-APP-WORKFLOW-030/C6] 首次载入修复旧子节点清单并可运行、保存', async ({
  page
}, testInfo) => {
  await withWorkflowApp({
    page,
    testInfo,
    graph,
    run: async (appId) => {
      const response = await page.request.get(`/api/core/app/detail?appId=${appId}`, {
        headers: { 'fastgpt-web-request': '1' }
      });
      expect(response.status()).toBe(200);
      const detail = await response.json();
      expect(detail.code).toBe(200);
      await testInfo.attach('legacy-detail', {
        body: JSON.stringify({
          appId,
          teamId: detail.data.teamId,
          children: children(detail.data)
        }),
        contentType: 'application/json'
      });
      expect(children(detail.data)).toEqual(['stale']);

      const editor = workflowEditor(page, testInfo);
      await editor.fitCanvas();
      const assertRepaired = (result: Graph) => {
        expect([...children(result)].sort()).toEqual(childIds);
        expect(
          result.nodes
            .filter((node) => node.parentNodeId === 'Loop')
            .map((node) => node.nodeId)
            .sort()
        ).toEqual(childIds);
        expect(editor.tupleSet(result)).toEqual(editor.tupleSet(graph));
      };
      const loaded = await editor.exportGraph();
      await testInfo.attach('initial-export', {
        body: JSON.stringify(loaded),
        contentType: 'application/json'
      });
      assertRepaired(loaded);
      const saveStatus = page.getByText('已保存', { exact: true });
      const undo = page.locator('button').filter({
        has: page.locator('svg[data-fastgpt-icon-scoped$="-core/workflow/undo"]')
      });
      const initialState = {
        saved: await saveStatus.isVisible(),
        undoEnabled: await undo.isEnabled()
      };
      if (initialState.undoEnabled) {
        await undo.click();
        await testInfo.attach('unexpected-initial-undo', {
          body: JSON.stringify({ initialState, before: loaded, after: await editor.exportGraph() }),
          contentType: 'application/json'
        });
      }
      expect(initialState).toEqual({ saved: true, undoEnabled: false });

      await page.getByRole('button', { name: '运行', exact: true }).click();
      const preview = page.getByRole('separator', { name: '调整调试面板宽度', exact: true });
      await expect(preview).toBeInViewport();
      await page.keyboard.press('Escape');
      await expect(preview).not.toBeInViewport();

      const save = page.getByRole('button', { name: '保存', exact: true });
      await save.hover();
      await page.getByText('保存并发布', { exact: true }).click();
      const publish = page.getByRole('dialog').filter({
        has: page.getByText('保存并发布', { exact: true })
      });
      await expect(publish).toBeVisible();
      await publish.getByRole('button', { name: '取消', exact: true }).click();
      await expect(publish).toBeHidden();

      await save.hover();
      const pending = page.waitForResponse((res) => {
        const url = new URL(res.url());
        return (
          res.request().method() === 'POST' &&
          url.pathname === '/api/core/app/version/publish' &&
          url.searchParams.get('appId') === appId
        );
      });
      await page.getByText('仅保存', { exact: true }).click();
      const saved = await pending;
      const payload = saved.request().postDataJSON();
      const body = await saved.json();
      await testInfo.attach('save-result', {
        body: JSON.stringify({
          request: { children: children(payload), isPublish: payload.isPublish },
          http: saved.status(),
          code: body.code
        }),
        contentType: 'application/json'
      });
      assertRepaired(payload);
      expect(payload.isPublish).not.toBe(true);
      expect(saved.status()).toBe(200);
      expect(body.code).toBe(200);

      await page.reload();
      const reloaded = await editor.exportGraph();
      await testInfo.attach('reload-export', {
        body: JSON.stringify(reloaded),
        contentType: 'application/json'
      });
      assertRepaired(reloaded);
    }
  });
});

for (const scenario of [
  { caseId: 'C7', title: '历史循环字面量按原顺序正式执行', legacyMembership: false },
  { caseId: 'C8', title: '只有旧成员清单的循环子节点读取外层输出', legacyMembership: true }
]) {
  test(`[FG-APP-WORKFLOW-030/${scenario.caseId}] ${scenario.title}`, async ({ page }, testInfo) => {
    const { legacyMembership } = scenario;
    const values = ['first', 'second'];
    const childIds = ['Loop-Start', 'Reply'];
    const legacy = buildWorkflowGraph(
      ['Start', ...(legacyMembership ? ['Outer'] : []), 'Loop', ...childIds],
      [
        ...(legacyMembership
          ? ([
              ['Start', 'Outer'],
              ['Outer', 'Loop']
            ] satisfies [string, string][])
          : ([['Start', 'Loop']] satisfies [string, string][])),
        ['Loop-Start', 'Reply']
      ]
    );
    if (legacyMembership) {
      legacy.nodes[1].inputs.find(({ key }) => key === NodeInputKeyEnum.textareaInput)!.value =
        'outer-value';
    }
    const loopIndex = legacyMembership ? 2 : 1;
    legacy.nodes[loopIndex] = {
      ...legacy.nodes[loopIndex],
      ...LoopRunNode,
      inputs: LoopRunNode.inputs.map((input) => {
        if (input.key === NodeInputKeyEnum.loopRunInputArray) return { ...input, value: values };
        if (input.key === NodeInputKeyEnum.childrenNodeIdList) return { ...input, value: childIds };
        return input;
      })
    };
    const childParentId = legacyMembership ? undefined : 'Loop';
    legacy.nodes[loopIndex + 1] = {
      ...legacy.nodes[loopIndex + 1],
      ...LoopRunStartNode,
      parentNodeId: childParentId
    };
    legacy.nodes[loopIndex + 2] = {
      ...legacy.nodes[loopIndex + 2],
      ...AssignedAnswerModule,
      parentNodeId: childParentId,
      inputs: AssignedAnswerModule.inputs.map((input) => ({
        ...input,
        selectedType: FlowNodeInputTypeEnum.reference,
        value: legacyMembership
          ? ['Outer', NodeOutputKeyEnum.text]
          : ['Loop-Start', NodeOutputKeyEnum.currentItem]
      }))
    };
    const storedArray = ({ nodes }: Graph) =>
      nodes
        .find(({ nodeId }) => nodeId === 'Loop')
        ?.inputs.find(({ key }) => key === NodeInputKeyEnum.loopRunInputArray)?.value;

    await withWorkflowApp({
      page,
      testInfo,
      graph: legacy,
      run: async (appId) => {
        // 旧成员清单需要按历史形状写入，编辑器重新编排会以当前父级字段为准。
        const loaded = legacyMembership
          ? legacy
          : await workflowEditor(page, testInfo).exportGraph();
        expect(storedArray(loaded)).toEqual(values);

        await responseData(
          await page.request.post(publishPath, {
            params: { appId },
            headers: webHeaders,
            data: { ...loaded, isPublish: true }
          })
        );
        const published = await responseData<Graph>(
          await page.request.get('/api/core/app/version/latest', {
            params: { appId },
            headers: webHeaders
          })
        );
        expect(storedArray(published)).toEqual(values);
        const parentIds = published.nodes
          .filter(({ nodeId }) => childIds.includes(nodeId))
          .map(({ parentNodeId }) => parentNodeId);
        expect(parentIds).toEqual([childParentId, childParentId]);
        expect(children(published)).toEqual(childIds);

        const response = await page.request.post('/api/v2/chat/completions', {
          headers: webHeaders,
          data: { appId, messages: [{ role: 'user', content: 'Run legacy loop' }], stream: false }
        });
        expect(response.status()).toBe(200);
        const { choices } = await response.json();
        const content = choices[0].message.content;
        await attachJson({
          testInfo,
          name: 'published-legacy-loop',
          data: {
            input: storedArray(loaded),
            persisted: storedArray(published),
            childIds: children(published),
            parentIds,
            content
          }
        });
        expect(content.trim().split(/\s+/)).toEqual(
          legacyMembership ? ['outer-value', 'outer-value'] : values
        );
      }
    });
  });
}
