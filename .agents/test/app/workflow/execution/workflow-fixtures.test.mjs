import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWorkflowFixtures, validateFixture } from './workflow-fixtures.mjs';

test('Agent 工具夹具遵循当前选择工具的结构，同时保留变量引用格式', () => {
  const graph = buildWorkflowFixtures()['agent-child'];
  const agent = graph.nodes.find((node) => node.nodeId === 'Agent');
  const tools = agent.inputs.find((input) => input.key === 'agent_selectedTools');

  assert.doesNotThrow(() => validateFixture(graph));
  for (const value of [[{ toolId: 'child' }], [{ id: 'child' }], [{ id: 1, config: {} }]]) {
    tools.value = value;
    assert.throws(() => validateFixture(graph));
  }
  tools.value = ['VARIABLE_NODE_ID', 'tools'];
  assert.doesNotThrow(() => validateFixture(graph));
});
