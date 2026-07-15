import { describe, it, expect } from 'vitest';
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
  adaptStoreNodeInputs,
  nodeTemplate2FlowNode,
  storeNode2FlowNode,
  getNodeAllSource,
  filterWorkflowNodeOutputsByType,
  filterSelectableWorkflowNodeOutputs,
  workflowReferenceValueIsSelectable,
  checkWorkflowNodeAndConnection
} from '@/web/core/workflow/utils';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import { NodeOutputKeyEnum, VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';

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

describe('adaptStoreNodeInputs', () => {
  const createAgentNode = (inputs: StoreNodeItemType['inputs']): StoreNodeItemType => ({
    nodeId: 'agent-node',
    flowNodeType: FlowNodeTypeEnum.agent,
    name: 'Agent',
    inputs,
    outputs: []
  });

  it('should reset legacy Agent resource references to manual selection', () => {
    const inputs: StoreNodeItemType['inputs'] = [
      {
        key: NodeInputKeyEnum.skills,
        label: 'Skills',
        renderTypeList: [FlowNodeInputTypeEnum.selectSkill, FlowNodeInputTypeEnum.reference],
        selectedTypeIndex: 1,
        value: ['source-node', 'skills']
      },
      {
        key: NodeInputKeyEnum.selectedTools,
        label: 'Tools',
        renderTypeList: [FlowNodeInputTypeEnum.selectTool, FlowNodeInputTypeEnum.reference],
        selectedTypeIndex: 1,
        value: ['source-node', 'tools']
      },
      {
        key: NodeInputKeyEnum.datasetSelectList,
        label: 'Datasets',
        renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
        selectedTypeIndex: 1,
        value: ['source-node', 'datasets']
      }
    ];

    const result = adaptStoreNodeInputs(createAgentNode(inputs));

    expect(result).toEqual(
      inputs.map((input) => ({
        ...input,
        selectedTypeIndex: 0,
        value: []
      }))
    );
  });

  it('should preserve manually selected Agent resources and unrelated inputs', () => {
    const selectedSkills = [{ skillId: 'skill-1', name: 'Skill 1' }];
    const promptReference = ['source-node', 'prompt'];
    const inputs: StoreNodeItemType['inputs'] = [
      {
        key: NodeInputKeyEnum.skills,
        label: 'Skills',
        renderTypeList: [FlowNodeInputTypeEnum.selectSkill, FlowNodeInputTypeEnum.reference],
        selectedTypeIndex: 0,
        value: selectedSkills
      },
      {
        key: NodeInputKeyEnum.aiSystemPrompt,
        label: 'Prompt',
        renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
        selectedTypeIndex: 1,
        value: promptReference
      }
    ];

    const result = adaptStoreNodeInputs(createAgentNode(inputs));

    expect(result[0]).toMatchObject({ selectedTypeIndex: 0, value: selectedSkills });
    expect(result[1]).toBe(inputs[1]);
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

describe('filterSelectableWorkflowNodeOutputs', () => {
  const makeOutput = (
    id: string,
    valueType: WorkflowIOValueTypeEnum,
    extra?: Partial<FlowNodeOutputItemType>
  ): FlowNodeOutputItemType => ({
    id,
    key: id,
    label: id,
    type: FlowNodeOutputTypeEnum.static,
    valueType,
    ...extra
  });

  it('filters outputs that cannot be selected by reference selector', () => {
    const outputs: FlowNodeOutputItemType[] = [
      makeOutput('text', WorkflowIOValueTypeEnum.string),
      makeOutput('count', WorkflowIOValueTypeEnum.number),
      makeOutput(NodeOutputKeyEnum.addOutputParam, WorkflowIOValueTypeEnum.string),
      makeOutput('invalid', WorkflowIOValueTypeEnum.string, { invalid: true }),
      makeOutput('error', WorkflowIOValueTypeEnum.string, { type: FlowNodeOutputTypeEnum.error })
    ];

    const result = filterSelectableWorkflowNodeOutputs({
      outputs,
      valueType: WorkflowIOValueTypeEnum.string,
      catchError: false
    });

    expect(result.map((output) => output.id)).toEqual(['text']);
  });

  it('keeps error output only when source node can catch error', () => {
    const outputs: FlowNodeOutputItemType[] = [
      makeOutput('text', WorkflowIOValueTypeEnum.string),
      makeOutput('error', WorkflowIOValueTypeEnum.string, { type: FlowNodeOutputTypeEnum.error })
    ];

    const result = filterSelectableWorkflowNodeOutputs({
      outputs,
      valueType: WorkflowIOValueTypeEnum.string,
      catchError: true
    });

    expect(result.map((output) => output.id)).toEqual(['text', 'error']);
  });
});

describe('workflowReferenceValueIsSelectable', () => {
  const sourceNodes = [
    {
      nodeId: 'source',
      outputs: [
        {
          id: 'text',
          key: 'text',
          label: 'text',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.string
        },
        {
          id: 'count',
          key: 'count',
          label: 'count',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.number
        }
      ]
    }
  ];

  it('returns true when single reference points to an existing selectable output', () => {
    expect(
      workflowReferenceValueIsSelectable({
        value: ['source', 'text'],
        sourceNodes,
        valueType: WorkflowIOValueTypeEnum.string
      })
    ).toBe(true);
  });

  it('returns false when referenced source node has been deleted', () => {
    expect(
      workflowReferenceValueIsSelectable({
        value: ['deleted', 'text'],
        sourceNodes,
        valueType: WorkflowIOValueTypeEnum.string
      })
    ).toBe(false);
  });

  it('returns false when referenced output no longer exists', () => {
    expect(
      workflowReferenceValueIsSelectable({
        value: ['source', 'deleted'],
        sourceNodes,
        valueType: WorkflowIOValueTypeEnum.string
      })
    ).toBe(false);
  });

  it('returns false when referenced output type is not selectable for current value type', () => {
    expect(
      workflowReferenceValueIsSelectable({
        value: ['source', 'count'],
        sourceNodes,
        valueType: WorkflowIOValueTypeEnum.string
      })
    ).toBe(false);
  });

  it('returns false for incomplete reference value', () => {
    expect(
      workflowReferenceValueIsSelectable({
        value: ['source', ''],
        sourceNodes,
        valueType: WorkflowIOValueTypeEnum.string
      })
    ).toBe(false);
  });

  it('returns true for multiple references when at least one item is selectable', () => {
    expect(
      workflowReferenceValueIsSelectable({
        value: [
          ['deleted', 'text'],
          ['source', 'text']
        ],
        sourceNodes,
        valueType: WorkflowIOValueTypeEnum.string
      })
    ).toBe(true);
  });

  it('returns false for multiple references when none of the items are selectable', () => {
    expect(
      workflowReferenceValueIsSelectable({
        value: [
          ['deleted', 'text'],
          ['source', 'deleted']
        ],
        sourceNodes,
        valueType: WorkflowIOValueTypeEnum.string
      })
    ).toBe(false);
  });
});

describe('getNodeAllSource', () => {
  const makeNode = (nodeId: string, parentNodeId?: string): FlowNodeItemType =>
    ({
      nodeId,
      parentNodeId,
      name: nodeId,
      flowNodeType: FlowNodeTypeEnum.formInput,
      inputs: [],
      outputs: [
        {
          id: 'output',
          key: 'output',
          label: 'output',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    }) as FlowNodeItemType;

  const makeNodeWithoutOutputs = (nodeId: string, parentNodeId?: string): FlowNodeItemType =>
    ({
      ...makeNode(nodeId, parentNodeId),
      outputs: []
    }) as FlowNodeItemType;

  const getSourceNodeIds = ({
    nodeId,
    nodes,
    edges
  }: {
    nodeId: string;
    nodes: FlowNodeItemType[];
    edges: Edge[];
  }) => {
    const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]));

    return getNodeAllSource({
      nodeId,
      getNodeById: (nodeId) => (nodeId ? nodeMap.get(nodeId) : undefined),
      edges,
      chatConfig: {} as any,
      t: ((key: string) => key) as any
    }).map((node) => node.nodeId);
  };

  const getSelectableSourceNodeIds = ({
    nodeId,
    nodes,
    edges
  }: {
    nodeId: string;
    nodes: FlowNodeItemType[];
    edges: Edge[];
  }) => {
    const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]));

    return getNodeAllSource({
      nodeId,
      getNodeById: (nodeId) => (nodeId ? nodeMap.get(nodeId) : undefined),
      edges,
      chatConfig: {} as any,
      t: ((key: string) => key) as any
    })
      .filter(
        (node) =>
          filterSelectableWorkflowNodeOutputs({
            outputs: node.outputs,
            valueType: WorkflowIOValueTypeEnum.any,
            catchError: node.catchError
          }).length > 0
      )
      .map((node) => node.nodeId);
  };

  it('orders source nodes by incoming edge distance', () => {
    const nodes = [makeNode('target'), makeNode('direct'), makeNode('ancestor')];
    const edges = [
      { id: 'ancestor-to-direct', source: 'ancestor', target: 'direct' },
      { id: 'direct-to-target', source: 'direct', target: 'target' }
    ] as Edge[];

    expect(getSourceNodeIds({ nodeId: 'target', nodes, edges })).toEqual([
      'direct',
      'ancestor',
      VARIABLE_NODE_ID
    ]);
  });

  it('orders nested node references by nearest edge and keeps global variables last', () => {
    const nodes = [
      makeNode('reply', 'loop'),
      makeNode('loop'),
      makeNode('loopStart', 'loop'),
      makeNode('textConcat'),
      makeNode('pluginStart')
    ];
    const edges = [
      { id: 'plugin-to-text', source: 'pluginStart', target: 'textConcat' },
      { id: 'text-to-loop', source: 'textConcat', target: 'loop' },
      { id: 'loopStart-to-reply', source: 'loopStart', target: 'reply' }
    ] as Edge[];

    expect(getSourceNodeIds({ nodeId: 'reply', nodes, edges })).toEqual([
      'loopStart',
      'textConcat',
      'pluginStart',
      VARIABLE_NODE_ID
    ]);
  });

  it('keeps same-level upstream references before parent references after filtering empty outputs', () => {
    const nodes = [
      makeNode('variableUpdate', 'loop'),
      makeNodeWithoutOutputs('reply', 'loop'),
      makeNode('loop'),
      makeNode('loopStart', 'loop'),
      makeNode('textConcat'),
      makeNode('pluginStart')
    ];
    const edges = [
      { id: 'plugin-to-text', source: 'pluginStart', target: 'textConcat' },
      { id: 'text-to-loop', source: 'textConcat', target: 'loop' },
      { id: 'loopStart-to-reply', source: 'loopStart', target: 'reply' },
      { id: 'reply-to-variable-update', source: 'reply', target: 'variableUpdate' }
    ] as Edge[];

    expect(getSelectableSourceNodeIds({ nodeId: 'variableUpdate', nodes, edges })).toEqual([
      'loopStart',
      'textConcat',
      'pluginStart',
      VARIABLE_NODE_ID
    ]);
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

    // item.valueType 是写入快照，不与目标变量同步——校验只看 value 形态
    it('passes reference array form regardless of stale valueType', () => {
      expect(
        run([
          {
            variable: [VARIABLE_NODE_ID, 'foo'],
            value: [[VARIABLE_NODE_ID, 'bar']],
            valueType: WorkflowIOValueTypeEnum.string,
            renderType: FlowNodeInputTypeEnum.reference
          }
        ])
      ).toBeUndefined();
    });

    // 历史数据：array reference 旧版本存为单引用 [refNode, refOutputId]
    it('passes legacy single-reference form for array valueType', () => {
      expect(
        run([
          {
            variable: [VARIABLE_NODE_ID, 'foo'],
            value: [VARIABLE_NODE_ID, 'bar'],
            valueType: WorkflowIOValueTypeEnum.arrayString,
            renderType: FlowNodeInputTypeEnum.reference
          }
        ])
      ).toBeUndefined();
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
