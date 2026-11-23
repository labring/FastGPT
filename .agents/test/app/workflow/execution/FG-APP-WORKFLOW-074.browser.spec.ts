import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../../../packages/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '../../../../../packages/global/core/workflow/node/constant';
import { ChatRoleEnum } from '../../../../../packages/global/core/chat/constants';
import { type WorkflowDebugResponse } from '../../../../../packages/global/openapi/core/workflow/api';
import {
  UserSelectNode,
  USER_SELECT_REFERENCE_HANDLE_KEY
} from '../../../../../packages/global/core/workflow/template/system/interactive/userSelect';
import { IfElseNode } from '../../../../../packages/global/core/workflow/template/system/ifElse';
import { FormInputNode } from '../../../../../packages/global/core/workflow/template/system/interactive/formInput';
import { CodeNode } from '../../../../../packages/global/core/workflow/template/system/sandbox';
import { VariableConditionEnum } from '../../../../../packages/global/core/workflow/template/system/ifElse/constant';
import { buildWorkflowGraph, workflowEditor } from '../editor/workflow.browser';
import {
  attachJson,
  openEditor,
  responseData,
  test,
  webHeaders
} from '../editor/workflow-persistence.browser';

const caseId = 'FG-APP-WORKFLOW-074';
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const result = (node: Locator) => node.getByText('运行结果', { exact: true });
const branchOption = 'Continue after ELSE';

const makeGraph = (variant: 'linear' | 'interactive' | 'legacy' | 'legacy-branch') => {
  const interactive = variant === 'interactive';
  const legacy = variant === 'legacy' || variant === 'legacy-branch';
  const graph = interactive
    ? buildWorkflowGraph(
        ['Start', 'Source', 'Choice', 'Tail'],
        [
          ['Start', 'Source'],
          ['Source', 'Choice'],
          ['Choice', 'Tail']
        ]
      )
    : legacy
      ? buildWorkflowGraph(
          ['Start', 'A', 'B', 'C'],
          [
            ['Start', 'A'],
            ['A', 'B'],
            ['B', 'C']
          ]
        )
      : buildWorkflowGraph(
          ['Start', 'A', 'B'],
          [
            ['Start', 'A'],
            ['A', 'B']
          ]
        );
  if (interactive) {
    const { inputs, outputs, flowNodeType } = UserSelectNode;
    graph.nodes[2] = {
      ...graph.nodes[2],
      flowNodeType,
      inputs: inputs.map((input) =>
        input.key === NodeInputKeyEnum.userSelectOptions
          ? {
              ...input,
              selectedType: FlowNodeInputTypeEnum.reference,
              value: [['Source', 'system_text']]
            }
          : input
      ),
      outputs
    };
    graph.edges[2].sourceHandle = 'Choice-source-' + USER_SELECT_REFERENCE_HANDLE_KEY;
  }
  if (legacy) graph.edges[2].targetHandle = 'C-target-right';
  if (variant === 'legacy-branch') {
    graph.nodes[2] = {
      ...graph.nodes[2],
      flowNodeType: IfElseNode.flowNodeType,
      outputs: IfElseNode.outputs,
      inputs: IfElseNode.inputs.map((input) =>
        input.key === NodeInputKeyEnum.ifElseList
          ? {
              ...input,
              value: [
                {
                  condition: 'AND',
                  list: [
                    {
                      variable: ['A', NodeOutputKeyEnum.text],
                      condition: VariableConditionEnum.equalTo,
                      value: 'IF only',
                      valueType: 'input'
                    }
                  ]
                }
              ]
            }
          : input
      )
    };
    graph.nodes[3] = {
      ...graph.nodes[3],
      flowNodeType: UserSelectNode.flowNodeType,
      outputs: UserSelectNode.outputs,
      inputs: UserSelectNode.inputs.map((input) =>
        input.key === NodeInputKeyEnum.userSelectOptions
          ? {
              ...input,
              selectedType: FlowNodeInputTypeEnum.custom,
              value: [{ key: 'continue', value: branchOption }]
            }
          : input
      )
    };
    graph.edges[2].sourceHandle = 'B-source-IF';
    graph.edges.push({
      ...graph.edges[2],
      sourceHandle: 'B-source-ELSE',
      targetHandle: 'C-target-left'
    });
  }
  return graph;
};

const openCanvas = async (page: Page, appId: string) => {
  await openEditor(page, appId);
  await expect(node(page, 'Start')).toBeVisible({ timeout: 30_000 });
  await page.locator('.custom-workflow-fix_view').click({ timeout: 10_000 });
};

const runStep = async ({
  page,
  testInfo,
  label,
  button
}: {
  page: Page;
  testInfo: TestInfo;
  label: string;
  button: Locator;
}) => {
  const pending = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/core/workflow/debug' &&
      response.request().method() === 'POST',
    { timeout: 30_000 }
  );
  await button.click();
  const response = await pending;
  const request = response.request().postDataJSON();
  const body = await response.json();
  await attachJson({ testInfo, name: label, data: { request, http: response.status(), body } });
  expect(response.status()).toBe(200);
  expect(body.code).toBe(200);
  expect(request.chatId).toEqual(expect.any(String));
  expect(request.chatId).not.toBe('');
  return { request, data: body.data as WorkflowDebugResponse };
};

const openDebug = async (page: Page, entry: Locator) => {
  await entry.hover();
  await entry.getByRole('button', { name: '调试', exact: true }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Debug 调试' });
  await expect(dialog).toBeVisible();
  return dialog;
};

test.use({ graph: makeGraph('linear') });

test(`[${caseId}/C6] 同一步的选择和表单分别续跑`, async ({ app, request }, testInfo) => {
  const graph = buildWorkflowGraph(
    ['Start', 'Choice', 'Form'],
    [
      ['Start', 'Choice'],
      ['Start', 'Form']
    ]
  );
  graph.nodes[1] = {
    ...graph.nodes[1],
    ...UserSelectNode,
    inputs: UserSelectNode.inputs.map((input) =>
      input.key === NodeInputKeyEnum.userSelectOptions
        ? {
            ...input,
            selectedType: FlowNodeInputTypeEnum.custom,
            value: [{ key: 'one', value: 'One' }]
          }
        : input
    )
  };
  graph.nodes[2] = {
    ...graph.nodes[2],
    ...FormInputNode,
    inputs: FormInputNode.inputs.map((input) =>
      input.key === NodeInputKeyEnum.userInputForms
        ? {
            ...input,
            value: [
              {
                key: 'answer',
                label: 'Answer',
                type: FlowNodeInputTypeEnum.input,
                valueType: WorkflowIOValueTypeEnum.string,
                required: true,
                value: ''
              }
            ]
          }
        : input
    )
  };
  const run = async (data: object) =>
    responseData<WorkflowDebugResponse>(
      await request.post('/api/core/workflow/debug', {
        headers: webHeaders,
        data: { ...data, appId: app._id, chatId: `two-cards-${app._id}` }
      })
    );
  const step = (previous: WorkflowDebugResponse, answer?: { id: string; text: string }) =>
    run({
      nodes: previous.memoryNodes.map((node) => ({
        ...node,
        isEntry: previous.entryNodeIds.includes(node.nodeId)
      })),
      edges: previous.memoryEdges,
      skipNodeQueue: previous.skipNodeQueue,
      usageId: previous.usageId,
      ...(answer && {
        query: [{ text: { content: answer.text } }],
        history: [
          {
            obj: ChatRoleEnum.AI,
            value: [
              {
                interactive: {
                  ...previous.nodeResponses[answer.id].interactiveResponse,
                  entryNodeIds: [answer.id],
                  memoryEdges: [],
                  nodeOutputs: []
                }
              }
            ]
          }
        ]
      })
    });
  const started = await run({
    nodes: graph.nodes.map((node) => ({ ...node, isEntry: node.nodeId === 'Start' })),
    edges: graph.edges.map((edge) => ({ ...edge, status: 'waiting' }))
  });
  const paused = await step(started);
  expect(paused.entryNodeIds.toSorted()).toEqual(['Choice', 'Form']);
  expect(paused.memoryEdges.map(({ status }) => status)).toEqual(['active', 'active']);
  expect(paused.nodeResponses.Choice.interactiveResponse?.type).toBe('userSelect');
  expect(paused.nodeResponses.Form.interactiveResponse?.type).toBe('userInput');
  const selected = await step(paused, { id: 'Choice', text: 'One' });
  expect(selected.nodeResponses.Choice.response?.userSelectResult).toBe('One');
  expect(selected.nodeResponses.Form.interactiveResponse?.type).toBe('userInput');
  expect(selected.entryNodeIds).toEqual(['Form']);
  const completed = await step(selected, { id: 'Form', text: JSON.stringify({ answer: 'Done' }) });
  expect(completed.nodeResponses.Form.response?.formInputResult).toEqual({ answer: 'Done' });
  expect(completed.entryNodeIds).toEqual([]);
  await attachJson({
    testInfo,
    name: 'parallel-interactive-steps',
    data: { paused, selected, completed }
  });
});

test(`[${caseId}/C5] 校验旧调试字面量、手填值与文档引用`, async ({ app, request }, testInfo) => {
  const variants = [
    { label: 'legacy', marker: {}, expected: 'removed/result' },
    { label: 'literal', marker: { debugValueOverride: true }, expected: 'removed/result' },
    { label: 'reference', marker: { debugValueOverride: false }, expected: 'empty' },
    { label: 'invalid', marker: { debugValueOverride: 'true' as const }, expected: undefined }
  ];
  for (const { label, marker, expected } of variants) {
    const probe = {
      ...CodeNode,
      nodeId: 'Probe',
      isEntry: true,
      inputs: CodeNode.inputs
        .filter(({ key }) => key !== 'data2')
        .map((input) => {
          if (input.key === 'data1') {
            return {
              ...input,
              valueType: WorkflowIOValueTypeEnum.arrayString,
              value: ['removed', 'result'],
              ...marker
            };
          }
          if (input.key === NodeInputKeyEnum.code) {
            return {
              ...input,
              value:
                "function main({ data1 }) { return { result: Array.isArray(data1) ? data1.join('/') : 'empty' }; }"
            };
          }
          return input;
        }),
      outputs: CodeNode.outputs.filter(({ key }) => key === 'result')
    };
    const response = await request.post('/api/core/workflow/debug', {
      headers: webHeaders,
      data: { appId: app._id, nodes: [probe], edges: [] }
    });
    if (expected === undefined) {
      const body = await response.json();
      await attachJson({ testInfo, name: label, data: { marker, http: response.status(), body } });
      expect({ http: response.status(), code: body.code }).toEqual({ http: 400, code: 400 });
      continue;
    }
    const result = (await responseData<WorkflowDebugResponse>(response)).nodeResponses.Probe;
    expect(result).toMatchObject({
      type: 'run',
      response: { customOutputs: { result: expected } }
    });
    await attachJson({
      testInfo,
      name: label,
      data: { marker, response: result, http: response.status() }
    });
  }
});

test.describe('动态选项切换', () => {
  const graph = buildWorkflowGraph(
    ['Start', 'Choice', 'A', 'B', 'C'],
    [
      ['Start', 'Choice'],
      ['Choice', 'A'],
      ['Choice', 'B'],
      ['Choice', 'C']
    ]
  );
  graph.nodes[1] = {
    ...graph.nodes[1],
    flowNodeType: UserSelectNode.flowNodeType,
    outputs: UserSelectNode.outputs,
    inputs: UserSelectNode.inputs.map((input) =>
      input.key === NodeInputKeyEnum.userSelectOptions
        ? {
            ...input,
            selectedType: FlowNodeInputTypeEnum.custom,
            value: [
              { key: 'first', value: 'First' },
              { key: 'second', value: 'Second' }
            ]
          }
        : input
    )
  };
  graph.edges[1].sourceHandle = 'Choice-source-first';
  graph.edges[2].sourceHandle = 'Choice-source-first';
  graph.edges[3].sourceHandle = 'Choice-source-second';
  test.use({ graph });

  test(`[${caseId}/C4] 切换选项模式迁移同一出口的全部连线并支持撤销`, async ({
    app,
    page
  }, info) => {
    await openCanvas(page, app._id);
    const editor = workflowEditor(page, info);
    const before = await editor.exportGraph();
    await node(page, 'Choice').getByRole('button', { name: '手动输入', exact: true }).click();
    await page.getByRole('menuitem', { name: '变量引用', exact: true }).click();
    const switched = await editor.exportGraph();
    const expected = graph.edges
      .slice(0, 3)
      .map((edge) =>
        edge.source === 'Choice'
          ? { ...edge, sourceHandle: 'Choice-source-' + USER_SELECT_REFERENCE_HANDLE_KEY }
          : edge
      );
    expect(editor.tupleSet(switched)).toEqual(editor.tupleSet({ edges: expected }));

    await page
      .getByRole('button')
      .filter({ has: page.locator('svg[data-fastgpt-icon-scoped$="-core/workflow/undo"]') })
      .click();
    const restored = await editor.exportGraph();
    expect(restored.nodes).toEqual(before.nodes);
    expect(editor.tupleSet(restored)).toEqual(editor.tupleSet(before));
    await attachJson({
      testInfo: info,
      name: 'option-branch-migration',
      data: {
        before: editor.tupleSet(before),
        switched: editor.tupleSet(switched),
        restored: editor.tupleSet(restored)
      }
    });
  });
});

test(`[${caseId}/C1] 线性工作流逐步调试`, async ({ app, page }, testInfo) => {
  await openCanvas(page, app._id);
  const editor = workflowEditor(page, testInfo);
  const before = await editor.exportGraph();
  const a = node(page, 'A');
  const b = node(page, 'B');
  const dialog = await openDebug(page, a);
  const first = await runStep({
    page,
    testInfo,
    label: 'A',
    button: dialog.getByRole('button', { name: '运行', exact: true })
  });
  expect(first.data.nodeResponses.A).toMatchObject({
    type: 'run',
    response: { textOutput: '固定文本 A' }
  });
  expect(first.data.entryNodeIds).toEqual(['B']);
  await expect(result(a)).toBeVisible();
  await expect(a).toHaveClass(/\bselected\b/);
  await testInfo.attach('A-result', { body: await page.screenshot(), contentType: 'image/png' });

  const second = await runStep({
    page,
    testInfo,
    label: 'B',
    button: a.getByRole('button', { name: '下一步', exact: true })
  });
  expect(second.request).toMatchObject({
    chatId: first.request.chatId,
    usageId: first.data.usageId
  });
  expect(second.data.nodeResponses.B).toMatchObject({
    type: 'run',
    response: { textOutput: '固定文本 B' }
  });
  expect(second.data.entryNodeIds).toEqual([]);
  await expect(result(a)).toBeHidden();
  await expect(result(b)).toBeVisible();
  await expect(b).toHaveClass(/\bselected\b/);
  await testInfo.attach('B-result', { body: await page.screenshot(), contentType: 'image/png' });
  await b.getByRole('button', { name: '完成调试', exact: true }).click();
  await expect(result(b)).toBeHidden();
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
  const after = await editor.exportGraph();
  await attachJson({ testInfo, name: 'configuration', data: { before, after } });
  expect(after).toEqual(before);
});

test.describe('动态选项', () => {
  test.use({ graph: makeGraph('interactive') });

  test(`[${caseId}/C2] 动态选项字面量与交互续跑`, async ({ app, page }, testInfo) => {
    await openCanvas(page, app._id);
    const editor = workflowEditor(page, testInfo);
    const before = await editor.exportGraph();
    const choice = node(page, 'Choice');
    const tail = node(page, 'Tail');
    const dialog = await openDebug(page, choice);
    await dialog.getByRole('textbox').fill('["Source", "system_text"]', { timeout: 10_000 });
    const first = await runStep({
      page,
      testInfo,
      label: 'Choice',
      button: dialog.getByRole('button', { name: '运行', exact: true })
    });
    expect(
      first.request.nodes.find(({ nodeId }: { nodeId: string }) => nodeId === 'Choice').inputs
    ).toContainEqual(
      expect.objectContaining({
        key: NodeInputKeyEnum.userSelectOptions,
        debugValueOverride: true,
        value: ['Source', 'system_text']
      })
    );
    expect(first.data.nodeResponses.Choice.interactiveResponse).toMatchObject({
      type: 'userSelect',
      params: {
        userSelectOptions: [
          { key: 'option_1', value: 'Source' },
          { key: 'option_2', value: 'system_text' }
        ]
      }
    });
    const card = choice.locator('.nowheel').filter({ hasText: '运行结果' });
    const option = card.getByText('system_text', { exact: true });
    await expect(card.getByText('Source', { exact: true })).toBeVisible();
    await expect(option).toBeVisible();
    await testInfo.attach('choice-options', {
      body: await page.screenshot(),
      contentType: 'image/png'
    });
    const resumed = await runStep({ page, testInfo, label: 'Choice-resume', button: option });
    expect(resumed.request).toMatchObject({
      chatId: first.request.chatId,
      usageId: first.data.usageId
    });
    expect(resumed.data.nodeResponses.Choice).toMatchObject({
      type: 'run',
      response: { userSelectResult: 'system_text' }
    });
    expect(resumed.data.entryNodeIds).toEqual(['Tail']);

    const last = await runStep({
      page,
      testInfo,
      label: 'Tail',
      button: choice.getByRole('button', { name: '下一步', exact: true })
    });
    expect(last.request).toMatchObject({
      chatId: first.request.chatId,
      usageId: first.data.usageId
    });
    expect(last.data.nodeResponses.Tail).toMatchObject({
      type: 'run',
      response: { textOutput: '固定文本 Tail' }
    });
    expect(last.data.entryNodeIds).toEqual([]);
    await expect(result(choice)).toBeHidden();
    await tail.getByRole('button', { name: '完成调试', exact: true }).click();
    await expect(result(tail)).toBeHidden();
    await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
    const after = await editor.exportGraph();
    await attachJson({ testInfo, name: 'configuration', data: { before, after } });
    const options = after.nodes
      .find(({ nodeId }) => nodeId === 'Choice')
      ?.inputs.find(({ key }) => key === NodeInputKeyEnum.userSelectOptions);
    expect(options).toMatchObject({
      selectedType: FlowNodeInputTypeEnum.reference,
      value: [['Source', 'system_text']]
    });
    expect(options).not.toHaveProperty('debugValueOverride');
    expect(after).toEqual(before);
  });
});

for (const variant of ['legacy', 'legacy-branch'] as const) {
  const isBranch = variant === 'legacy-branch';
  test.describe(variant, () => {
    test.use({ graph: makeGraph(variant) });

    test(`[${caseId}/C3] ${isBranch ? '同目标分支边在交互暂停时保留状态' : '历史端口显示单步调试状态'}`, async ({
      app,
      page
    }, testInfo) => {
      await openCanvas(page, app._id);
      const editor = workflowEditor(page, testInfo);
      const before = await editor.exportGraph();
      const isTrackedEdge = ({ source, target }: { source: string; target: string }) =>
        source === 'B' && target === 'C';
      // 新建应用初次加载时以保存顺序为每个存储边分配 Runtime ID。
      const edges = before.edges.flatMap((edge, index) =>
        isTrackedEdge(edge)
          ? [
              {
                edge,
                path: page
                  .getByTestId(`rf__edge-edge-${index}`)
                  .locator('path.react-flow__edge-path')
              }
            ]
          : []
      );
      expect(edges.map(({ edge }) => [edge.sourceHandle, edge.targetHandle])).toEqual(
        isBranch
          ? [
              ['B-source-IF', 'C-target-right'],
              ['B-source-ELSE', 'C-target-left']
            ]
          : [['B-source-right', 'C-target-right']]
      );
      for (const { path } of edges) await expect(path).toBeVisible();

      const strokeByStatus = {
        waiting: 'rgb(94, 143, 255)',
        skipped: 'rgb(138, 149, 167)',
        active: 'rgb(72, 127, 255)'
      };
      const checkEdges = async ({
        response,
        statuses,
        label
      }: {
        response: WorkflowDebugResponse;
        statuses: (keyof typeof strokeByStatus)[];
        label: string;
      }) => {
        const observed = response.memoryEdges.filter(isTrackedEdge);
        expect(observed).toHaveLength(edges.length);
        const strokes: { sourceHandle: string; targetHandle: string; stroke: string }[] = [];
        for (const [index, { edge, path }] of edges.entries()) {
          const status = statuses[index];
          expect(observed).toContainEqual(expect.objectContaining({ ...edge, status }));
          await expect(path).toHaveCSS('stroke', strokeByStatus[status]);
          strokes.push({
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
            stroke: await path.evaluate((element) => getComputedStyle(element).stroke)
          });
        }
        await attachJson({ testInfo, name: label, data: { observed, strokes } });
      };

      const a = node(page, 'A');
      const b = node(page, 'B');
      const c = node(page, 'C');
      const dialog = await openDebug(page, a);
      const first = await runStep({
        page,
        testInfo,
        label: 'A',
        button: dialog.getByRole('button', { name: '运行', exact: true })
      });
      expect(first.data.entryNodeIds).toEqual(['B']);
      expect(first.data.usageId).toBeTruthy();
      const session = { chatId: first.request.chatId, usageId: first.data.usageId };
      const nextButton = (current: Locator) =>
        current.getByRole('button', { name: '下一步', exact: true });
      await checkEdges({
        response: first.data,
        statuses: edges.map(() => 'waiting'),
        label: 'waiting-strokes'
      });

      const branch = await runStep({ page, testInfo, label: 'B', button: nextButton(a) });
      expect(branch.request).toMatchObject(session);
      expect(branch.data.entryNodeIds).toEqual(['C']);
      if (isBranch)
        expect(branch.data.nodeResponses.B.response).toMatchObject({ ifElseResult: 'ELSE' });
      const decided: (keyof typeof strokeByStatus)[] = isBranch
        ? ['skipped', 'active']
        : ['active'];
      await checkEdges({ response: branch.data, statuses: decided, label: 'next-entry-strokes' });

      const next = await runStep({ page, testInfo, label: 'C', button: nextButton(b) });
      expect(next.request).toMatchObject(session);
      if (isBranch) {
        expect(next.data.entryNodeIds).toEqual(['C']);
        expect(next.data.nodeResponses.C.interactiveResponse).toMatchObject({
          type: 'userSelect',
          params: { userSelectOptions: [{ key: 'continue', value: branchOption }] }
        });
        await checkEdges({ response: next.data, statuses: decided, label: 'paused-strokes' });
        const option = c
          .locator('.nowheel')
          .filter({ hasText: '运行结果' })
          .getByText(branchOption, { exact: true });
        await expect(option).toBeVisible();
        await testInfo.attach('paused-choice', {
          body: await page.screenshot(),
          contentType: 'image/png'
        });
        const resumed = await runStep({ page, testInfo, label: 'C-resume', button: option });
        expect(resumed.request).toMatchObject({
          ...session,
          history: [{ value: [{ interactive: { entryNodeIds: ['C'] } }] }]
        });
        expect(resumed.data.nodeResponses.C).toMatchObject({
          type: 'run',
          response: { userSelectResult: branchOption }
        });
        expect(resumed.data.entryNodeIds).toEqual([]);
      } else {
        expect(next.data.entryNodeIds).toEqual([]);
      }

      await c.getByRole('button', { name: '完成调试', exact: true }).click();
      await expect(result(c)).toBeHidden();
      await expect(page.locator('.react-flow__node.selected')).toHaveCount(0);
      const after = await editor.exportGraph();
      await attachJson({ testInfo, name: 'legacy-edge-configuration', data: { before, after } });
      expect(after).toEqual(before);
    });
  });
}
