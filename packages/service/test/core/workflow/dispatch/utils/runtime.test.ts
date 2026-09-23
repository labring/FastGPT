import { describe, expect, it } from 'vitest';
import { getWorkflowNodeRunParams } from '@fastgpt/service/core/workflow/dispatch/utils/runtime';
import { createNode } from '../../utils';
import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { WorkflowVariableStateLike } from '@fastgpt/service/core/workflow/types/runtime';

const createVariableState = (variables: Record<string, unknown> = {}) => {
  const state: WorkflowVariableStateLike = {
    get: (key) => variables[key],
    set: async (key, value) => {
      variables[key] = value;
      return value;
    },
    getStoreValue: (key) => variables[key],
    getFileStoreValueByRuntimeUrl: () => undefined,
    toRuntimeRecord: () => ({ ...variables }),
    toStoreRecord: () => ({ ...variables }),
    clone: () => createVariableState({ ...variables }).state
  };

  return { state };
};

describe('getWorkflowNodeRunParams JSON editor I/O', () => {
  it('JSON editor object 输入会按 JSON 转义变量，引号和换行不会把对象解析成空对象', () => {
    const variableState = createVariableState({
      userName: 'Ada "Lovelace"\nPioneer'
    });
    const node = createNode('tool', FlowNodeTypeEnum.pluginModule);
    node.inputs = [
      {
        key: 'payload',
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.JSONEditor, FlowNodeInputTypeEnum.reference],
        selectedType: FlowNodeInputTypeEnum.JSONEditor,
        value: '{"name": "{{userName}}"}',
        valueType: WorkflowIOValueTypeEnum.object
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map(),
      variableState: variableState.state
    });

    expect(params.payload).toEqual({
      name: 'Ada "Lovelace"\nPioneer'
    });
  });

  it('JSON editor array 输入同样转义字符串变量', () => {
    const variableState = createVariableState({
      tag: 'a, "b"'
    });
    const node = createNode('tool', FlowNodeTypeEnum.tool);
    node.inputs = [
      {
        key: 'tags',
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.JSONEditor],
        value: '["{{tag}}"]',
        valueType: WorkflowIOValueTypeEnum.arrayString
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map(),
      variableState: variableState.state
    });

    expect(params.tags).toEqual(['a, "b"']);
  });

  it('JSON editor 未加引号的对象变量会嵌入为 JSON 对象', () => {
    const variableState = createVariableState({
      profile: { name: 'Ada', city: 'London' }
    });
    const node = createNode('plugin', FlowNodeTypeEnum.pluginModule);
    node.inputs = [
      {
        key: 'payload',
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.JSONEditor],
        value: '{"profile": {{profile}}}',
        valueType: WorkflowIOValueTypeEnum.object
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map(),
      variableState: variableState.state
    });

    expect(params.payload).toEqual({
      profile: { name: 'Ada', city: 'London' }
    });
  });

  it('JSON editor 节点输出引用在引号内也会按 JSON 转义', () => {
    const variableState = createVariableState();
    const node = createNode('plugin', FlowNodeTypeEnum.pluginModule);
    node.inputs = [
      {
        key: 'payload',
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.JSONEditor],
        value: '{"text": "{{$source.output$}}"}',
        valueType: WorkflowIOValueTypeEnum.object
      }
    ];
    const sourceNode = createNode('source', FlowNodeTypeEnum.textEditor);
    sourceNode.outputs = [
      {
        id: 'output',
        key: 'output',
        type: FlowNodeOutputTypeEnum.static,
        value: 'say "hello"',
        valueType: WorkflowIOValueTypeEnum.string
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map([['source', sourceNode]]),
      variableState: variableState.state
    });

    expect(params.payload).toEqual({
      text: 'say "hello"'
    });
  });

  it('普通文本输入仍按字符串替换，不走 JSON 转义', () => {
    const variableState = createVariableState({
      name: 'Ada "Lovelace"'
    });
    const node = createNode('node1', FlowNodeTypeEnum.textEditor);
    node.inputs = [
      {
        key: 'text',
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.textarea],
        value: 'Hello {{name}}',
        valueType: WorkflowIOValueTypeEnum.string
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map(),
      variableState: variableState.state
    });

    expect(params.text).toBe('Hello Ada "Lovelace"');
  });

  it('引用类型 object 输入仍直接解析原始对象', () => {
    const refValue = { nested: true };
    const variableState = createVariableState({ payload: refValue });
    const node = createNode('tool', FlowNodeTypeEnum.pluginModule);
    node.inputs = [
      {
        key: 'payload',
        label: '',
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        value: [VARIABLE_NODE_ID, 'payload'],
        valueType: WorkflowIOValueTypeEnum.object
      }
    ];

    const params = getWorkflowNodeRunParams({
      node,
      runtimeNodesMap: new Map(),
      variableState: variableState.state
    });

    expect(params.payload).toBe(refValue);
  });
});
