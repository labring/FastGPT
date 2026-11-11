import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runNodeCase } from '../../../support/runtime.mjs';
import { success } from '../../../support/scenario.mjs';
import { workflowScenario } from './workflow-api.mjs';
import { workflowModel } from './workflow-model.mjs';
import { fixtureEdge, fixtureNode } from './workflow-fixtures.mjs';

await runNodeCase('FG-APP-WORKFLOW-065', {
  async C3(context) {
    const c = await workflowScenario(context);
    const model = await workflowModel(context, c);
    for (const stop of [true, false]) {
      const child = await c.load('basic-tool-child');
      const toolId = await c.create(`stop-tool-${stop}`, { ...child, type: 'plugin' });
      const graph = await c.load('tool-concurrent', { __MODEL_ID__: model.modelId });
      const tool = (await c.load('basic-tool-parent', { __CHILD_TOOL_ID__: toolId })).nodes.find(
        (node) => node.nodeId === 'Tool'
      );
      tool.nodeId = 'RunChildTool';
      tool.name = 'RunChildTool';
      graph.nodes = graph.nodes.filter((node) => node.nodeId !== 'SlowGate');
      graph.nodes.push(tool);
      graph.nodes
        .find((node) => node.nodeId === 'FastGate')
        .inputs.find((input) => input.key === 'system_httpReqUrl').value =
        `${c.fixture.workflowRuntime.gateUrl}/count`;
      for (const edge of graph.edges) {
        if (edge.source === 'SlowGate') edge.source = 'RunChildTool';
        if (edge.target === 'SlowGate') edge.target = 'RunChildTool';
        edge.sourceHandle = edge.sourceHandle?.replace('SlowGate-', 'RunChildTool-');
        edge.targetHandle = edge.targetHandle?.replace('SlowGate-', 'RunChildTool-');
      }
      if (stop) {
        // 停止节点只能放在当前 ToolCall 的工具流程中，不能通过 JSON 将其塞进无 ToolCall 的子应用。
        graph.nodes.push(fixtureNode({ kind: 'stop', id: 'StopSignal' }));
        graph.edges = graph.edges.filter(
          (edge) => !(edge.source === 'RunChildTool' && edge.target === 'SlowUpdate')
        );
        graph.edges.push(fixtureEdge({ source: 'RunChildTool', target: 'StopSignal' }));
      }
      const appId = await c.create(`stop-parent-${stop}`, graph);
      const chatId = `${c.run}-stop-${stop}`;
      const before = model.calls.length;
      model.planTools(['Slow'], ['Fast'], []);
      const response = await c.complete(appId, { chatId, question: chatId, stream: true });
      success(response);
      const stored = await c.persisted(appId, chatId);
      const calls = model.calls.slice(before);
      const gate = (await c.gateObservations()).filter(
        (entry) => entry.path === '/count' && entry.body.runId === chatId
      );
      const rows = stored.rows.map((row) => row.data);
      c.record('停止工具与非停止对照', {
        stop,
        toolId,
        appId,
        chatId,
        response,
        calls,
        gate,
        rows,
        chat: stored.chats[0]
      });
      assert.equal(stored.chats[0].errorCount, 0);
      assert.equal(
        rows.some((row) => row.nodeId === 'StopSignal' && row.toolStop),
        stop
      );
      assert.deepEqual(
        calls.flatMap((call) => call.toolCalls.map((item) => item.function.name)),
        stop ? ['Slow'] : ['Slow', 'Fast']
      );
      assert.equal(gate.length, stop ? 0 : 1);
    }
    return '真实工作流工具后的停止节点终止当前工具循环；无停止对照进入下一模型轮次并执行独立 gate。';
  },
  async C4(context) {
    const c = await workflowScenario(context);
    const childMark = `CHILD-FEEDBACK-${c.run}`;
    const loopMark = `LOOP-FEEDBACK-${c.run}`;
    const child = await c.load('child-leaf');
    child.nodes.push(
      fixtureNode({
        kind: 'feedback',
        id: 'ChildFeedback',
        values: { system_textareaInput: childMark }
      })
    );
    child.edges = child.edges.filter(
      (edge) => !(edge.source === 'ChildUpdate' && edge.target === 'ChildReply')
    );
    child.edges.push(
      fixtureEdge({ source: 'ChildUpdate', target: 'ChildFeedback' }),
      fixtureEdge({ source: 'ChildFeedback', target: 'ChildReply' })
    );
    const childId = await c.create('feedback-child', child);
    const root = await c.load('child-parent', { __CHILD_APP_ID__: childId });
    const loop = await c.load('loop-container');
    const container = loop.nodes.find((node) => node.nodeId === 'Container');
    container.inputs.find((input) => input.key === 'loopRunInputArray').value = [0];
    container.inputs.find((input) => input.key === 'childrenNodeIdList').value.push('LoopFeedback');
    const feedback = fixtureNode({
      kind: 'feedback',
      id: 'LoopFeedback',
      extra: { parentNodeId: 'Container' },
      values: { system_textareaInput: loopMark }
    });
    root.nodes.push(
      ...loop.nodes.filter((node) => !['Start', 'ReadVariables'].includes(node.nodeId)),
      feedback
    );
    root.edges = root.edges.filter(
      (edge) => !(edge.source === 'Child' && edge.target === 'ParentReply')
    );
    root.edges.push(
      fixtureEdge({ source: 'Child', target: 'Container' }),
      fixtureEdge({ source: 'Container', target: 'ParentReply' }),
      fixtureEdge({ source: 'BodyStart', target: 'BodyUpdate' }),
      fixtureEdge({ source: 'BodyUpdate', target: 'LoopFeedback' }),
      fixtureEdge({ source: 'LoopFeedback', target: 'BodyEnd' })
    );
    const appId = await c.create('feedback-parent', root);
    const chatId = `${c.run}-feedback`;
    const response = await c.complete(appId, { chatId, question: chatId, stream: true });
    success(response);
    const stored = await c.persisted(appId, chatId);
    const ai = stored.items.find((item) => item.obj === 'AI');
    const rows = stored.rows.map((item) => item.data);
    assert.deepEqual(ai?.customFeedbacks?.slice().sort(), [childMark, loopMark].sort());
    assert.equal(
      rows.filter((row) => row.nodeId === 'ChildFeedback' && row.textOutput === childMark).length,
      1
    );
    assert.equal(
      rows.filter((row) => row.nodeId === 'LoopFeedback' && row.textOutput === loopMark).length,
      1
    );
    assert.ok(response.text.includes('CHILD:child-output'));
    const refreshed = success(
      await c.request({
        route: '/api/core/chat/record/getRecords_v2',
        body: { appId, chatId, loadCustomFeedbacks: true, pageSize: 20 }
      })
    );
    assert.deepEqual(
      refreshed.list
        .find((item) => item.obj === 'AI')
        ?.customFeedbacks?.slice()
        .sort(),
      [childMark, loopMark].sort()
    );
    const { chromium } = createRequire(new URL('../../../../../package.json', import.meta.url))(
      '@playwright/test'
    );
    const browser = await chromium.launch({ headless: true });
    try {
      const browserContext = await browser.newContext({
        baseURL: c.fixture.baseUrl,
        storageState: c.secret(c.fixture.actors.owner.stateEnv)
      });
      const page = await browserContext.newPage();
      await page.goto(`/app/detail?appId=${appId}&currentTab=logs`, {
        waitUntil: 'domcontentloaded',
        timeout: 120000
      });
      const openLog = async () => {
        await page.locator('tbody tr').first().click({ timeout: 60000 });
        await page
          .getByText(childMark, { exact: true })
          .waitFor({ state: 'visible', timeout: 60000 });
        await page
          .getByText(loopMark, { exact: true })
          .waitFor({ state: 'visible', timeout: 60000 });
      };
      await openLog();
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
      await openLog();
      const screenshot = `${context.itemId}-feedback-after-reload.png`;
      await page.screenshot({ path: `${context.directory}/${screenshot}` });
      context.attachments.push({ path: screenshot, label: '刷新后的日志反馈' });
      await browserContext.close();
    } finally {
      await browser.close();
    }
    c.record('子流程和循环自定义反馈', { appId, childId, chatId, ai, rows, refreshed });
    return '子应用和循环反馈各归属当前 AI 消息一次，记录与日志页面刷新后均可见，父回复正常。';
  }
});
