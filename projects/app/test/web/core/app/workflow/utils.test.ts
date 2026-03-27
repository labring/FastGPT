import { vi, describe, it, expect, beforeEach } from 'vitest';
import type {
  FlowNodeItemType,
  FlowNodeTemplateType,
  StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node';
import type { Node, Edge } from 'reactflow';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  EDGE_TYPE
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  nodeTemplate2FlowNode,
  storeNode2FlowNode,
  filterWorkflowNodeOutputsByType,
  checkWorkflowNodeAndConnection,
  checkWorkflowEdgesStructure,
  checkLoopProConditionTermination
} from '@/web/core/workflow/utils';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';

describe('nodeTemplate2FlowNode', () => {
  it('should convert template to flow node', () => {
    const template: FlowNodeTemplateType = {
      id: 'template1',
      templateType: 'formInput',
      name: 'Test Node',
      flowNodeType: FlowNodeTypeEnum.formInput,
      inputs: [],
      outputs: []
    };

    const result = nodeTemplate2FlowNode({
      template,
      position: { x: 100, y: 100 },
      selected: true,
      parentNodeId: 'parent1',
      t: ((key: any) => key) as any
    });

    expect(result).toMatchObject({
      type: FlowNodeTypeEnum.formInput,
      position: { x: 100, y: 100 },
      selected: true,
      data: {
        name: 'Test Node',
        flowNodeType: FlowNodeTypeEnum.formInput,
        parentNodeId: 'parent1'
      }
    });
    expect(result.id).toBeDefined();
  });
});

describe('storeNode2FlowNode', () => {
  it('should convert store node to flow node', () => {
    const storeNode: StoreNodeItemType = {
      nodeId: 'node1',
      flowNodeType: FlowNodeTypeEnum.formInput,
      position: { x: 100, y: 100 },
      inputs: [],
      outputs: [],
      name: 'Test Node',
      version: '1.0'
    };

    const result = storeNode2FlowNode({
      item: storeNode,
      selected: true,
      t: ((key: any) => key) as any
    });

    expect(result).toMatchObject({
      id: 'node1',
      type: FlowNodeTypeEnum.formInput,
      position: { x: 100, y: 100 },
      selected: true
    });
  });

  it('should handle dynamic inputs and outputs', () => {
    const storeNode: StoreNodeItemType = {
      nodeId: 'node1',
      flowNodeType: FlowNodeTypeEnum.formInput,
      position: { x: 0, y: 0 },
      inputs: [
        {
          key: 'dynamicInput',
          label: 'Dynamic Input',
          renderTypeList: [FlowNodeInputTypeEnum.addInputParam]
        }
      ],
      outputs: [
        {
          id: 'dynamicOutput',
          key: 'dynamicOutput',
          label: 'Dynamic Output',
          type: FlowNodeOutputTypeEnum.dynamic
        }
      ],
      name: 'Test Node',
      version: '1.0'
    };

    const result = storeNode2FlowNode({
      item: storeNode,
      t: ((key: any) => key) as any
    });

    expect(result.data.inputs).toHaveLength(3);
    expect(result.data.outputs).toHaveLength(2);
  });

  // 这两个测试涉及到模拟冲突，请运行单独的测试文件:
  // - utils.deprecated.test.ts: 测试 deprecated inputs/outputs
  // - utils.version.test.ts: 测试 version 和 avatar inheritance
});

describe('filterWorkflowNodeOutputsByType', () => {
  it('should filter outputs by type', () => {
    const outputs: FlowNodeOutputItemType[] = [
      {
        id: '1',
        valueType: WorkflowIOValueTypeEnum.string,
        key: '1',
        label: '1',
        type: FlowNodeOutputTypeEnum.static
      },
      {
        id: '2',
        valueType: WorkflowIOValueTypeEnum.number,
        key: '2',
        label: '2',
        type: FlowNodeOutputTypeEnum.static
      },
      {
        id: '3',
        valueType: WorkflowIOValueTypeEnum.boolean,
        key: '3',
        label: '3',
        type: FlowNodeOutputTypeEnum.static
      }
    ];

    const result = filterWorkflowNodeOutputsByType(outputs, WorkflowIOValueTypeEnum.string);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('should return all outputs for any type', () => {
    const outputs: FlowNodeOutputItemType[] = [
      {
        id: '1',
        valueType: WorkflowIOValueTypeEnum.string,
        key: '1',
        label: '1',
        type: FlowNodeOutputTypeEnum.static
      },
      {
        id: '2',
        valueType: WorkflowIOValueTypeEnum.number,
        key: '2',
        label: '2',
        type: FlowNodeOutputTypeEnum.static
      }
    ];

    const result = filterWorkflowNodeOutputsByType(outputs, WorkflowIOValueTypeEnum.any);

    expect(result).toHaveLength(2);
  });

  it('should handle array types correctly', () => {
    const outputs: FlowNodeOutputItemType[] = [
      {
        id: '1',
        valueType: WorkflowIOValueTypeEnum.string,
        key: '1',
        label: '1',
        type: FlowNodeOutputTypeEnum.static
      },
      {
        id: '2',
        valueType: WorkflowIOValueTypeEnum.arrayString,
        key: '2',
        label: '2',
        type: FlowNodeOutputTypeEnum.static
      }
    ];

    const result = filterWorkflowNodeOutputsByType(outputs, WorkflowIOValueTypeEnum.arrayString);
    expect(result).toHaveLength(2);
  });
});

describe('checkWorkflowNodeAndConnection', () => {
  it('should validate nodes and connections', () => {
    const nodes: Node[] = [
      {
        id: 'node1',
        type: FlowNodeTypeEnum.formInput,
        data: {
          nodeId: 'node1',
          flowNodeType: FlowNodeTypeEnum.formInput,
          inputs: [
            {
              key: NodeInputKeyEnum.aiChatDatasetQuote,
              required: true,
              value: undefined,
              renderTypeList: [FlowNodeInputTypeEnum.input]
            }
          ],
          outputs: []
        },
        position: { x: 0, y: 0 }
      }
    ];

    const edges: Edge[] = [
      {
        id: 'edge1',
        source: 'node1',
        target: 'node2',
        type: EDGE_TYPE
      }
    ];

    const result = checkWorkflowNodeAndConnection({ nodes, edges });
    expect(result).toEqual(['node1']);
  });

  it('should handle empty nodes and edges', () => {
    const result = checkWorkflowNodeAndConnection({ nodes: [], edges: [] });
    expect(result).toBeUndefined();
  });
});

describe('checkWorkflowEdgesStructure', () => {
  it('flags loopEnd with outgoing edge', () => {
    const nodes = [
      {
        id: 'le',
        type: FlowNodeTypeEnum.loopEnd,
        data: {
          nodeId: 'le',
          flowNodeType: FlowNodeTypeEnum.loopEnd,
          parentNodeId: 'p',
          inputs: [],
          outputs: []
        },
        position: { x: 0, y: 0 }
      },
      {
        id: 'n2',
        type: FlowNodeTypeEnum.emptyNode,
        data: {
          nodeId: 'n2',
          flowNodeType: FlowNodeTypeEnum.emptyNode,
          parentNodeId: 'p',
          inputs: [],
          outputs: []
        },
        position: { x: 0, y: 0 }
      }
    ] as Node<FlowNodeItemType>[];

    const edges: Edge[] = [{ id: 'e1', source: 'le', target: 'n2', type: EDGE_TYPE } as Edge];

    expect(checkWorkflowEdgesStructure(nodes, edges)).toEqual(['le']);
  });

  it('flags loopProEnd with outgoing edge', () => {
    const nodes = [
      {
        id: 'lpe',
        type: FlowNodeTypeEnum.loopProEnd,
        data: {
          nodeId: 'lpe',
          flowNodeType: FlowNodeTypeEnum.loopProEnd,
          parentNodeId: 'p',
          inputs: [],
          outputs: []
        },
        position: { x: 0, y: 0 }
      },
      {
        id: 'n2',
        type: FlowNodeTypeEnum.emptyNode,
        data: {
          nodeId: 'n2',
          flowNodeType: FlowNodeTypeEnum.emptyNode,
          parentNodeId: 'p',
          inputs: [],
          outputs: []
        },
        position: { x: 0, y: 0 }
      }
    ] as Node<FlowNodeItemType>[];

    const edges: Edge[] = [{ id: 'e1', source: 'lpe', target: 'n2', type: EDGE_TYPE } as Edge];

    expect(checkWorkflowEdgesStructure(nodes, edges)).toEqual(['lpe']);
  });

  it('flags cross-scope edge (mismatched parentNodeId)', () => {
    const nodes = [
      {
        id: 'root',
        type: FlowNodeTypeEnum.workflowStart,
        data: {
          nodeId: 'root',
          flowNodeType: FlowNodeTypeEnum.workflowStart,
          inputs: [],
          outputs: []
        },
        position: { x: 0, y: 0 }
      },
      {
        id: 'child',
        type: FlowNodeTypeEnum.emptyNode,
        data: {
          nodeId: 'child',
          flowNodeType: FlowNodeTypeEnum.emptyNode,
          parentNodeId: 'batch-1',
          inputs: [],
          outputs: []
        },
        position: { x: 0, y: 0 }
      }
    ] as Node<FlowNodeItemType>[];

    const edges: Edge[] = [{ id: 'e1', source: 'root', target: 'child', type: EDGE_TYPE } as Edge];

    expect(checkWorkflowEdgesStructure(nodes, edges)).toEqual(['root']);
  });

  it('allows same-scope edges', () => {
    const nodes = [
      {
        id: 'a',
        type: FlowNodeTypeEnum.emptyNode,
        data: {
          nodeId: 'a',
          flowNodeType: FlowNodeTypeEnum.emptyNode,
          parentNodeId: 'p',
          inputs: [],
          outputs: []
        },
        position: { x: 0, y: 0 }
      },
      {
        id: 'b',
        type: FlowNodeTypeEnum.emptyNode,
        data: {
          nodeId: 'b',
          flowNodeType: FlowNodeTypeEnum.emptyNode,
          parentNodeId: 'p',
          inputs: [],
          outputs: []
        },
        position: { x: 0, y: 0 }
      }
    ] as Node<FlowNodeItemType>[];

    const edges: Edge[] = [{ id: 'e1', source: 'a', target: 'b', type: EDGE_TYPE } as Edge];

    expect(checkWorkflowEdgesStructure(nodes, edges)).toBeUndefined();
  });
});

describe('checkLoopProConditionTermination', () => {
  it('returns loop_pro nodeId when no path from loopStart to loopEnd', () => {
    const nodes = [
      {
        id: 'loop-pro',
        type: FlowNodeTypeEnum.loopPro,
        data: {
          nodeId: 'loop-pro',
          flowNodeType: FlowNodeTypeEnum.loopPro,
          inputs: [{ key: NodeInputKeyEnum.loopProMode, value: 'condition' }],
          outputs: []
        },
        position: { x: 0, y: 0 }
      },
      {
        id: 'ls',
        type: FlowNodeTypeEnum.loopStart,
        data: {
          nodeId: 'ls',
          parentNodeId: 'loop-pro',
          flowNodeType: FlowNodeTypeEnum.loopStart,
          inputs: [],
          outputs: []
        },
        position: { x: 0, y: 0 }
      },
      {
        id: 'le',
        type: FlowNodeTypeEnum.loopProEnd,
        data: {
          nodeId: 'le',
          parentNodeId: 'loop-pro',
          flowNodeType: FlowNodeTypeEnum.loopProEnd,
          inputs: [],
          outputs: []
        },
        position: { x: 0, y: 0 }
      }
    ] as Node<FlowNodeItemType>[];

    expect(checkLoopProConditionTermination({ nodes, edges: [] })).toEqual(['loop-pro']);
  });

  it('returns undefined when loopStart reaches loopEnd inside child subgraph', () => {
    const nodes = [
      {
        id: 'loop-pro',
        type: FlowNodeTypeEnum.loopPro,
        data: {
          nodeId: 'loop-pro',
          flowNodeType: FlowNodeTypeEnum.loopPro,
          inputs: [{ key: NodeInputKeyEnum.loopProMode, value: 'condition' }],
          outputs: []
        },
        position: { x: 0, y: 0 }
      },
      {
        id: 'ls',
        type: FlowNodeTypeEnum.loopStart,
        data: {
          nodeId: 'ls',
          parentNodeId: 'loop-pro',
          flowNodeType: FlowNodeTypeEnum.loopStart,
          inputs: [],
          outputs: []
        },
        position: { x: 0, y: 0 }
      },
      {
        id: 'le',
        type: FlowNodeTypeEnum.loopProEnd,
        data: {
          nodeId: 'le',
          parentNodeId: 'loop-pro',
          flowNodeType: FlowNodeTypeEnum.loopProEnd,
          inputs: [],
          outputs: []
        },
        position: { x: 0, y: 0 }
      }
    ] as Node<FlowNodeItemType>[];

    const edges: Edge[] = [
      {
        id: 'e1',
        source: 'ls',
        target: 'le',
        type: EDGE_TYPE
      }
    ];

    expect(checkLoopProConditionTermination({ nodes, edges })).toBeUndefined();
  });

  it('treats legacy loopEnd under loopPro as termination target for path check', () => {
    const nodes = [
      {
        id: 'loop-pro',
        type: FlowNodeTypeEnum.loopPro,
        data: {
          nodeId: 'loop-pro',
          flowNodeType: FlowNodeTypeEnum.loopPro,
          inputs: [{ key: NodeInputKeyEnum.loopProMode, value: 'condition' }],
          outputs: []
        },
        position: { x: 0, y: 0 }
      },
      {
        id: 'ls',
        type: FlowNodeTypeEnum.loopStart,
        data: {
          nodeId: 'ls',
          parentNodeId: 'loop-pro',
          flowNodeType: FlowNodeTypeEnum.loopStart,
          inputs: [],
          outputs: []
        },
        position: { x: 0, y: 0 }
      },
      {
        id: 'le',
        type: FlowNodeTypeEnum.loopEnd,
        data: {
          nodeId: 'le',
          parentNodeId: 'loop-pro',
          flowNodeType: FlowNodeTypeEnum.loopEnd,
          inputs: [],
          outputs: []
        },
        position: { x: 0, y: 0 }
      }
    ] as Node<FlowNodeItemType>[];

    const edges: Edge[] = [{ id: 'e1', source: 'ls', target: 'le', type: EDGE_TYPE }];

    expect(checkLoopProConditionTermination({ nodes, edges })).toBeUndefined();
  });
});
