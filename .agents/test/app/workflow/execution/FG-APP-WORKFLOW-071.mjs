import assert from 'node:assert/strict';
import { runNodeCase } from '../../../support/runtime.mjs';
import { success } from '../../../support/scenario.mjs';
import { runHttpWorkflow, workflowScenario } from './workflow-api.mjs';
import { fixtureEdge, fixtureNode } from './workflow-fixtures.mjs';

/** 按真实管理 API 创建并预检独立知识库；异常时也通过业务入口删除。 */
async function prepareDataset(context, c) {
  const embedding = await c.activeModel('text-embedding-v3');
  const model = await c.activeModel('deepseek-v4.1-flash');
  const suffix = c.run.replaceAll(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const keyword = `FGTEST${suffix}`;
  const answer = `FOUND${suffix}`;
  const datasetId = success(
    await c.request({
      route: '/api/core/dataset/create',
      body: {
        parentId: null,
        type: 'dataset',
        name: `FG-TEST-${c.run}-dataset`,
        intro: 'workflow integration',
        vectorModelId: embedding.modelId,
        agentModelId: model.modelId,
        vlmModelId: null
      }
    })
  );
  context.cleanups.push(async () => {
    success(
      await c.request({ method: 'DELETE', route: `/api/core/dataset/delete?id=${datasetId}` })
    );
    return { datasetId, deletedThroughApi: true };
  });
  const collectionId = success(
    await c.request({
      route: '/api/core/dataset/collection/create',
      body: { datasetId, parentId: null, name: `FG-TEST-${c.run}-collection`, type: 'virtual' }
    })
  );
  const inserted = success(
    await c.request({
      route: '/api/core/dataset/data/insertData',
      body: { collectionId, q: keyword, a: answer }
    })
  );
  assert.equal(inserted.dataIds.length, 1);
  const dataId = inserted.dataIds[0];
  const search = async (text) =>
    success(
      await c.request({
        route: '/api/core/dataset/searchTest',
        body: { datasetId, text, searchMode: 'fullTextRecall', usingReRank: false }
      })
    );
  const baseline = await c.poll(async () => {
    const value = await search(keyword);
    assert.ok(value.list.some((item) => item.id === dataId));
    return value;
  });
  const absent = `NOTFOUND${suffix}`;
  const emptyBaseline = await search(absent);
  assert.deepEqual(emptyBaseline.list, []);
  c.record('本轮知识库预检', { datasetId, collectionId, dataId, baseline, emptyBaseline });
  return { model, datasetId, collectionId, dataId, keyword, answer, absent };
}

await runNodeCase('FG-APP-WORKFLOW-071', {
  async C1(context) {
    const c = await workflowScenario(context);
    for (const mode of ['json', 'get', 'form', 'raw']) {
      const graph = await c.load('basic-http');
      const inputs = graph.nodes.find((node) => node.nodeId === 'Echo').inputs;
      const set = (key, value) => {
        inputs.find((input) => input.key === key).value = value;
      };
      if (mode === 'get') {
        set('system_httpMethod', 'GET');
        set('system_httpContentType', 'none');
      } else if (mode === 'form') {
        set('system_httpContentType', 'x-www-form-urlencoded');
        set('system_httpFormBody', [
          { key: 'runId', type: 'string', value: '{{$Start.userChatInput$}}' },
          { key: 'text', type: 'string', value: '{{text}}' }
        ]);
      } else if (mode === 'raw') {
        set('system_httpContentType', 'raw-text');
        set('system_httpJsonBody', 'RAW:{{$Start.userChatInput$}}:{{text}}');
      }
      const { call, echo, observe } = await runHttpWorkflow(c, {
        name: `http-${mode}`,
        graph,
        variables: { text: 'FG-TEST text' }
      });
      const runId = call.query.runId;
      assert.equal(call.headers['x-fg-test'], runId);
      assert.equal(call.method, mode === 'get' ? 'GET' : 'POST');
      if (mode === 'get') {
        assert.equal(call.bodyBytes, 0);
      } else if (mode === 'json') {
        assert.match(call.headers['content-type'], /^application\/json/);
        assert.equal(call.body.runId, runId);
        assert.equal(call.body.text, 'FG-TEST text');
      } else if (mode === 'form') {
        assert.match(call.headers['content-type'], /^application\/x-www-form-urlencoded/);
        assert.deepEqual(call.body, { runId, text: 'FG-TEST text' });
      } else {
        assert.match(call.headers['content-type'], /^text\/plain/);
        assert.equal(call.body, `RAW:${runId}:FG-TEST text`);
      }
      assert.deepEqual(observe.customInputs.raw, echo.httpResult);
      assert.equal(observe.customInputs.raw.method, call.method);
      assert.deepEqual(observe.customInputs.raw.body, call.body);
    }
    return '真实 HTTP 节点的 JSON、GET、表单和原始文本请求均按配置到达供应商，并被沙盒及下游消费。';
  },
  async C2(context) {
    const c = await workflowScenario(context);
    for (const mode of ['js', 'py', 'error']) {
      const graph = await c.load('basic-parameters');
      const probe = graph.nodes.find((node) => node.nodeId === 'Probe');
      const code = probe.inputs.find((input) => input.key === 'code');
      if (mode === 'py') {
        probe.inputs.find((input) => input.key === 'codeType').value = 'py';
        code.value = 'def main(inputs):\n    return {"result": inputs}';
      } else if (mode === 'error') {
        code.value = 'function main(inputs) { throw new Error("FG-TEST sandbox failure"); }';
        probe.catchError = true;
        graph.nodes.push(fixtureNode({ kind: 'answer', id: 'Caught', values: { text: 'CAUGHT' } }));
        graph.edges.push({
          ...fixtureEdge({ source: 'Probe', target: 'Caught' }),
          sourceHandle: 'Probe-source_catch-right'
        });
      }
      const appId = await c.create(`sandbox-${mode}`, graph);
      const chatId = `${c.run}-sandbox-${mode}`;
      const response = await c.complete(appId, { chatId, question: chatId, stream: true });
      success(response);
      const stored = await c.persisted(appId, chatId);
      const rows = stored.rows.map((row) => row.data);
      const row = rows.find((item) => item.nodeId === 'Probe');
      assert.ok(row, '必须记录真实代码节点');
      if (mode === 'error') {
        assert.match(row.errorText, /FG-TEST sandbox failure/);
        assert.ok(rows.some((item) => item.nodeId === 'Caught'));
        assert.ok(!rows.some((item) => item.nodeId === 'Reply'));
        assert.equal(response.text.trim(), 'CAUGHT');
      } else {
        assert.equal(row.errorText, undefined);
        assert.equal(row.customInputs.question, chatId);
        assert.equal(row.customInputs.num, 7);
        assert.equal(row.customInputs.flag, false);
        assert.deepEqual(row.customOutputs.result, row.customInputs);
        assert.deepEqual(JSON.parse(response.text.trim()), row.customInputs);
        if (mode === 'js') assert.match(JSON.stringify(row.codeLog), /FG-TEST parameter probe/);
      }
      c.record('真实沙盒执行模式', { mode, probe: row, nodes: rows.map((item) => item.nodeId) });
    }
    return 'JS 与 Python 真实沙盒传递相同动态输入；代码抛错只执行 catch 分支，正常回复不执行。';
  },
  async C3(context) {
    const c = await workflowScenario(context);
    const model = await c.activeModel('deepseek-v4.1-flash');
    const graph = await c.load('basic-model-chain', { __MODEL_ID__: model.modelId });
    const modelNode = graph.nodes.find((node) => node.nodeId === 'Model');
    const setInput = (key, value) => {
      const input = modelNode.inputs.find((item) => item.key === key);
      assert.ok(input, `模型节点缺少 ${key} 输入`);
      input.value = value;
    };
    // V4.1 的推理 token 可能先消耗额度，留足预算以观察实际正文。
    setInput('maxToken', 1024);
    setInput('aiChatReasoning', false);
    const appId = await c.create('real-model-history', graph);
    const chatId = `${c.run}-history`;
    const questions = [`${c.run}-first`, `${c.run}-second`, `${c.run}-direct`];
    const observations = [];

    for (let index = 0; index < questions.length; index++) {
      if (index === 1) setInput('history', 2);
      if (index === 2) setInput('isResponseAnswerText', true);
      if (index > 0) {
        success(
          await c.request({
            route: `/api/core/app/version/publish?appId=${appId}`,
            body: { ...graph, isPublish: true, versionName: `FG-TEST model ${index}` }
          })
        );
      }
      const currentChatId = index === 2 ? `${chatId}-direct` : chatId;
      const response = await c.complete(appId, {
        chatId: currentChatId,
        question: questions[index],
        stream: true
      });
      success(response);
      const stored = await c.persisted(appId, currentChatId);
      const modelRow = stored.rows.find(
        (row) => row.data.nodeId === 'Model' && row.data.query === `QUESTION:${questions[index]}`
      );
      assert.ok(modelRow, '必须记录真实模型节点和当前问题');
      const modelResponse = modelRow.data;
      // Mongo 返回的详情行没有排序保证，同会话多轮必须按 AI 消息归属关联。
      const reply = stored.rows.find(
        (row) => row.chatItemDataId === modelRow.chatItemDataId && row.data.nodeId === 'Reply'
      )?.data;
      assert.equal(modelResponse.model, model.model);
      assert.ok(modelResponse.inputTokens > 0 && modelResponse.outputTokens > 0, '必须有真实用量');
      assert.ok(reply?.textOutput?.startsWith('FINAL:'), '下游必须消费模型输出');
      assert.ok(reply.textOutput.length > 'FINAL:'.length, '模型输出不能为空');
      const modelAnswer = modelResponse.historyPreview.at(-1);
      assert.equal(modelAnswer.obj, 'AI');
      assert.equal(reply.textOutput, `FINAL:${modelAnswer.value}`, '下游必须消费本轮模型原始正文');
      assert.ok(response.text.includes(reply.textOutput), '最终消息必须包含下游回复');
      if (index === 0) {
        assert.equal(
          response.text.trim(),
          reply.textOutput.trim(),
          '关闭直接回复时不能重复输出模型正文'
        );
      } else if (index === 1) {
        assert.ok(
          JSON.stringify(modelResponse.historyPreview).includes(questions[0]),
          '开启历史后模型输入必须包含同会话首轮问题'
        );
      } else {
        assert.ok(
          response.text.indexOf(reply.textOutput) > 0,
          '开启直接回复后应先显示模型正文，再显示下游回复'
        );
      }
      observations.push({ question: questions[index], response, modelResponse, reply });
    }

    c.record('真实 DeepSeek 模型历史与下游消费', { model, observations });
    return '使用 Dev 的 deepseek-v4.1-flash 完成三轮真实模型调用；核对 history=0/2、当前问题、直接回复开关、下游消费和实际 token 用量。';
  },
  async C4(context) {
    const c = await workflowScenario(context);
    const { model, datasetId, collectionId, dataId, keyword, answer, absent } =
      await prepareDataset(context, c);
    const graph = await c.load('basic-dataset-chain', {
      __DATASET_ID__: datasetId,
      __MODEL_ID__: model.modelId
    });
    const modelNode = graph.nodes.find((node) => node.nodeId === 'Model');
    modelNode.inputs.find((input) => input.key === 'aiChatReasoning').value = false;
    const maxToken = modelNode.inputs.find((input) => input.key === 'maxToken');
    if (maxToken) maxToken.value = 1024;
    const appId = await c.create('dataset-model-chain', graph);
    for (const [label, question] of [
      ['hit', keyword],
      ['empty', absent]
    ]) {
      const chatId = `${c.run}-dataset-${label}`;
      const response = await c.complete(appId, { chatId, question, stream: true });
      success(response);
      const stored = await c.persisted(appId, chatId);
      const rows = stored.rows.map((item) => item.data);
      const searchRow = rows.find((row) => row.nodeId === 'Search');
      const modelRow = rows.find((row) => row.nodeId === 'Model');
      const reply = rows.find((row) => row.nodeId === 'Reply');
      assert.ok(searchRow && modelRow && reply);
      assert.ok(modelRow.inputTokens > 0 && modelRow.outputTokens > 0);
      assert.equal(reply.textOutput, `FINAL:${modelRow.historyPreview.at(-1).value}`);
      if (label === 'hit') {
        assert.ok(searchRow.quoteList.some((item) => item.id === dataId));
        assert.ok(JSON.stringify(modelRow.historyPreview).includes(keyword));
        assert.ok(JSON.stringify(modelRow.historyPreview).includes(answer));
      } else assert.deepEqual(searchRow.quoteList, []);
      c.record('真实知识库检索及模型消费', {
        label,
        datasetId,
        collectionId,
        dataId,
        searchRow,
        modelRow,
        reply
      });
    }
    return '通过真实知识库创建和召回预检，DeepSeek 模型分别消费命中片段与空检索结果，最终回复读取本轮模型正文。';
  },
  async C5(context) {
    const c = await workflowScenario(context);
    const toolId = await c.create('tool-chain-child', {
      ...(await c.load('basic-tool-child')),
      type: 'plugin'
    });
    const appId = await c.create(
      'tool-chain-parent',
      await c.load('basic-tool-parent', { __CHILD_TOOL_ID__: toolId })
    );
    const chatId = `${c.run}-tool`;
    const response = await c.complete(appId, { chatId, question: chatId, stream: true });
    success(response);
    const stored = await c.persisted(appId, chatId);
    const rows = stored.rows.map((row) => row.data);
    const tool = rows.find((row) => row.nodeId === 'Tool');
    const output = rows.find((row) => row.nodeId === 'Output');
    const expected = { label: chatId, amount: 0, enabled: false };
    assert.ok(rows.some((row) => row.nodeId === 'Input'));
    assert.deepEqual(tool.toolInput, expected);
    assert.deepEqual(tool.pluginOutput, expected);
    assert.deepEqual(output.pluginOutput, expected);
    assert.equal(output.parentId, tool.id);
    assert.equal(response.text.trim(), `TOOL:${chatId}|0|false`);

    const childId = await c.create('app-chain-child', await c.load('child-leaf'));
    const parentId = await c.create(
      'app-chain-parent',
      await c.load('child-parent', { __CHILD_APP_ID__: childId })
    );
    const parentChatId = `${c.run}-child-app`;
    const parentResponse = await c.complete(parentId, { chatId: parentChatId, stream: true });
    success(parentResponse);
    const parentStored = await c.persisted(parentId, parentChatId);
    assert.equal(parentResponse.text.trim(), 'PARENT:A0|\nCHILD:child-output');
    assert.equal(parentStored.chats[0].variables.a, 'A0');
    assert.ok(
      parentStored.rows.some(
        (row) => row.data.nodeId === 'ChildInput' && row.data.textOutput === 'child-input'
      )
    );
    c.record('真实工具及子应用输出链路', {
      toolId,
      appId,
      expected,
      tool,
      output,
      childId,
      parentId,
      parentResponse
    });
    return '个人工作流工具的 0/false 经 Input、Output 和父节点消费；真实子应用输出可见而父变量保持隔离。';
  },
  async C6(context) {
    const c = await workflowScenario(context);
    for (const mode of ['A', 'B', 'dynamic', 'empty']) {
      const graph = await c.load('basic-interactive');
      if (mode === 'dynamic' || mode === 'empty') {
        graph.chatConfig.variables.push({
          key: 'options',
          label: 'options',
          description: '',
          type: 'input',
          valueType: 'arrayString',
          defaultValue: mode === 'empty' ? [] : ['A', 'B'],
          required: false
        });
        const optionInput = graph.nodes
          .find((node) => node.nodeId === 'Select')
          .inputs.find((input) => input.key === 'userSelectOptions');
        optionInput.selectedType = 'reference';
        optionInput.value = [['VARIABLE_NODE_ID', 'options']];
        graph.nodes = graph.nodes.filter((node) => node.nodeId !== 'SelectedB');
        graph.nodes
          .find((node) => node.nodeId === 'SelectedA')
          .inputs.find((input) => input.key === 'text').value =
          'SELECTED:{{$Select.selectResult$}}';
        graph.edges = graph.edges.filter(
          (edge) => edge.source !== 'SelectedB' && edge.target !== 'SelectedB'
        );
        graph.edges.find(
          (edge) => edge.source === 'Select' && edge.target === 'SelectedA'
        ).sourceHandle = 'Select-source-ref_default';
      }
      const appId = await c.create(`interactive-${mode}`, graph);
      const chatId = `${c.run}-interactive-${mode}`;
      const paused = await c.complete(appId, { chatId, question: chatId, stream: true });
      const first = await c.persisted(appId, chatId);
      const firstRows = first.rows.map((row) => row.data);
      const firstCalls = (await c.gateObservations()).filter(
        (entry) => entry.path === '/count' && entry.body.runId === chatId
      );
      assert.equal(firstCalls.length, 1);
      if (mode === 'empty') {
        assert.ok(firstRows.some((row) => row.nodeId === 'Select' && row.errorText));
        assert.ok(!firstRows.some((row) => ['SelectedA', 'Form', 'Reply'].includes(row.nodeId)));
        assert.ok(!first.items.some((item) => item.value.some((value) => value.interactive)));
        c.record('空动态选项真实失败', { chatId, paused, firstRows });
        continue;
      }
      success(paused);
      assert.ok(
        first.items.some((item) =>
          item.value.some((value) => value.interactive?.type === 'userSelect')
        )
      );
      assert.ok(
        !firstRows.some((row) => ['SelectedA', 'SelectedB', 'Form', 'Reply'].includes(row.nodeId))
      );
      const selection = mode === 'A' ? 'A' : 'B';
      const selected = await c.complete(appId, { chatId, question: selection, stream: true });
      success(selected);
      const second = await c.persisted(appId, chatId);
      const secondRows = second.rows.map((row) => row.data);
      assert.ok(
        second.items.some((item) =>
          item.value.some((value) => value.interactive?.type === 'userInput')
        )
      );
      assert.equal(
        secondRows.filter((row) => row.nodeId === 'SelectedA').length,
        mode === 'B' ? 0 : 1
      );
      assert.equal(
        secondRows.filter((row) => row.nodeId === 'SelectedB').length,
        mode === 'B' ? 1 : 0
      );
      assert.ok(selected.text.includes(`SELECTED:${selection}`));
      assert.ok(!secondRows.some((row) => row.nodeId === 'Reply'));
      const finished = await c.complete(appId, {
        chatId,
        question: JSON.stringify({ name: 'FG-TEST', count: 0 }),
        stream: true
      });
      success(finished);
      const last = await c.persisted(appId, chatId);
      const lastRows = last.rows.map((row) => row.data);
      assert.deepEqual(lastRows.find((row) => row.nodeId === 'Form')?.formInputResult, {
        name: 'FG-TEST',
        count: 0
      });
      assert.equal(finished.text.trim(), 'FORM:{"name":"FG-TEST","count":0}');
      assert.equal(lastRows.filter((row) => row.nodeId === 'Reply').length, 1);
      assert.equal(
        (await c.gateObservations()).filter(
          (entry) => entry.path === '/count' && entry.body.runId === chatId
        ).length,
        1,
        '交互恢复不得重放前面的业务节点'
      );
      c.record('真实选择与表单恢复', {
        mode,
        chatId,
        paused,
        selected,
        finished,
        firstRows,
        secondRows,
        lastRows
      });
    }
    return '静态 A/B、动态 B 和空动态选项均经真实聊天协议执行；表单恢复保留 0 且不重放此前节点。';
  },
  async C7(context) {
    const c = await workflowScenario(context);
    const { model, datasetId, dataId, keyword, absent } = await prepareDataset(context, c);
    for (const [name, secondQuery, limit] of [
      ['overlap', keyword, 5000],
      ['one-empty', absent, 5000],
      ['zero-limit', keyword, 0]
    ]) {
      const base = await c.load('basic-dataset-chain', {
        __DATASET_ID__: datasetId,
        __MODEL_ID__: model.modelId
      });
      const first = base.nodes.find((node) => node.nodeId === 'Search');
      first.nodeId = 'FirstSearch';
      first.name = 'FirstSearch';
      const second = structuredClone(first);
      second.nodeId = 'SecondSearch';
      second.name = 'SecondSearch';
      second.inputs.find((input) => input.key === 'datasetSearchInput').value = [
        ['VARIABLE_NODE_ID', 'query2']
      ];
      const merge = fixtureNode({ kind: 'datasetConcat', id: 'Merge', values: { limit } });
      for (const [key, nodeId] of [
        ['left', 'FirstSearch'],
        ['right', 'SecondSearch']
      ]) {
        merge.inputs.push({
          key,
          label: key,
          value: [nodeId, 'quoteQA'],
          valueType: 'datasetQuote',
          renderTypeList: ['reference'],
          required: true
        });
      }
      const parameters = await c.load('basic-parameters');
      const probe = parameters.nodes.find((node) => node.nodeId === 'Probe');
      probe.inputs = probe.inputs.filter((input) =>
        ['system_addInputParam', 'codeType', 'code'].includes(input.key)
      );
      for (const [key, nodeId] of [
        ['left', 'FirstSearch'],
        ['right', 'SecondSearch'],
        ['merged', 'Merge']
      ]) {
        probe.inputs.push({
          key,
          label: key,
          value: [nodeId, 'quoteQA'],
          valueType: 'datasetQuote',
          renderTypeList: ['reference', 'input'],
          selectedType: 'reference',
          canEdit: true
        });
      }
      const reply = parameters.nodes.find((node) => node.nodeId === 'Reply');
      const start = base.nodes.find((node) => node.nodeId === 'Start');
      const graph = {
        nodes: [start, first, second, merge, probe, reply],
        edges: [
          fixtureEdge({ source: 'Start', target: 'FirstSearch' }),
          fixtureEdge({ source: 'Start', target: 'SecondSearch' }),
          fixtureEdge({ source: 'FirstSearch', target: 'Merge' }),
          fixtureEdge({ source: 'SecondSearch', target: 'Merge' }),
          fixtureEdge({ source: 'Merge', target: 'Probe' }),
          fixtureEdge({ source: 'Probe', target: 'Reply' })
        ],
        chatConfig: {
          ...base.chatConfig,
          variables: [
            ...base.chatConfig.variables,
            {
              key: 'query2',
              label: 'query2',
              description: '',
              type: 'input',
              valueType: 'string',
              required: false
            }
          ]
        }
      };
      const appId = await c.create(`dataset-merge-${name}`, graph);
      const chatId = `${c.run}-dataset-merge-${name}`;
      const response = await c.complete(appId, {
        chatId,
        question: keyword,
        stream: true,
        extra: { variables: { query2: secondQuery } }
      });
      success(response);
      const stored = await c.persisted(appId, chatId);
      const rows = stored.rows.map((row) => row.data);
      const left = rows.find((row) => row.nodeId === 'FirstSearch')?.quoteList;
      const right = rows.find((row) => row.nodeId === 'SecondSearch')?.quoteList;
      const observed = rows.find((row) => row.nodeId === 'Probe')?.customOutputs?.result;
      assert.ok(Array.isArray(left) && Array.isArray(right) && observed);
      // 落库详情使用精简引用；对齐两个视图共有的 ID 和完整评分，不误把精简字段当成数据变异。
      const identityAndScore = (items) => items.map(({ id, score }) => ({ id, score }));
      assert.deepEqual(
        identityAndScore(observed.left),
        identityAndScore(left),
        '合并不得修改左侧原始分数'
      );
      assert.deepEqual(
        identityAndScore(observed.right),
        identityAndScore(right),
        '合并不得修改右侧原始分数'
      );
      assert.deepEqual(
        left.map((item) => item.id),
        [dataId]
      );
      assert.deepEqual(
        right.map((item) => item.id),
        name === 'one-empty' ? [] : [dataId]
      );
      assert.deepEqual(
        observed.merged.map((item) => item.id),
        [dataId]
      );
      assert.deepEqual(JSON.parse(response.text.trim()), observed);
      c.record('真实检索引用合并', { name, limit, left, right, merged: observed.merged });
    }
    return '两路真实召回去重、单路为空和 limit=0 均由代码节点消费；上游引用与评分快照不被改写。';
  }
});
