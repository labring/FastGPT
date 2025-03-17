import { vi, describe, it, expect } from 'vitest';
import {
  nodeTemplate2FlowNode,
  storeNode2FlowNode,
  storeEdgesRenderEdge,
  computedNodeInputReference,
  getRefData,
  filterWorkflowNodeOutputsByType,
  checkWorkflowNodeAndConnection,
  getLatestNodeTemplate
} from './utils';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum
} from '@fastgpt/global/core/workflow/constants';
import { EmptyNode } from '@fastgpt/global/core/workflow/template/system/emptyNode';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';

describe('nodeTemplate2FlowNode', () => {
  it('should convert template to flow node', () => {
    const template = {
      name: 'Test Node',
      flowNodeType: FlowNodeTypeEnum.userInput,
      inputs: [],
      outputs: []
    };

    const result = nodeTemplate2FlowNode({
      template,
      position: { x: 100, y: 100 },
      selected: true,
      t: (key) => key
    });

    expect(result.type).toBe(FlowNodeTypeEnum.userInput);
    expect(result.position).toEqual({ x: 100, y: 100 });
    expect(result.selected).toBe(true);
    expect(result.data.name).toBe('Test Node');
    expect(result.data.nodeId).toBeDefined();
  });
});

describe('storeNode2FlowNode', () => {
  it('should convert store node to flow node', () => {
    const storeNode = {
      nodeId: 'test-id',
      flowNodeType: FlowNodeTypeEnum.userInput,
      position: { x: 100, y: 100 },
      inputs: [],
      outputs: []
    };

    const result = storeNode2FlowNode({
      item: storeNode,
      selected: true,
      t: (key) => key
    });

    expect(result.id).toBe('test-id');
    expect(result.type).toBe(FlowNodeTypeEnum.userInput);
    expect(result.position).toEqual({ x: 100, y: 100 });
    expect(result.selected).toBe(true);
  });
});

describe('filterWorkflowNodeOutputsByType', () => {
  const outputs = [
    { id: '1', valueType: WorkflowIOValueTypeEnum.string },
    { id: '2', valueType: WorkflowIOValueTypeEnum.number },
    { id: '3', valueType: WorkflowIOValueTypeEnum.boolean },
    { id: '4', valueType: WorkflowIOValueTypeEnum.arrayString }
  ];

  it('should filter string outputs', () => {
    const result = filterWorkflowNodeOutputsByType(outputs, WorkflowIOValueTypeEnum.string);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('should filter array string outputs', () => {
    const result = filterWorkflowNodeOutputsByType(outputs, WorkflowIOValueTypeEnum.arrayString);
    expect(result).toHaveLength(2);
  });

  it('should return all outputs for any type', () => {
    const result = filterWorkflowNodeOutputsByType(outputs, WorkflowIOValueTypeEnum.any);
    expect(result).toHaveLength(4);
  });
});

describe('checkWorkflowNodeAndConnection', () => {
  it('should validate required inputs', () => {
    const nodes = [
      {
        id: 'node1',
        data: {
          nodeId: 'node1',
          flowNodeType: FlowNodeTypeEnum.userInput,
          inputs: [
            {
              key: 'required-input',
              required: true,
              value: undefined,
              renderTypeList: [FlowNodeInputTypeEnum.input]
            }
          ],
          outputs: []
        }
      }
    ];
    const edges = [{ source: 'node1', target: 'node2' }];

    const result = checkWorkflowNodeAndConnection({ nodes, edges });
    expect(result).toEqual(['node1']);
  });

  it('should validate if-else node conditions', () => {
    const nodes = [
      {
        id: 'node1',
        data: {
          nodeId: 'node1',
          flowNodeType: FlowNodeTypeEnum.ifElseNode,
          inputs: [
            {
              key: NodeInputKeyEnum.ifElseList,
              value: [
                {
                  list: [
                    {
                      condition: VariableConditionEnum.equal,
                      value: undefined
                    }
                  ]
                }
              ]
            }
          ],
          outputs: []
        }
      }
    ];
    const edges = [{ source: 'node1', target: 'node2' }];

    const result = checkWorkflowNodeAndConnection({ nodes, edges });
    expect(result).toEqual(['node1']);
  });
});

describe('getLatestNodeTemplate', () => {
  it('should update node to latest template version', () => {
    const node = {
      nodeId: 'test',
      flowNodeType: FlowNodeTypeEnum.userInput,
      inputs: [
        {
          key: 'input1',
          value: 'old-value',
          selectedTypeIndex: 0
        }
      ],
      outputs: [
        {
          key: 'output1',
          id: 'out1',
          value: 'old-output'
        }
      ],
      name: 'Old Name',
      intro: 'Old Intro'
    };

    const template = {
      flowNodeType: FlowNodeTypeEnum.userInput,
      inputs: [
        {
          key: 'input1',
          value: 'new-value'
        }
      ],
      outputs: [
        {
          key: 'output1',
          value: 'new-output'
        }
      ],
      name: 'New Name',
      intro: 'New Intro'
    };

    const result = getLatestNodeTemplate(node, template);

    expect(result.inputs[0].value).toBe('old-value');
    expect(result.outputs[0].value).toBe('old-output');
    expect(result.outputs[0].id).toBe('out1');
    expect(result.name).toBe('Old Name');
    expect(result.intro).toBe('Old Intro');
  });
});
