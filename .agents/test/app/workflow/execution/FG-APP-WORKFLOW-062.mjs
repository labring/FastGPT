import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runNodeCase } from '../../../support/runtime.mjs';
import { success } from '../../../support/scenario.mjs';
import { workflowScenario } from './workflow-api.mjs';
import { verifyParallelRetry } from './workflow-parallel-retry.mjs';
import { fixtureEdge, fixtureNode } from './workflow-fixtures.mjs';

/** 创建 A → K 两层真实资源，并把故障请求限定到当前 runId。 */
async function prepareNestedChild(c, { mode, runId }) {
  const tool = await c.load('basic-tool-child');
  const failure = fixtureNode({
    kind: 'http',
    id: 'Failure',
    values: {
      system_httpReqUrl: `${c.fixture.workflowRuntime.gateUrl}/fail`,
      system_httpJsonBody: JSON.stringify({ runId, node: 'Failure' })
    },
    extra: { catchError: mode === 'inner' }
  });
  tool.nodes.push(failure);
  tool.edges = [
    fixtureEdge({ source: 'Input', target: 'Failure' }),
    {
      ...fixtureEdge({ source: 'Failure', target: 'Output' }),
      sourceHandle: 'Failure-source_catch-right'
    }
  ];
  const toolId = await c.create(`nested-tool-${mode}`, { ...tool, type: 'plugin' });
  const child = await c.load('basic-tool-parent', { __CHILD_TOOL_ID__: toolId });
  const childId = await c.create(`nested-app-${mode}`, child);
  return { childId, toolId };
}

/** 发布 W → A → K 的三层真实资源，分别在内层或根层启用错误捕获。 */
async function nestedFailure(c, mode) {
  const chatId = `${c.run}-${mode}`;
  const { childId, toolId } = await prepareNestedChild(c, { mode, runId: chatId });
  const root = await c.load('child-parent', { __CHILD_APP_ID__: childId });
  const call = root.nodes.find((node) => node.nodeId === 'Child');
  call.catchError = mode === 'outer';
  call.outputs.push({
    id: 'system_error_text',
    key: 'system_error_text',
    label: 'errorText',
    type: 'error',
    valueType: 'string'
  });
  root.nodes.push(
    fixtureNode({
      kind: 'answer',
      id: 'Recovered',
      values: { text: 'RECOVERED:{{$Child.system_error_text$}}' }
    })
  );
  root.edges.push({
    ...fixtureEdge({ source: 'Child', target: 'Recovered' }),
    sourceHandle: 'Child-source_catch-right'
  });
  const appId = await c.create(`nested-root-${mode}`, root);
  const response = await c.complete(appId, { chatId, question: chatId, stream: true });
  const stored = await c.persisted(appId, chatId);
  const rows = stored.rows.map((row) => row.data);
  const fail = rows.find((row) => row.nodeId === 'Failure');
  const childCall = rows.find((row) => row.nodeId === 'Child');
  const toolCall = rows.find((row) => row.nodeId === 'Tool');
  const attempts = (await c.gateObservations()).filter(
    (item) => item.path === '/fail' && item.body.runId === chatId
  );
  c.record('三层错误路由', {
    mode,
    appId,
    childId,
    toolId,
    response,
    rows,
    attempts,
    chat: stored.chats[0]
  });
  assert.equal(attempts.length, 1);
  assert.ok(fail?.errorText && childCall && toolCall, '三层节点必须保留真实错误详情');
  assert.match(fail.errorText, /FG-TEST controlled failure/);
  assert.equal(fail.parentId, toolCall.id);
  assert.equal(toolCall.parentId, childCall.id);
  assert.equal(response.done, true);
  assert.ok(!JSON.stringify(response.events).includes('node:internal'));
  if (mode === 'inner') {
    success(response);
    assert.equal(fail.errorCaptured, true);
    assert.ok(rows.some((row) => row.nodeId === 'Output'));
    assert.ok(rows.some((row) => row.nodeId === 'Reply'));
    assert.ok(rows.some((row) => row.nodeId === 'ParentReply'));
    assert.ok(!rows.some((row) => row.nodeId === 'Recovered'));
    assert.equal(stored.chats[0].errorCount, 0);
  } else if (mode === 'outer') {
    success(response);
    assert.equal(childCall.errorCaptured, true);
    assert.ok(rows.some((row) => row.nodeId === 'Recovered'));
    assert.ok(!rows.some((row) => row.nodeId === 'ParentReply'));
    assert.match(response.text, /RECOVERED:[\s\S]*FG-TEST controlled failure/);
    assert.equal(stored.chats[0].errorCount, 0);
  } else {
    assert.ok(!rows.some((row) => ['Recovered', 'ParentReply'].includes(row.nodeId)));
    assert.equal(childCall.errorText, fail.errorText);
    assert.equal(toolCall.errorText, fail.errorText);
    assert.equal(stored.chats[0].errorCount, 1);
  }
  return `三层调用的 ${mode} 错误路由、后继节点、真实 503 次数与根错误计数已核对。`;
}

await runNodeCase('FG-APP-WORKFLOW-062', {
  async C1(context) {
    return nestedFailure(await workflowScenario(context), 'inner');
  },
  async C2(context) {
    return nestedFailure(await workflowScenario(context), 'outer');
  },
  async C3(context) {
    return nestedFailure(await workflowScenario(context), 'uncaught');
  },
  async C4(context) {
    const c = await workflowScenario(context);
    for (const mode of ['failure', 'success']) {
      const runId = `${c.run}-branch-${mode}`;
      const { childId, toolId } = await prepareNestedChild(c, { mode: `branch-${mode}`, runId });
      const graph = await c.load('child-parent', { __CHILD_APP_ID__: childId });
      graph.chatConfig.variables.push({
        key: 'path',
        label: 'path',
        description: '',
        type: 'input',
        valueType: 'string',
        required: false
      });
      const child = graph.nodes.find((node) => node.nodeId === 'Child');
      child.catchError = true;
      child.outputs.push({
        id: 'system_error_text',
        key: 'system_error_text',
        label: 'errorText',
        type: 'error',
        valueType: 'string'
      });
      graph.nodes.push(
        fixtureNode({
          kind: 'condition',
          id: 'Choose',
          values: {
            ifElseList: [
              {
                branchId: 'bad',
                condition: 'AND',
                list: [
                  {
                    variable: ['VARIABLE_NODE_ID', 'path'],
                    condition: 'equalTo',
                    value: 'failure',
                    valueType: 'input'
                  }
                ]
              }
            ]
          }
        }),
        fixtureNode({
          kind: 'answer',
          id: 'Recovered',
          values: { text: 'RECOVERED:{{$Child.system_error_text$}}' }
        }),
        ...['SuccessGate', 'Merge'].map((id) =>
          fixtureNode({
            kind: 'http',
            id,
            values: {
              system_httpReqUrl: `${c.fixture.workflowRuntime.gateUrl}/count`,
              system_httpJsonBody: JSON.stringify({ runId, node: id })
            }
          })
        ),
        fixtureNode({ kind: 'answer', id: 'Done', values: { text: 'MERGED' } })
      );
      graph.edges = [
        fixtureEdge({ source: 'Start', target: 'Choose' }),
        fixtureEdge({ source: 'Choose', target: 'Child', handle: 'bad' }),
        fixtureEdge({ source: 'Choose', target: 'SuccessGate', handle: 'ELSE' }),
        fixtureEdge({ source: 'Child', target: 'ParentReply' }),
        {
          ...fixtureEdge({ source: 'Child', target: 'Recovered' }),
          sourceHandle: 'Child-source_catch-right'
        },
        fixtureEdge({ source: 'ParentReply', target: 'Merge' }),
        fixtureEdge({ source: 'Recovered', target: 'Merge' }),
        fixtureEdge({ source: 'SuccessGate', target: 'Merge' }),
        fixtureEdge({ source: 'Merge', target: 'Done' })
      ];
      const appId = await c.create(`nested-branch-${mode}`, graph);
      const response = await c.complete(appId, {
        chatId: runId,
        question: runId,
        stream: true,
        extra: { variables: { path: mode } }
      });
      success(response);
      const stored = await c.persisted(appId, runId);
      const rows = stored.rows.map((row) => row.data);
      const calls = (await c.gateObservations()).filter((item) => item.body.runId === runId);
      c.record('嵌套失败与成功分支', { mode, appId, childId, toolId, rows, calls, response });
      assert.equal(
        calls.filter((item) => item.path === '/fail').length,
        mode === 'failure' ? 1 : 0
      );
      const counts = calls
        .filter((item) => item.path === '/count')
        .map((item) => item.body.node)
        .sort();
      assert.deepEqual(counts, mode === 'failure' ? ['Merge'] : ['Merge', 'SuccessGate']);
      assert.equal(rows.filter((row) => row.nodeId === 'Merge').length, 1);
      assert.equal(
        rows.some((row) => row.nodeId === 'Child'),
        mode === 'failure'
      );
      assert.equal(
        rows.some((row) => row.nodeId === 'Recovered'),
        mode === 'failure'
      );
      assert.equal(stored.chats[0].errorCount, 0);
      assert.ok(response.text.includes('MERGED'));
    }
    return '嵌套失败与独立成功分支均只执行选中路径；父级捕获和跳过传播后汇合节点均恰好执行一次。';
  },
  async C5(context) {
    const c = await workflowScenario(context);
    for (const caught of [true, false]) {
      const graph = await c.load('loop-container');
      const container = graph.nodes.find((node) => node.nodeId === 'Container');
      container.catchError = caught;
      container.inputs.find((input) => input.key === 'loopRunInputArray').value = [0, 'fail', 2];
      container.inputs.find((input) => input.key === 'childrenNodeIdList').value = [
        'BodyStart',
        'Branch',
        'Count',
        'Failure',
        'BodyEnd'
      ];
      graph.nodes = graph.nodes.filter((node) => node.nodeId !== 'BodyUpdate');
      const runId = `${c.run}-loop-${caught}`;
      graph.nodes.push(
        fixtureNode({
          kind: 'condition',
          id: 'Branch',
          extra: { parentNodeId: 'Container' },
          values: {
            ifElseList: [
              {
                branchId: 'bad',
                condition: 'AND',
                list: [
                  {
                    variable: ['BodyStart', 'currentItem'],
                    condition: 'equalTo',
                    value: 'fail',
                    valueType: 'input'
                  }
                ]
              }
            ]
          }
        }),
        fixtureNode({
          kind: 'http',
          id: 'Count',
          extra: { parentNodeId: 'Container' },
          values: {
            system_httpReqUrl: `${c.fixture.workflowRuntime.gateUrl}/count`,
            system_httpJsonBody: JSON.stringify({ runId, node: 'Count' })
          }
        }),
        fixtureNode({
          kind: 'http',
          id: 'Failure',
          extra: { parentNodeId: 'Container' },
          values: {
            system_httpReqUrl: `${c.fixture.workflowRuntime.gateUrl}/fail`,
            system_httpJsonBody: JSON.stringify({ runId, node: 'Failure' })
          }
        }),
        fixtureNode({ kind: 'answer', id: 'Caught', values: { text: 'LOOP-CAUGHT' } })
      );
      graph.edges = graph.edges.filter(
        (edge) => edge.source !== 'BodyUpdate' && edge.target !== 'BodyUpdate'
      );
      graph.edges.push(
        fixtureEdge({ source: 'BodyStart', target: 'Branch' }),
        fixtureEdge({ source: 'Branch', target: 'Failure', handle: 'bad' }),
        fixtureEdge({ source: 'Branch', target: 'Count', handle: 'ELSE' }),
        fixtureEdge({ source: 'Count', target: 'BodyEnd' }),
        {
          ...fixtureEdge({ source: 'Container', target: 'Caught' }),
          sourceHandle: 'Container-source_catch-right'
        }
      );
      const appId = await c.create(`loop-failure-${caught}`, graph);
      const response = await c.complete(appId, { chatId: runId, question: runId, stream: true });
      const stored = await c.persisted(appId, runId);
      const rows = stored.rows.map((row) => row.data);
      const calls = (await c.gateObservations()).filter((item) => item.body.runId === runId);
      c.record('循环第二轮异常', { caught, response, rows, calls, chat: stored.chats[0] });
      assert.equal(calls.filter((item) => item.path === '/count').length, 1);
      assert.equal(calls.filter((item) => item.path === '/fail').length, 1);
      assert.equal(rows.filter((row) => row.nodeId === 'BodyStart').length, 2);
      const fail = rows.find((row) => row.nodeId === 'Failure');
      const wrapper = rows.find((row) => row.id === fail?.parentId);
      assert.ok(fail?.errorText && wrapper?.errorCaptured, '失败迭代应保留并标记为已捕获');
      const parent = rows.find((row) => row.nodeId === 'Container');
      assert.equal(parent.loopRunIterations, 2);
      assert.deepEqual(
        parent.loopRunHistory.map(({ iteration, success }) => ({ iteration, success })),
        [
          { iteration: 1, success: true },
          { iteration: 2, success: false }
        ]
      );
      assert.equal(parent.errorCaptured === true, caught);
      assert.equal(
        rows.some((row) => row.nodeId === 'Caught'),
        caught
      );
      assert.ok(!rows.some((row) => row.nodeId === 'ReadVariables'));
      assert.equal(stored.chats[0].errorCount, caught ? 0 : 1);
    }
    return '循环第 2 轮真实失败后不执行第 3 轮；捕获与未捕获分别核对迭代详情、错误出口及根摘要。';
  },
  async C6(context) {
    return verifyParallelRetry(await workflowScenario(context));
  },
  async C7(context) {
    const c = await workflowScenario(context);
    const tool = await c.load('basic-tool-child');
    tool.nodes.push(
      fixtureNode({
        kind: 'http',
        id: 'Failure',
        values: {
          system_httpReqUrl: `${c.fixture.workflowRuntime.gateUrl}/{{$Input.label$}}`,
          system_httpJsonBody: JSON.stringify({ runId: c.run, node: 'Failure' })
        }
      })
    );
    tool.edges = [
      fixtureEdge({ source: 'Input', target: 'Failure' }),
      fixtureEdge({ source: 'Failure', target: 'Output' })
    ];
    const toolId = await c.create('pause-failure-tool', { ...tool, type: 'plugin' });
    const childGraph = await c.load('basic-tool-parent', { __CHILD_TOOL_ID__: toolId });
    // 工作流工具的编辑器不提供交互节点，暂停放在合法的子应用层后仍经过真实工具失败链路。
    childGraph.nodes.push(
      fixtureNode({
        kind: 'http',
        id: 'Once',
        values: {
          system_httpReqUrl: `${c.fixture.workflowRuntime.gateUrl}/count`,
          system_httpJsonBody: JSON.stringify({ runId: c.run, node: 'Once' })
        }
      }),
      fixtureNode({
        kind: 'form',
        id: 'Form',
        values: {
          userInputForms: [
            { key: 'value', label: 'value', type: 'input', valueType: 'string', required: true }
          ]
        }
      })
    );
    childGraph.edges = childGraph.edges.filter(
      (edge) => !(edge.source === 'Start' && edge.target === 'Tool')
    );
    childGraph.edges.push(
      fixtureEdge({ source: 'Start', target: 'Once' }),
      fixtureEdge({ source: 'Once', target: 'Form' }),
      fixtureEdge({ source: 'Form', target: 'Tool' })
    );
    const childId = await c.create('pause-failure-child', childGraph);
    const root = await c.load('child-parent', { __CHILD_APP_ID__: childId });
    const child = root.nodes.find((node) => node.nodeId === 'Child');
    child.catchError = true;
    child.outputs.push({
      id: 'system_error_text',
      key: 'system_error_text',
      label: 'errorText',
      type: 'error',
      valueType: 'string'
    });
    root.nodes.push(
      fixtureNode({
        kind: 'answer',
        id: 'Recovered',
        values: { text: 'RECOVERED:{{$Child.system_error_text$}}' }
      })
    );
    root.edges.push({
      ...fixtureEdge({ source: 'Child', target: 'Recovered' }),
      sourceHandle: 'Child-source_catch-right'
    });
    const appId = await c.create('pause-failure-root', root);
    for (const [index, action] of ['fail', 'count'].entries()) {
      const chatId = `${c.run}-pause-${action}`;
      const paused = await c.complete(appId, { chatId, question: action, stream: true });
      success(paused);
      const before = await c.persisted(appId, chatId);
      assert.ok(before.items.some((item) => item.value.some((value) => value.interactive)));
      assert.equal(
        (await c.gateObservations()).filter(
          (item) => item.path === '/count' && item.body.runId === c.run && item.body.node === 'Once'
        ).length,
        index + 1
      );
      if (action === 'fail') {
        const { chromium } = createRequire(new URL('../../../../../package.json', import.meta.url))(
          '@playwright/test'
        );
        const browser = await chromium.launch({ headless: true });
        try {
          const pageContext = await browser.newContext({
            baseURL: c.fixture.baseUrl,
            storageState: c.secret(c.fixture.actors.owner.stateEnv)
          });
          const page = await pageContext.newPage();
          await page.goto(`/chat?appId=${appId}&pane=ra`, {
            waitUntil: 'domcontentloaded',
            timeout: 120000
          });
          await page.getByText('fail', { exact: true }).first().click({ timeout: 60000 });
          await page
            .getByText('value', { exact: true })
            .first()
            .waitFor({ state: 'visible', timeout: 60000 });
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
          await page
            .getByText('value', { exact: true })
            .first()
            .waitFor({ state: 'visible', timeout: 60000 });
          const screenshot = `${context.itemId}-after-reload.png`;
          await page.screenshot({ path: `${context.directory}/${screenshot}` });
          context.attachments.push({ path: screenshot, label: '暂停会话刷新后的真实表单' });
          c.record('真实页面刷新', { appId, chatId, interactiveVisibleAfterReload: true });
          await pageContext.close();
        } finally {
          await browser.close();
        }
      }
      const resumed = await c.complete(appId, {
        chatId,
        question: JSON.stringify({ value: `INPUT-${action}` }),
        stream: true
      });
      success(resumed);
      const after = await c.persisted(appId, chatId);
      const rows = after.rows.map((row) => row.data);
      const form = rows.find((row) => row.nodeId === 'Form');
      assert.deepEqual(form?.formInputResult, { value: `INPUT-${action}` });
      assert.equal(
        (await c.gateObservations()).filter(
          (item) => item.path === '/count' && item.body.runId === c.run && item.body.node === 'Once'
        ).length,
        index + 1,
        '恢复不得重放暂停前 gate'
      );
      assert.equal(rows.filter((row) => row.nodeId === 'Once').length, 1);
      assert.equal(
        rows.some((row) => row.nodeId === 'Recovered'),
        action === 'fail'
      );
      assert.equal(
        rows.some((row) => row.nodeId === 'ParentReply'),
        action === 'count'
      );
      assert.equal(after.chats[0].errorCount, 0);
      if (action === 'fail')
        assert.match(resumed.text, /RECOVERED:[\s\S]*FG-TEST controlled failure/);
      c.record('嵌套交互恢复及失败对照', {
        action,
        chatId,
        paused,
        resumed,
        rows,
        chat: after.chats[0]
      });
    }
    return '同一根应用的失败和成功会话均真实暂停恢复；前置 gate 不重放，父级仅捕获失败会话且不污染新会话。';
  }
});
