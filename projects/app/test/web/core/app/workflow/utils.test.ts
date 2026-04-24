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
  const makeNode = (
    inputs: any[],
    opts: { id?: string; flowNodeType?: FlowNodeTypeEnum } = {}
  ): Node<FlowNodeItemType> => {
    const id = opts.id ?? 'n1';
    const flowNodeType = opts.flowNodeType ?? FlowNodeTypeEnum.formInput;
    return {
      id,
      type: flowNodeType,
      position: { x: 0, y: 0 },
      data: {
        nodeId: id,
        flowNodeType,
        name: 'test',
        avatar: '',
        inputs,
        outputs: [],
        version: '1',
        intro: ''
      } as any
    };
  };

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

  describe('isTargetRef 匹配边界', () => {
    it('不清理非全局引用 [nodeId, outputId]', () => {
      const nodes = [makeNode([{ key: 'k1', value: ['n2', 'foo'], renderTypeList: [] }])];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
      expect(result[0].data.inputs[0].value).toEqual(['n2', 'foo']);
    });

    it('不匹配 [VARIABLE_NODE_ID, ""]（空 key）', () => {
      const nodes = [makeNode([{ key: 'k1', value: [VARIABLE_NODE_ID, ''], renderTypeList: [] }])];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['']));
      expect(result[0].data.inputs[0].value).toEqual([VARIABLE_NODE_ID, '']);
    });

    it('不匹配不在 changedKeys 中的 key', () => {
      const nodes = [
        makeNode([{ key: 'k1', value: [VARIABLE_NODE_ID, 'other'], renderTypeList: [] }])
      ];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
      expect(result[0].data.inputs[0].value).toEqual([VARIABLE_NODE_ID, 'other']);
    });

    it.each([
      ['string', 'hello'],
      ['number', 42],
      ['boolean', true],
      ['null', null],
      ['undefined', undefined],
      ['object', { a: 1 }],
      ['primitive array', ['a', 'b', 'c']],
      ['empty array', []],
      ['malformed tuple (length 1)', [VARIABLE_NODE_ID]],
      ['malformed tuple (length 3)', [VARIABLE_NODE_ID, 'foo', 'extra']]
    ])('非引用形态 %s 原样保留', (_, value) => {
      const nodes = [makeNode([{ key: 'k1', value, renderTypeList: [] }])];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
      expect(result[0].data.inputs[0].value).toEqual(value);
    });

    it('同时处理多个 changedKeys', () => {
      const nodes = [
        makeNode([
          { key: 'k1', value: [VARIABLE_NODE_ID, 'foo'], renderTypeList: [] },
          { key: 'k2', value: [VARIABLE_NODE_ID, 'bar'], renderTypeList: [] },
          { key: 'k3', value: [VARIABLE_NODE_ID, 'baz'], renderTypeList: [] }
        ])
      ];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo', 'bar']));
      expect(result[0].data.inputs[0].value).toBeUndefined();
      expect(result[0].data.inputs[1].value).toBeUndefined();
      expect(result[0].data.inputs[2].value).toEqual([VARIABLE_NODE_ID, 'baz']);
    });
  });

  describe('通用引用输入：单引用清理覆盖各节点类型', () => {
    it.each([
      ['chatNode', FlowNodeTypeEnum.chatNode],
      ['datasetSearchNode', FlowNodeTypeEnum.datasetSearchNode],
      ['datasetConcatNode', FlowNodeTypeEnum.datasetConcatNode],
      ['answerNode', FlowNodeTypeEnum.answerNode],
      ['classifyQuestion', FlowNodeTypeEnum.classifyQuestion],
      ['contentExtract', FlowNodeTypeEnum.contentExtract],
      ['agent', FlowNodeTypeEnum.agent],
      ['toolCall', FlowNodeTypeEnum.toolCall],
      ['code', FlowNodeTypeEnum.code],
      ['textEditor', FlowNodeTypeEnum.textEditor],
      ['customFeedback', FlowNodeTypeEnum.customFeedback],
      ['readFiles', FlowNodeTypeEnum.readFiles],
      ['userSelect', FlowNodeTypeEnum.userSelect],
      ['formInput', FlowNodeTypeEnum.formInput],
      ['lafModule', FlowNodeTypeEnum.lafModule],
      ['stopTool', FlowNodeTypeEnum.stopTool],
      ['toolParams', FlowNodeTypeEnum.toolParams],
      ['pluginModule', FlowNodeTypeEnum.pluginModule],
      ['appModule', FlowNodeTypeEnum.appModule]
    ])('%s: 命中的单引用清为 undefined', (_, flowNodeType) => {
      const nodes = [
        makeNode([{ key: 'anyInputKey', value: [VARIABLE_NODE_ID, 'foo'], renderTypeList: [] }], {
          flowNodeType
        })
      ];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
      expect(result[0].data.inputs[0].value).toBeUndefined();
    });
  });

  describe('引用数组输入', () => {
    it.each([
      ['loop', FlowNodeTypeEnum.loop],
      ['parallelRun', FlowNodeTypeEnum.parallelRun]
    ])('%s: loopInputArray 过滤命中项', (_, flowNodeType) => {
      const nodes = [
        makeNode(
          [
            {
              key: NodeInputKeyEnum.nestedInputArray,
              value: [
                [VARIABLE_NODE_ID, 'foo'],
                [VARIABLE_NODE_ID, 'bar'],
                ['other_node', 'x']
              ],
              renderTypeList: []
            }
          ],
          { flowNodeType }
        )
      ];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
      expect(result[0].data.inputs[0].value).toEqual([
        [VARIABLE_NODE_ID, 'bar'],
        ['other_node', 'x']
      ]);
    });

    it('全部命中后引用数组变为空数组', () => {
      const nodes = [
        makeNode([
          {
            key: 'refs',
            value: [
              [VARIABLE_NODE_ID, 'foo'],
              [VARIABLE_NODE_ID, 'bar']
            ],
            renderTypeList: []
          }
        ])
      ];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo', 'bar']));
      expect(result[0].data.inputs[0].value).toEqual([]);
    });
  });

  describe('ifElse 节点补充用例', () => {
    const makeIfElseNode = (groups: any[]) =>
      makeNode([{ key: NodeInputKeyEnum.ifElseList, renderTypeList: [], value: groups }], {
        flowNodeType: FlowNodeTypeEnum.ifElseNode
      });

    it('命中后条件组内 list 变为空数组但保留 group 壳', () => {
      const nodes = [
        makeIfElseNode([
          {
            condition: 'AND',
            list: [{ variable: [VARIABLE_NODE_ID, 'foo'], condition: 'equalTo', value: 'x' }]
          }
        ])
      ];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
      const groups = result[0].data.inputs[0].value as any[];
      expect(groups).toHaveLength(1);
      expect(groups[0].condition).toBe('AND');
      expect(groups[0].list).toEqual([]);
    });

    it('多条件组各自独立处理', () => {
      const nodes = [
        makeIfElseNode([
          {
            condition: 'AND',
            list: [{ variable: [VARIABLE_NODE_ID, 'foo'], condition: '=', value: 'x' }]
          },
          {
            condition: 'OR',
            list: [
              { variable: ['n2', 'out1'], condition: '=', value: [VARIABLE_NODE_ID, 'foo'] },
              { variable: ['n2', 'out1'], condition: '=', value: 'literal' }
            ]
          }
        ])
      ];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
      const groups = result[0].data.inputs[0].value as any[];
      expect(groups[0].list).toEqual([]);
      expect(groups[1].list).toHaveLength(2);
      expect(groups[1].list[0].value).toBeUndefined();
      expect(groups[1].list[0].variable).toEqual(['n2', 'out1']);
      expect(groups[1].list[1].value).toBe('literal');
    });

    it('非全局变量 + 字面值条件原样保留', () => {
      const nodes = [
        makeIfElseNode([
          {
            condition: 'AND',
            list: [{ variable: ['n2', 'out1'], condition: '=', value: 'hello' }]
          }
        ])
      ];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
      const list = (result[0].data.inputs[0].value as any)[0].list;
      expect(list[0]).toEqual({ variable: ['n2', 'out1'], condition: '=', value: 'hello' });
    });

    it('右侧 value 命中时保留 variable + condition，仅清 value/valueType', () => {
      const nodes = [
        makeIfElseNode([
          {
            condition: 'AND',
            list: [
              {
                variable: ['n2', 'out1'],
                condition: 'equalTo',
                value: [VARIABLE_NODE_ID, 'foo'],
                valueType: WorkflowIOValueTypeEnum.string
              }
            ]
          }
        ])
      ];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
      const cond = (result[0].data.inputs[0].value as any)[0].list[0];
      expect(cond.variable).toEqual(['n2', 'out1']);
      expect(cond.condition).toBe('equalTo');
      expect(cond.value).toBeUndefined();
      expect(cond.valueType).toBeUndefined();
    });

    it('空的 ifElseList 原样返回', () => {
      const nodes = [makeIfElseNode([])];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
      expect(result[0].data.inputs[0].value).toEqual([]);
    });
  });

  describe('variableUpdate 节点补充用例', () => {
    const makeVarUpdateNode = (rows: any[]) =>
      makeNode([{ key: NodeInputKeyEnum.updateList, renderTypeList: [], value: rows }], {
        flowNodeType: FlowNodeTypeEnum.variableUpdate
      });

    it('variable 和 value 都未命中：整行保留不动', () => {
      const row = {
        variable: ['n2', 'out1'],
        value: [VARIABLE_NODE_ID, 'other'],
        renderType: 'reference'
      };
      const nodes = [makeVarUpdateNode([row])];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
      expect((result[0].data.inputs[0].value as any)[0]).toEqual(row);
    });

    it('variable 命中优先于 value：整行变空壳并保留 renderType', () => {
      const nodes = [
        makeVarUpdateNode([
          {
            variable: [VARIABLE_NODE_ID, 'bar'],
            value: [VARIABLE_NODE_ID, 'foo'],
            renderType: 'reference'
          }
        ])
      ];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo', 'bar']));
      const row = (result[0].data.inputs[0].value as any)[0];
      expect(row.variable).toBeUndefined();
      expect(row.value).toBeUndefined();
      expect(row.renderType).toBe('reference');
    });

    it('引用数组只命中部分：保留未命中项', () => {
      const nodes = [
        makeVarUpdateNode([
          {
            variable: ['n2', 'out1'],
            value: [
              [VARIABLE_NODE_ID, 'foo'],
              [VARIABLE_NODE_ID, 'other'],
              ['n3', 'out1']
            ],
            renderType: 'reference'
          }
        ])
      ];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
      expect((result[0].data.inputs[0].value as any)[0].value).toEqual([
        [VARIABLE_NODE_ID, 'other'],
        ['n3', 'out1']
      ]);
    });

    it('空 updateList 原样返回', () => {
      const nodes = [makeVarUpdateNode([])];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));
      expect(result[0].data.inputs[0].value).toEqual([]);
    });
  });

  describe('跨节点遍历', () => {
    it('同时处理多个节点、多种 input key', () => {
      const nodes = [
        makeNode([{ key: 'prompt', value: [VARIABLE_NODE_ID, 'foo'], renderTypeList: [] }], {
          id: 'a',
          flowNodeType: FlowNodeTypeEnum.chatNode
        }),
        makeNode([{ key: 'code', value: 'untouched literal', renderTypeList: [] }], {
          id: 'b',
          flowNodeType: FlowNodeTypeEnum.code
        }),
        makeNode(
          [
            {
              key: NodeInputKeyEnum.ifElseList,
              renderTypeList: [],
              value: [
                {
                  condition: 'AND',
                  list: [{ variable: [VARIABLE_NODE_ID, 'foo'], condition: '=', value: 'x' }]
                }
              ]
            }
          ],
          { id: 'c', flowNodeType: FlowNodeTypeEnum.ifElseNode }
        ),
        makeNode(
          [
            {
              key: NodeInputKeyEnum.updateList,
              renderTypeList: [],
              value: [
                {
                  variable: [VARIABLE_NODE_ID, 'foo'],
                  value: ['', '1'],
                  renderType: 'input'
                }
              ]
            }
          ],
          { id: 'd', flowNodeType: FlowNodeTypeEnum.variableUpdate }
        ),
        makeNode(
          [
            {
              key: NodeInputKeyEnum.nestedInputArray,
              value: [
                [VARIABLE_NODE_ID, 'foo'],
                ['n2', 'out1']
              ],
              renderTypeList: []
            }
          ],
          { id: 'e', flowNodeType: FlowNodeTypeEnum.loop }
        )
      ];
      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));

      expect(result[0].data.inputs[0].value).toBeUndefined();
      expect(result[1].data.inputs[0].value).toBe('untouched literal');
      expect((result[2].data.inputs[0].value as any)[0].list).toEqual([]);
      const updRow = (result[3].data.inputs[0].value as any)[0];
      expect(updRow.variable).toBeUndefined();
      expect(updRow.renderType).toBe('input');
      expect(result[4].data.inputs[0].value).toEqual([['n2', 'out1']]);
    });
  });

  describe('不可变性', () => {
    it('不 mutate 入参 nodes，返回新引用', () => {
      const originalValue = [VARIABLE_NODE_ID, 'foo'];
      const originalInput = { key: 'k', value: originalValue, renderTypeList: [] };
      const nodes = [makeNode([originalInput])];
      const snapshot = JSON.stringify(nodes);

      const result = clearGlobalVariableReferencesFromNodes(nodes, new Set(['foo']));

      expect(JSON.stringify(nodes)).toBe(snapshot);
      expect(originalInput.value).toBe(originalValue);
      expect(result).not.toBe(nodes);
      expect(result[0]).not.toBe(nodes[0]);
      expect(result[0].data.inputs[0]).not.toBe(nodes[0].data.inputs[0]);
    });
  });
});
