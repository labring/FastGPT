import assert from 'node:assert/strict';
import { runNodeCase } from '../../../support/runtime.mjs';
import { success } from '../../../support/scenario.mjs';
import { runHttpWorkflow, workflowScenario } from './workflow-api.mjs';

/** 执行一次真实沙盒参数链，并同时核对节点输入、输出及下游消费。 */
async function runProbe(c, { name, graph, expected }) {
  const appId = await c.create(name, graph);
  const question = `${c.run}-${name}`;
  const response = await c.complete(appId, { chatId: question, question, stream: true });
  success(response);
  const stored = await c.persisted(appId, question);
  const rows = stored.rows.map((row) => row.data);
  const probe = rows.find((row) => row.nodeId === 'Probe');
  assert.ok(probe, '必须存在真实 Probe 节点详情');
  assert.equal(probe.errorText, undefined, '代码沙盒必须真正执行成功');
  const values = expected(question);
  for (const [key, value] of Object.entries(values)) {
    assert.deepEqual(probe.customInputs?.[key], value, `沙盒输入 ${key}`);
    assert.deepEqual(probe.customOutputs?.result?.[key], value, `沙盒输出 ${key}`);
  }
  const reply = rows.find((row) => row.nodeId === 'Reply');
  assert.ok(reply?.textOutput, '必须有消费沙盒输出的下游节点');
  const consumed = JSON.parse(reply.textOutput);
  for (const [key, value] of Object.entries(values)) {
    assert.deepEqual(consumed[key], value, `下游消费 ${key}`);
  }
  assert.deepEqual(JSON.parse(response.text.trim()), consumed);
  c.record('代码沙盒参数与输出链路', { name, question, probe, reply });
}

await runNodeCase('FG-APP-WORKFLOW-057', {
  async C1(context) {
    const c = await workflowScenario(context);
    await runProbe(c, {
      name: 'parameter-source',
      graph: await c.load('basic-parameters'),
      expected: (question) => ({
        literal: 'LITERAL',
        question,
        source: 'SOURCE',
        mixed: `q=${question}|a=A0`
      })
    });
    return '真实代码沙盒的字面量、问题、按输出 ID 引用和混合插值均与下游回复一致。';
  },
  async C2(context) {
    const c = await workflowScenario(context);
    const graph = await c.load('basic-parameters');
    const expected = (question) => ({
      num: 7,
      flag: false,
      obj: { items: [1, 2] },
      arr: [0, false, ''],
      pair: ['left', 'right'],
      refs: [question, 'SOURCE']
    });
    await runProbe(c, { name: 'parameter-types', graph, expected });
    const inputs = graph.nodes.find((node) => node.nodeId === 'Probe').inputs;
    const obj = inputs.find((input) => input.key === 'obj');
    obj.value = ['VARIABLE_NODE_ID', 'obj'];
    obj.selectedType = 'reference';
    inputs.find((input) => input.key === 'arr').value = '[0,false,""]';
    inputs.find((input) => input.key === 'num').value = '0';
    await runProbe(c, {
      name: 'parameter-types-reference',
      graph,
      expected: (question) => ({ ...expected(question), num: 0, obj: { items: [1] } })
    });
    return '真实沙盒及下游均保留数字、布尔、对象、混合数组、普通二元素数组和引用数组的类型。';
  },
  async C3(context) {
    const c = await workflowScenario(context);
    const probeGraph = await c.load('basic-parameters');
    const inputs = probeGraph.nodes.find((node) => node.nodeId === 'Probe').inputs;
    for (const key of ['extra', 'userSelectOptions']) {
      inputs.push({
        key,
        label: key,
        value: ['Source', 'source-output-id'],
        valueType: 'string',
        renderTypeList: ['reference', 'input'],
        selectedType: 'reference',
        canEdit: true
      });
    }
    await runProbe(c, {
      name: 'dynamic-special-name',
      graph: probeGraph,
      expected: () => ({ extra: 'SOURCE', userSelectOptions: 'SOURCE' })
    });
    const text = '中文"引号"\\反斜杠\n换行';
    const { call, observe } = await runHttpWorkflow(c, {
      name: 'http-escaped-input',
      graph: await c.load('basic-http'),
      variables: { text, n: 7, obj: { items: [1, 2] } }
    });
    assert.equal(call.method, 'POST');
    assert.equal(call.headers['x-fg-test'], call.query.runId);
    assert.deepEqual(call.body, {
      runId: call.query.runId,
      text,
      n: 7,
      obj: { items: [1, 2] },
      arr: [0, false, '']
    });
    assert.equal(observe.customInputs['echo-text'], text);
    assert.deepEqual(observe.customInputs['echo-object'], { items: [1, 2] });
    return '非交互节点同名动态参数正常传入；HTTP 真实请求及下游保留中文、转义字符、数字和对象。';
  },
  async C4(context) {
    const c = await workflowScenario(context);
    const graph = await c.load('basic-http');
    graph.chatConfig.variables.push({
      key: 'missing',
      label: 'missing',
      description: '',
      type: 'input',
      valueType: 'any',
      required: false
    });
    const inputs = graph.nodes.find((node) => node.nodeId === 'Observe').inputs;
    inputs.find((input) => input.key === 'code').value =
      'function main(inputs) { return { observed: { ...inputs, missingIsUndefined: inputs.missing === undefined } }; }';
    inputs.push({
      key: 'missing',
      label: 'missing',
      value: ['VARIABLE_NODE_ID', 'missing'],
      valueType: 'any',
      renderTypeList: ['reference', 'input'],
      selectedType: 'reference',
      canEdit: true
    });
    const { observe } = await runHttpWorkflow(c, { name: 'http-output-boundaries', graph });
    const result = observe.customOutputs.observed;
    assert.equal(result.fallback, 'FALLBACK');
    assert.equal(result.optional, undefined);
    assert.equal(result.nil, null);
    assert.equal(result.zero, 0);
    assert.equal(result.flag, false);
    assert.equal(result.empty, '');
    assert.equal(result.missingIsUndefined, true);
    assert.deepEqual(result['echo-object'], { items: [1] });
    assert.deepEqual(result['echo-array'], [0, false, '']);
    assert.deepEqual(result['echo-wildcard'], [0, false, '']);
    return '真实 HTTP 输出提取区分缺失、null、0、false 和空字符串，JSONPath 与数组由沙盒及下游消费。';
  },
  async C5(context) {
    const c = await workflowScenario(context);
    const childGraph = await c.load('basic-tool-child');
    const childId = await c.create('personal-tool', { ...childGraph, type: 'plugin' });
    for (const mode of ['supplied', 'defaults', 'empty']) {
      const graph = await c.load('basic-tool-parent', { __CHILD_TOOL_ID__: childId });
      const tool = graph.nodes.find((node) => node.nodeId === 'Tool');
      if (mode === 'defaults') {
        tool.inputs = tool.inputs.filter(
          (input) => !['label', 'amount', 'enabled'].includes(input.key)
        );
      } else if (mode === 'empty') {
        const label = tool.inputs.find((input) => input.key === 'label');
        label.selectedType = 'input';
        label.value = '';
      }
      const appId = await c.create(`personal-tool-${mode}`, graph);
      const chatId = `${c.run}-${mode}`;
      const response = await c.complete(appId, { chatId, question: chatId, stream: true });
      success(response);
      const stored = await c.persisted(appId, chatId);
      const rows = stored.rows.map((row) => row.data);
      const toolRow = rows.find((row) => row.nodeId === 'Tool');
      const childInput = rows.find((row) => row.nodeId === 'Input');
      const childOutput = rows.find((row) => row.nodeId === 'Output');
      assert.ok(toolRow && childInput && childOutput, '父工具及子输入/输出节点均必须执行');
      const expected =
        mode === 'defaults'
          ? { label: 'TOOL-DEFAULT', amount: 8, enabled: true }
          : { label: mode === 'empty' ? '' : chatId, amount: 0, enabled: false };
      assert.deepEqual(toolRow.pluginOutput, expected);
      assert.deepEqual(childOutput.pluginOutput, expected);
      assert.equal(childInput.parentId, toolRow.id);
      assert.equal(childOutput.parentId, toolRow.id);
      if (mode === 'defaults') assert.equal(toolRow.toolInput, undefined);
      else assert.deepEqual(toolRow.toolInput, expected);
      assert.equal(
        response.text.trim(),
        `TOOL:${expected.label}|${expected.amount}|${expected.enabled}`
      );
      c.record('个人工作流工具的输入与输出', {
        mode,
        childId,
        appId,
        expected,
        toolRow,
        childInput,
        childOutput
      });
    }
    return '真实个人工具完整执行输入和输出，显式假值与省略输入的默认值分别传递给父工作流。';
  }
});
