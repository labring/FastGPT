import assert from 'node:assert/strict';
import { runNodeCase } from '../../../support/runtime.mjs';
import { success } from '../../../support/scenario.mjs';
import { workflowScenario } from './workflow-api.mjs';
import { workflowModel } from './workflow-model.mjs';
import { fixtureEdge, fixtureNode } from './workflow-fixtures.mjs';

/** 使用生产节点模板构造分类或提取图；外部模型只控制文本，其他链路真实运行。 */
async function structuredGraph(c, { kind, modelId }) {
  const base = await c.load('basic-dataflow');
  const start = base.nodes.find((node) => node.nodeId === 'Start');
  const node = fixtureNode({
    kind,
    id: 'Structured',
    values:
      kind === 'classify'
        ? {
            modelId,
            userChatInput: ['Start', 'userChatInput'],
            history: 0,
            agents: [
              { key: 'a', value: '订单' },
              { key: 'b', value: '售后' },
              { key: 'other', value: '其他' }
            ]
          }
        : {
            modelId,
            content: ['Start', 'userChatInput'],
            history: 0,
            extractKeys: [
              {
                key: 'status',
                valueType: 'string',
                desc: 'status',
                required: true,
                defaultValue: 'closed'
              }
            ]
          }
  });
  const nodes = [start, node];
  const edges = [fixtureEdge({ source: 'Start', target: 'Structured' })];
  if (kind === 'classify') {
    for (const branch of ['a', 'b', 'other']) {
      nodes.push(
        fixtureNode({
          kind: 'http',
          id: `Branch_${branch}`,
          values: {
            system_httpReqUrl: `${c.fixture.workflowRuntime.gateUrl}/count`,
            system_httpJsonBody: JSON.stringify({
              runId: '{{$Start.userChatInput$}}',
              node: branch
            })
          }
        })
      );
      edges.push(fixtureEdge({ source: 'Structured', target: `Branch_${branch}`, handle: branch }));
      edges.push(fixtureEdge({ source: `Branch_${branch}`, target: 'Reply' }));
    }
    nodes.push(
      fixtureNode({
        kind: 'answer',
        id: 'Reply',
        values: { text: 'CLASS:{{$Structured.cqResult$}}' }
      })
    );
  } else {
    node.outputs.push({
      id: 'status',
      key: 'status',
      label: 'status',
      type: 'dynamic',
      valueType: 'string'
    });
    nodes.push(
      fixtureNode({
        kind: 'answer',
        id: 'Reply',
        values: {
          text: 'status={{$Structured.status$}}|success={{$Structured.success$}}|fields={{$Structured.fields$}}'
        }
      })
    );
    edges.push(fixtureEdge({ source: 'Structured', target: 'Reply' }));
  }
  return { nodes, edges, chatConfig: base.chatConfig };
}

/** 每个输出变体新建会话；按 runId 核对真实分支副作用和持久化详情。 */
async function classifyVariant(c, { appId, model, answer, expected, suffix }) {
  const chatId = `${c.run}-${suffix}`;
  model.queueContent(answer);
  const before = model.calls.length;
  const response = await c.complete(appId, { chatId, question: chatId, stream: true });
  success(response);
  const stored = await c.persisted(appId, chatId);
  const rows = stored.rows.map((row) => row.data);
  const result = rows.find((row) => row.nodeId === 'Structured');
  const calls = (await c.gateObservations()).filter(
    (item) => item.path === '/count' && item.body.runId === chatId
  );
  assert.equal(model.calls.length, before + 1);
  assert.equal(result.cqResult, expected.label);
  assert.deepEqual(
    calls.map((item) => item.body.node),
    [expected.branch]
  );
  assert.equal(response.text.trim(), `CLASS:${expected.label}`);
  assert.equal(rows.filter((row) => row.nodeId === 'Reply').length, 1);
  c.record('分类模型与实际分支', {
    answer,
    expected,
    result,
    calls,
    modelCall: model.calls.at(-1)
  });
}

await runNodeCase('FG-APP-WORKFLOW-063', {
  async C1(context) {
    const c = await workflowScenario(context);
    const model = await workflowModel(context, c);
    const appId = await c.create(
      'classification',
      await structuredGraph(c, { kind: 'classify', modelId: model.modelId })
    );
    for (const variant of [
      { answer: 'a', suffix: 'key', expected: { branch: 'a', label: '订单' } },
      { answer: '售后', suffix: 'value', expected: { branch: 'b', label: '售后' } }
    ])
      await classifyVariant(c, { appId, model, ...variant });
    const real = await c.activeModel('deepseek-v4.1-flash');
    const realAppId = await c.create(
      'classification-real-model',
      await structuredGraph(c, { kind: 'classify', modelId: real.modelId })
    );
    const question = `${c.run}-real-订单咨询`;
    const response = await c.complete(realAppId, {
      chatId: `${c.run}-real`,
      question,
      stream: true
    });
    success(response);
    const stored = await c.persisted(realAppId, `${c.run}-real`);
    const result = stored.rows.find((row) => row.data.nodeId === 'Structured')?.data;
    const branchByLabel = { 订单: 'a', 售后: 'b', 其他: 'other' };
    assert.ok(Object.hasOwn(branchByLabel, result?.cqResult));
    assert.ok(result.inputTokens > 0 && result.outputTokens > 0);
    const calls = (await c.gateObservations()).filter(
      (item) => item.path === '/count' && item.body.runId === question
    );
    assert.deepEqual(
      calls.map((item) => item.body.node),
      [branchByLabel[result.cqResult]]
    );
    assert.equal(response.text.trim(), `CLASS:${result.cqResult}`);
    c.record('真实 DeepSeek 分类对照', { model: real, result, calls });
    return '受控模型验证类别 key/value；真实 DeepSeek 分类也与实际分支、下游回复和用量一致，不要求自由回答固定类别。';
  },
  async C2(context) {
    const c = await workflowScenario(context);
    const model = await workflowModel(context, c);
    const appId = await c.create(
      'classification-boundary',
      await structuredGraph(c, { kind: 'classify', modelId: model.modelId })
    );
    await classifyVariant(c, {
      appId,
      model,
      answer: 'unknown result',
      suffix: 'unknown',
      expected: { branch: 'other', label: '其他' }
    });
    const before = model.calls.length;
    const chatId = `${c.run}-empty`;
    const response = await c.complete(appId, { chatId, question: '', stream: true });
    const stored = await c.persisted(appId, chatId);
    assert.equal(model.calls.length, before, '空输入不得请求模型');
    const failure = stored.rows.find((row) => row.data.nodeId === 'Structured')?.data;
    assert.match(failure?.errorText ?? failure?.error, /Input is empty/);
    assert.ok(!stored.rows.some((row) => row.data.nodeId.startsWith('Branch_')));
    assert.equal(stored.chats[0].errorCount, 1);
    c.record('分类空输入拒绝', { response, rows: stored.rows });
    return '未知模型回复只走兜底分支；空问题在调用模型前失败，未执行任何分支。';
  },
  async C3(context) {
    const c = await workflowScenario(context);
    const model = await workflowModel(context, c);
    const appId = await c.create(
      'content-extraction',
      await structuredGraph(c, { kind: 'extract', modelId: model.modelId })
    );
    for (const [index, answer, status] of [
      [0, '{"status":"open","extra":"ignored"}', 'open'],
      [1, '{}', 'closed'],
      [2, 'no JSON content', 'closed']
    ]) {
      const chatId = `${c.run}-extract-${index}`;
      model.queueContent(answer);
      const before = model.calls.length;
      const response = await c.complete(appId, { chatId, question: chatId, stream: true });
      success(response);
      const stored = await c.persisted(appId, chatId);
      const row = stored.rows.find((item) => item.data.nodeId === 'Structured')?.data;
      assert.equal(model.calls.length, before + 1);
      assert.deepEqual(row.extractResult, { status });
      assert.equal(
        response.text.trim(),
        `status=${status}|success=true|fields={"status":"${status}"}`
      );
      c.record('内容提取及下游结果', {
        answer,
        status,
        row,
        response,
        modelCall: model.calls.at(-1)
      });
    }
    return '提取节点过滤未声明字段，并对空 JSON 与无 JSON 正确填充必填默认值，完整结果由下游消费。';
  },
  async C4(context) {
    const c = await workflowScenario(context);
    const model = await workflowModel(context, c);
    for (const kind of ['classify', 'extract']) {
      const graph = await structuredGraph(c, { kind, modelId: model.modelId });
      const node = graph.nodes.find((item) => item.nodeId === 'Structured');
      const history = node.inputs.find((item) => item.key === 'history');
      history.value = 2;
      const appId = await c.create(`memory-${kind}`, graph);
      const chatId = `${c.run}-memory-${kind}`;
      const answers =
        kind === 'classify'
          ? ['a', 'b', 'a']
          : ['{"status":"open"}', '{"status":"closed"}', '{"status":"open"}'];
      const memory = kind === 'classify' ? '{"key":"a","value":"订单"}' : '{"status":"open"}';
      const observed = [];
      for (const [index, answer] of answers.entries()) {
        if (index === 2) {
          history.value = 0;
          success(
            await c.request({
              route: `/api/core/app/version/publish?appId=${appId}`,
              body: { ...graph, isPublish: true, versionName: 'FG-TEST no history' }
            })
          );
        }
        model.queueContent(answer);
        success(await c.complete(appId, { chatId, question: `${chatId}-${index}`, stream: true }));
        const call = model.calls.at(-1);
        const system = call.body.messages.find((message) => message.role === 'system')?.content;
        if (index === 1) assert.ok(system.includes(memory), '允许历史时应注入上一轮节点记忆');
        if (index === 2) {
          assert.ok(!system.includes('## 上一轮分类结果'));
          assert.ok(!system.includes('## 历史提取结果'));
        }
        observed.push({ index, messages: call.body.messages });
      }
      c.record('同会话节点记忆与 history=0', { kind, appId, chatId, observed });

      // 两个独立子应用使用相同 nodeId；第二个调用不能继承第一个子路径的记忆。
      const firstGraph = await structuredGraph(c, { kind, modelId: model.modelId });
      const secondGraph = await structuredGraph(c, { kind, modelId: model.modelId });
      for (const item of [firstGraph, secondGraph]) {
        item.nodes
          .find((node) => node.nodeId === 'Structured')
          .inputs.find((input) => input.key === 'history').value = 2;
      }
      const firstId = await c.create(`memory-${kind}-first`, firstGraph);
      const secondId = await c.create(`memory-${kind}-second`, secondGraph);
      const root = await c.load('child-parent', { __CHILD_APP_ID__: firstId });
      const first = root.nodes.find((node) => node.nodeId === 'Child');
      first.nodeId = 'First';
      first.name = 'First';
      const second = structuredClone(first);
      second.nodeId = 'Second';
      second.name = 'Second';
      second.pluginId = secondId;
      const reply = root.nodes.find((node) => node.nodeId === 'ParentReply');
      reply.inputs.find((input) => input.key === 'text').value = 'CHILD-DONE';
      root.nodes = [root.nodes.find((node) => node.nodeId === 'Start'), first, second, reply];
      root.edges = [
        fixtureEdge({ source: 'Start', target: 'First' }),
        fixtureEdge({ source: 'First', target: 'Second' }),
        fixtureEdge({ source: 'Second', target: 'ParentReply' })
      ];
      const parentId = await c.create(`memory-${kind}-parent`, root);
      const before = model.calls.length;
      model.queueContent(answers[0]);
      model.queueContent(answers[1]);
      const parentChatId = `${c.run}-children-${kind}`;
      const response = await c.complete(parentId, {
        chatId: parentChatId,
        question: parentChatId,
        stream: true
      });
      success(response);
      const calls = model.calls.slice(before);
      assert.equal(calls.length, 2);
      const secondSystem = calls[1].body.messages.find(
        (message) => message.role === 'system'
      )?.content;
      assert.ok(!secondSystem.includes(memory), '不同子应用的同名节点不得读取兄弟记忆');
      const stored = await c.persisted(parentId, parentChatId);
      assert.equal(stored.rows.filter((row) => row.data.nodeId === 'Structured').length, 2);
      c.record('子应用同名节点记忆隔离', {
        kind,
        firstId,
        secondId,
        parentId,
        calls,
        rows: stored.rows
      });
    }
    return '分类与提取均验证历史记忆、history=0 和两个独立子应用同名节点的记忆隔离。';
  },
  async C5(context) {
    const c = await workflowScenario(context);
    const model = await workflowModel(context, c);
    for (const kind of ['classify', 'extract']) {
      for (const caught of [true, false]) {
        const graph = await structuredGraph(c, { kind, modelId: model.modelId });
        const node = graph.nodes.find((item) => item.nodeId === 'Structured');
        node.catchError = caught;
        if (!node.outputs.some((output) => output.id === 'system_error_text')) {
          node.outputs.push({
            id: 'system_error_text',
            key: 'system_error_text',
            label: 'errorText',
            type: 'error',
            valueType: 'string'
          });
        }
        graph.nodes.push(fixtureNode({ kind: 'answer', id: 'Caught', values: { text: 'CAUGHT' } }));
        graph.edges.push({
          ...fixtureEdge({ source: 'Structured', target: 'Caught' }),
          sourceHandle: 'Structured-source_catch-right'
        });
        const appId = await c.create(`model-error-${kind}-${caught}`, graph);
        const chatId = `${c.run}-${kind}-${caught}`;
        const before = model.calls.length;
        model.setFailure(true);
        let response;
        try {
          response = await c.complete(appId, { chatId, question: chatId, stream: true });
        } finally {
          model.setFailure(false);
        }
        const stored = await c.persisted(appId, chatId);
        const rows = stored.rows.map((row) => row.data);
        const error = rows.find((row) => row.nodeId === 'Structured');
        const calls = model.calls.slice(before);
        c.record('分类或提取模型错误', {
          kind,
          caught,
          response,
          rows,
          calls,
          chat: stored.chats[0]
        });
        assert.ok(calls.length > 0 && calls.every((call) => call.httpStatus === 503));
        assert.ok(error?.errorText || error?.error);
        assert.equal(response.done, true);
        assert.ok(!rows.some((row) => row.nodeId === 'Reply' || row.nodeId.startsWith('Branch_')));
        assert.equal(
          rows.some((row) => row.nodeId === 'Caught'),
          caught
        );
        assert.equal(stored.chats[0].errorCount, caught ? 0 : 1);
        if (caught) assert.equal(response.text.trim(), 'CAUGHT');
        assert.ok(!JSON.stringify(response.events).includes('node:internal'));
      }
    }
    return '分类与提取的真实外部 503 均验证捕获和未捕获出口，根错误计数及后继执行符合配置。';
  }
});
