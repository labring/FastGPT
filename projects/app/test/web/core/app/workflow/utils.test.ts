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
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/template/system/loopRun/loopRun';
import {
  nodeTemplate2FlowNode,
  storeNode2FlowNode,
  filterWorkflowNodeOutputsByType,
  checkWorkflowNodeAndConnection,
  clearGlobalVariableReferencesFromNodes
} from '@/web/core/workflow/utils';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';

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

  describe('loopRun conditional mode', () => {
    const makeLoopRunNode = (
      mode: LoopRunModeEnum | undefined,
      children: string[]
    ): Node<FlowNodeItemType> => ({
      id: 'loop1',
      type: FlowNodeTypeEnum.loopRun,
      data: {
        nodeId: 'loop1',
        flowNodeType: FlowNodeTypeEnum.loopRun,
        inputs: [
          {
            key: NodeInputKeyEnum.loopRunMode,
            value: mode,
            valueType: WorkflowIOValueTypeEnum.string,
            renderTypeList: [FlowNodeInputTypeEnum.select]
          } as any,
          {
            // 模板里这个字段永远 required: true + value: []，
            // 条件循环模式下不该因此被判无效
            key: NodeInputKeyEnum.loopRunInputArray,
            value: [],
            required: true,
            valueType: WorkflowIOValueTypeEnum.arrayAny,
            renderTypeList: [FlowNodeInputTypeEnum.reference]
          } as any,
          {
            key: NodeInputKeyEnum.childrenNodeIdList,
            value: children,
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          } as any
        ],
        outputs: []
      } as any,
      position: { x: 0, y: 0 }
    });

    const makeChild = (id: string, flowNodeType: FlowNodeTypeEnum): Node<FlowNodeItemType> => ({
      id,
      type: flowNodeType,
      data: {
        nodeId: id,
        flowNodeType,
        inputs: [],
        outputs: []
      } as any,
      position: { x: 0, y: 0 }
    });

    const workflowStart: Node<FlowNodeItemType> = {
      id: 'ws',
      type: FlowNodeTypeEnum.workflowStart,
      data: {
        nodeId: 'ws',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        inputs: [],
        outputs: []
      } as any,
      position: { x: 0, y: 0 }
    };
    const wsToLoop: Edge = {
      id: 'e-ws-loop',
      source: 'ws',
      target: 'loop1',
      type: EDGE_TYPE
    };
    // 通用「节点必须有边」校验针对画布上的每个节点，给循环子节点挂上占位边
    const stubEdge = (nodeId: string): Edge => ({
      id: `e-stub-${nodeId}`,
      source: nodeId,
      target: '__stub__',
      type: EDGE_TYPE
    });

    it('条件循环无 loopRunBreak → 返回该 loopRun 为无效', () => {
      const nodes = [
        workflowStart,
        makeLoopRunNode(LoopRunModeEnum.conditional, ['start1']),
        makeChild('start1', FlowNodeTypeEnum.loopRunStart)
      ];
      const result = checkWorkflowNodeAndConnection({
        nodes,
        edges: [wsToLoop, stubEdge('start1')]
      });
      expect(result).toEqual(['loop1']);
    });

    it('条件循环含 loopRunBreak → 有效', () => {
      const nodes = [
        workflowStart,
        makeLoopRunNode(LoopRunModeEnum.conditional, ['start1', 'break1']),
        makeChild('start1', FlowNodeTypeEnum.loopRunStart),
        makeChild('break1', FlowNodeTypeEnum.loopRunBreak)
      ];
      const startToBreak: Edge = {
        id: 'e-start-break',
        source: 'start1',
        target: 'break1',
        type: EDGE_TYPE
      };
      const result = checkWorkflowNodeAndConnection({
        nodes,
        edges: [wsToLoop, startToBreak]
      });
      expect(result).toBeUndefined();
    });

    it('break 节点不在 childrenNodeIdList 内 → 视为无 break', () => {
      const nodes = [
        workflowStart,
        makeLoopRunNode(LoopRunModeEnum.conditional, ['start1']),
        makeChild('start1', FlowNodeTypeEnum.loopRunStart),
        makeChild('break1', FlowNodeTypeEnum.loopRunBreak) // 属于别的 loopRun
      ];
      const result = checkWorkflowNodeAndConnection({
        nodes,
        edges: [wsToLoop, stubEdge('start1'), stubEdge('break1')]
      });
      expect(result).toEqual(['loop1']);
    });

    it('数组模式不强制要求 loopRunBreak', () => {
      const loop = makeLoopRunNode(LoopRunModeEnum.array, ['start1']);
      // 数组模式下 loopRunInputArray 必填，填个非空 value 走通用校验
      const arrInput = loop.data.inputs.find((i) => i.key === NodeInputKeyEnum.loopRunInputArray)!;
      arrInput.value = ['ws', 'userChatInput'];
      const nodes = [workflowStart, loop, makeChild('start1', FlowNodeTypeEnum.loopRunStart)];
      const result = checkWorkflowNodeAndConnection({
        nodes,
        edges: [wsToLoop, stubEdge('start1')]
      });
      expect(result).toBeUndefined();
    });

    it('条件循环下 loopRunInputArray 必填标记被忽略', () => {
      // 模板静态定义里 loopRunInputArray 永远 required: true + value: []；
      // 条件循环模式下这个字段被 UI 隐藏，不应该因此拦校验。
      const nodes = [
        workflowStart,
        makeLoopRunNode(LoopRunModeEnum.conditional, ['start1', 'break1']),
        makeChild('start1', FlowNodeTypeEnum.loopRunStart),
        makeChild('break1', FlowNodeTypeEnum.loopRunBreak)
      ];
      const startToBreak: Edge = {
        id: 'e-start-break-2',
        source: 'start1',
        target: 'break1',
        type: EDGE_TYPE
      };
      const result = checkWorkflowNodeAndConnection({
        nodes,
        edges: [wsToLoop, startToBreak]
      });
      expect(result).toBeUndefined();
    });
  });
  describe('variableUpdate node', () => {
    const makeVarUpdateNode = (updateList: any[]): Node<FlowNodeItemType> =>
      ({
        id: 'u1',
        type: FlowNodeTypeEnum.variableUpdate,
        position: { x: 0, y: 0 },
        data: {
          nodeId: 'u1',
          flowNodeType: FlowNodeTypeEnum.variableUpdate,
          name: 'update',
          avatar: '',
          inputs: [
            {
              key: NodeInputKeyEnum.updateList,
              valueType: WorkflowIOValueTypeEnum.any,
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              value: updateList
            }
          ],
          outputs: [],
          version: '1',
          intro: ''
        } as any
      }) as any;

    const startNode: Node<FlowNodeItemType> = {
      id: 's1',
      type: FlowNodeTypeEnum.workflowStart,
      position: { x: 0, y: 0 },
      data: {
        nodeId: 's1',
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        name: 'start',
        avatar: '',
        inputs: [],
        outputs: [],
        version: '1',
        intro: ''
      } as any
    };

    const connectedEdges: Edge[] = [{ id: 'e1', source: 's1', target: 'u1', type: EDGE_TYPE }];

    const run = (updateList: any[]) =>
      checkWorkflowNodeAndConnection({
        nodes: [startNode, makeVarUpdateNode(updateList)],
        edges: connectedEdges
      });

    it('flags empty updateList', () => {
      expect(run([])).toEqual(['u1']);
    });

    it('flags row with empty variable', () => {
      expect(
        run([
          {
            variable: ['', ''],
            value: ['', 'hello'],
            valueType: WorkflowIOValueTypeEnum.string,
            renderType: FlowNodeInputTypeEnum.input
          }
        ])
      ).toEqual(['u1']);
    });

    it('flags input row with empty value', () => {
      expect(
        run([
          {
            variable: [VARIABLE_NODE_ID, 'foo'],
            value: ['', ''],
            valueType: WorkflowIOValueTypeEnum.string,
            renderType: FlowNodeInputTypeEnum.input
          }
        ])
      ).toEqual(['u1']);
    });

    it('passes when boolean input has no value (booleanMode decides)', () => {
      expect(
        run([
          {
            variable: [VARIABLE_NODE_ID, 'foo'],
            value: undefined,
            valueType: WorkflowIOValueTypeEnum.boolean,
            booleanMode: 'true',
            renderType: FlowNodeInputTypeEnum.input
          }
        ])
      ).toBeUndefined();
    });

    it('passes when array clear mode has no value', () => {
      expect(
        run([
          {
            variable: [VARIABLE_NODE_ID, 'foo'],
            value: undefined,
            valueType: WorkflowIOValueTypeEnum.arrayString,
            arrayMode: 'clear',
            renderType: FlowNodeInputTypeEnum.input
          }
        ])
      ).toBeUndefined();
    });

    it('flags reference row with incomplete value', () => {
      expect(
        run([
          {
            variable: [VARIABLE_NODE_ID, 'foo'],
            value: ['n2', ''],
            valueType: WorkflowIOValueTypeEnum.string,
            renderType: FlowNodeInputTypeEnum.reference
          }
        ])
      ).toEqual(['u1']);
    });

    it('flags reference array row with empty array', () => {
      expect(
        run([
          {
            variable: [VARIABLE_NODE_ID, 'foo'],
            value: [],
            valueType: WorkflowIOValueTypeEnum.arrayString,
            renderType: FlowNodeInputTypeEnum.reference
          }
        ])
      ).toEqual(['u1']);
    });

    it('passes a fully filled input row', () => {
      expect(
        run([
          {
            variable: [VARIABLE_NODE_ID, 'foo'],
            value: ['', 'hello'],
            valueType: WorkflowIOValueTypeEnum.string,
            renderType: FlowNodeInputTypeEnum.input
          }
        ])
      ).toBeUndefined();
    });

    it('flags variable pointing to a non-existent node id', () => {
      expect(
        run([
          {
            variable: ['ghost-node', 'out1'],
            value: ['', 'hello'],
            valueType: WorkflowIOValueTypeEnum.string,
            renderType: FlowNodeInputTypeEnum.input
          }
        ])
      ).toEqual(['u1']);
    });
  });
});

describe('clearGlobalVariableReferencesFromNodes', () => {
  const makeNode = (inputs: any[]): Node<FlowNodeItemType> => ({
    id: 'n1',
    type: FlowNodeTypeEnum.formInput,
    position: { x: 0, y: 0 },
    data: {
      nodeId: 'n1',
      flowNodeType: FlowNodeTypeEnum.formInput,
      name: 'test',
      avatar: '',
      inputs,
      outputs: [],
      version: '1',
      intro: ''
    } as any
  });

  it('no-op when changedKeys is empty', () => {
    const nodes = [makeNode([{ key: 'k1', value: [VARIABLE_NODE_ID, 'foo'], renderTypeList: [] }])];
    const result = clearGlobalVariableReferencesFromNodes(nodes, new Set());
    expect(result).toBe(nodes);
  });

  it('clears top-level single reference', () => {
    const nodes = [
      makeNode([
        { key: 'k1', value: [VARIABLE_NODE_ID, 'foo'], renderTypeList: [] },
        { key: 'k2', value: [VARIABLE_NODE_ID, 'bar'], renderTypeList: [] }
      ])
    ];
    const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
    expect(result[0].data.inputs[0].value).toBeUndefined();
    expect(result[0].data.inputs[1].value).toEqual([VARIABLE_NODE_ID, 'bar']);
  });

  it('filters top-level reference array', () => {
    const nodes = [
      makeNode([
        {
          key: 'k1',
          value: [
            [VARIABLE_NODE_ID, 'foo'],
            [VARIABLE_NODE_ID, 'bar'],
            ['some_node_id', 'x']
          ],
          renderTypeList: []
        }
      ])
    ];
    const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
    expect(result[0].data.inputs[0].value).toEqual([
      [VARIABLE_NODE_ID, 'bar'],
      ['some_node_id', 'x']
    ]);
  });

  it('removes ifElse condition when variable matches; clears value otherwise', () => {
    const nodes = [
      makeNode([
        {
          key: NodeInputKeyEnum.ifElseList,
          renderTypeList: [],
          value: [
            {
              condition: 'AND',
              list: [
                { variable: [VARIABLE_NODE_ID, 'foo'], condition: 'equalTo', value: 'abc' },
                {
                  variable: ['n2', 'out1'],
                  condition: 'equalTo',
                  value: [VARIABLE_NODE_ID, 'foo']
                },
                { variable: ['n2', 'out1'], condition: 'equalTo', value: 'literal' }
              ]
            }
          ]
        }
      ])
    ];
    const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
    const list = (result[0].data.inputs[0].value as any)[0].list;
    expect(list).toHaveLength(2);
    expect(list[0].variable).toEqual(['n2', 'out1']);
    expect(list[0].value).toBeUndefined();
    expect(list[1].value).toBe('literal');
  });

  it('keeps updateList row when variable matches (resets fields); clears only value otherwise', () => {
    const nodes = [
      makeNode([
        {
          key: NodeInputKeyEnum.updateList,
          renderTypeList: [],
          value: [
            {
              variable: [VARIABLE_NODE_ID, 'foo'],
              value: ['', '1'],
              valueType: WorkflowIOValueTypeEnum.number,
              numberOperator: '+',
              renderType: 'input'
            },
            {
              variable: [VARIABLE_NODE_ID, 'bar'],
              value: [VARIABLE_NODE_ID, 'foo'],
              renderType: 'reference'
            },
            {
              variable: [VARIABLE_NODE_ID, 'bar'],
              value: [
                [VARIABLE_NODE_ID, 'foo'],
                ['n2', 'out1']
              ],
              renderType: 'reference'
            }
          ]
        }
      ])
    ];
    const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
    const updates = result[0].data.inputs[0].value as any[];
    expect(updates).toHaveLength(3);
    // 行 1：variable 命中 → 保留空壳行，清所有类型字段，保留 renderType
    expect(updates[0].variable).toBeUndefined();
    expect(updates[0].value).toBeUndefined();
    expect(updates[0].valueType).toBeUndefined();
    expect(updates[0].numberOperator).toBeUndefined();
    expect(updates[0].renderType).toBe('input');
    // 行 2：只 value 命中
    expect(updates[1].variable).toEqual([VARIABLE_NODE_ID, 'bar']);
    expect(updates[1].value).toBeUndefined();
    // 行 3：引用数组中命中项被过滤
    expect(updates[2].value).toEqual([['n2', 'out1']]);
  });

  it('leaves literal input values in updateList untouched', () => {
    const nodes = [
      makeNode([
        {
          key: NodeInputKeyEnum.updateList,
          renderTypeList: [],
          value: [{ variable: ['n2', 'out1'], value: ['', 'hello'], renderType: 'input' }]
        }
      ])
    ];
    const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
    expect((result[0].data.inputs[0].value as any)[0].value).toEqual(['', 'hello']);
  });
});
