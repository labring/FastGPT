import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { ToolCallNode } from '@fastgpt/global/core/workflow/template/system/toolCall';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  hydrateRuntime,
  serializeRuntime,
  uiWorkflow2StoreWorkflow
} from '@/web/core/workflow/editor/codec';
import { storeEdge2RenderEdge, storeNode2FlowNode } from '@/web/core/workflow/utils';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const t = ((key: string) => key) as never;

/**
 * 旧持久化路径：initData 的模板物化 + 保存时的 uiWorkflow2StoreWorkflow。
 * 往返夹具用它和新边界（hydrateRuntime + serializeRuntime）比较持久化语义。
 */
const legacyPersist = (input: ReturnType<typeof createStoreWorkflow>) => {
  const toolNodeIds = new Set(
    input.edges
      .filter((edge) => edge.targetHandle === NodeOutputKeyEnum.selectedTools)
      .map((edge) => edge.target)
  );
  const nodes = input.nodes.map((node) =>
    storeNode2FlowNode({ item: node as never, isTool: toolNodeIds.has(node.nodeId), t })
  );
  const edges = input.edges.map((edge) => storeEdge2RenderEdge({ edge: edge as never }));
  return uiWorkflow2StoreWorkflow({ nodes, edges });
};

/**
 * 有意差异：容器尺寸字段（宽、高、容器头部输入区高度）在新边界被 migration 清理，
 * 且模板默认值不再进入文档；旧路径会把它们持久化。比较前先对旧路径输出做同样清理。
 */
const canvasSizeInputKeys = [
  NodeInputKeyEnum.nodeWidth,
  NodeInputKeyEnum.nodeHeight,
  NodeInputKeyEnum.nestedNodeInputHeight
];
const stripCanvasSizeFromLegacy = <T extends { inputs: { key: string }[] }>(nodes: T[]) =>
  nodes.map((node) => ({
    ...node,
    inputs: node.inputs.filter((input) => !canvasSizeInputKeys.includes(input.key as never))
  }));

const createStoreWorkflow = () => ({
  nodes: [
    {
      nodeId: 'start',
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      name: 'Start',
      inputs: [],
      outputs: [
        {
          id: NodeOutputKeyEnum.userChatInput,
          key: NodeOutputKeyEnum.userChatInput,
          type: FlowNodeOutputTypeEnum.source,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    },
    {
      nodeId: 'answer',
      flowNodeType: FlowNodeTypeEnum.answerNode,
      name: 'Answer',
      inputs: [
        {
          key: NodeInputKeyEnum.answerText,
          label: 'Answer',
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          selectedType: FlowNodeInputTypeEnum.reference,
          valueType: WorkflowIOValueTypeEnum.string,
          value: ['start', NodeOutputKeyEnum.userChatInput]
        }
      ],
      outputs: []
    },
    {
      nodeId: 'loop',
      flowNodeType: FlowNodeTypeEnum.loopRun,
      name: 'Loop',
      position: { x: 0, y: 0 },
      inputs: [
        {
          key: NodeInputKeyEnum.childrenNodeIdList,
          label: '',
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          valueType: WorkflowIOValueTypeEnum.arrayString,
          value: ['stale']
        },
        {
          key: NodeInputKeyEnum.nodeWidth,
          label: '',
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          valueType: WorkflowIOValueTypeEnum.number,
          value: 800
        }
      ],
      outputs: []
    },
    {
      nodeId: 'child',
      flowNodeType: FlowNodeTypeEnum.answerNode,
      name: 'Child',
      parentNodeId: 'loop',
      position: { x: 10, y: 10 },
      inputs: [],
      outputs: []
    },
    {
      nodeId: 'tool',
      flowNodeType: FlowNodeTypeEnum.toolCall,
      name: 'Tool',
      inputs: [
        {
          key: 'dynamicInput',
          label: 'Dynamic input',
          renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.agentGenerated],
          selectedType: FlowNodeInputTypeEnum.agentGenerated,
          valueType: WorkflowIOValueTypeEnum.string,
          value: 'generated'
        }
      ],
      outputs: ToolCallNode.outputs
    }
  ],
  edges: [
    {
      source: 'start',
      target: 'answer',
      sourceHandle: 'source',
      targetHandle: 'target'
    },
    {
      source: 'start',
      target: 'answer',
      sourceHandle: 'source',
      targetHandle: 'target'
    },
    {
      source: 'start',
      target: 'tool',
      sourceHandle: NodeOutputKeyEnum.selectedTools,
      targetHandle: NodeOutputKeyEnum.selectedTools
    },
    {
      source: 'missing',
      target: 'answer',
      sourceHandle: 'source',
      targetHandle: 'target'
    }
  ],
  chatConfig: {}
});

describe('workflow editor codec', () => {
  it('does not persist editor-only output invalid state', () => {
    const input = createStoreWorkflow();
    const node = input.nodes.find((item) => item.nodeId === 'answer');
    if (!node) throw new Error('answer node fixture missing');
    node.outputs = node.outputs.map((output) => ({ ...output, invalid: true }));

    const output = serializeRuntime(hydrateRuntime({ input, t }));

    expect(output.nodes.flatMap((item) => item.outputs).every((item) => !('invalid' in item))).toBe(
      true
    );
  });

  it('recomputes runtime-owned output invalid state after save and reload', () => {
    const input = {
      nodes: [
        {
          nodeId: 'chat',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          name: 'Chat',
          inputs: [
            {
              key: NodeInputKeyEnum.aiModelId,
              label: 'Model',
              renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel],
              valueType: WorkflowIOValueTypeEnum.string,
              value: 'reasoning-model'
            }
          ],
          outputs: [
            {
              id: NodeOutputKeyEnum.reasoningText,
              key: NodeOutputKeyEnum.reasoningText,
              type: FlowNodeOutputTypeEnum.static,
              valueType: WorkflowIOValueTypeEnum.string,
              invalid: true
            }
          ]
        }
      ],
      edges: [],
      chatConfig: {}
    };
    const getEnvironment = () => ({
      models: [
        {
          modelId: 'reasoning-model',
          model: 'reasoning-model',
          type: ModelTypeEnum.llm,
          config: {
            maxContext: 1,
            maxResponse: 1,
            quoteMaxToken: 1,
            reasoning: true
          }
        }
      ],
      sandbox: { configured: true, planSupported: true }
    });

    const saved = serializeRuntime(hydrateRuntime({ input, t, getEnvironment }));
    expect(
      saved.nodes.flatMap((node) => node.outputs).every((output) => !('invalid' in output))
    ).toBe(true);

    const reloaded = hydrateRuntime({ input: saved, t, getEnvironment });
    expect(
      reloaded
        .getNode('chat')
        ?.outputs.find((output) => output.id === NodeOutputKeyEnum.reasoningText)?.invalid
    ).toBe(false);
  });

  it('materializes templates and preserves persistence semantics', () => {
    const input = createStoreWorkflow();
    const inputSnapshot = structuredClone(input);
    const runtime = hydrateRuntime({ input, t });
    const output = serializeRuntime(runtime);

    expect(input).toEqual(inputSnapshot);
    expect(output.nodes.map((node) => node.nodeId)).toEqual([
      'start',
      'answer',
      'loop',
      'child',
      'tool'
    ]);
    expect(
      output.nodes
        .find((node) => node.nodeId === 'answer')
        ?.inputs.find((item) => item.key === NodeInputKeyEnum.answerText)?.value
    ).toEqual(['start', NodeOutputKeyEnum.userChatInput]);
    // Runtime 首次 hydrate 保留存量派生值；它只在实际结构命令后重算。
    expect(
      output.nodes
        .find((node) => node.nodeId === 'loop')
        ?.inputs.find((item) => item.key === NodeInputKeyEnum.childrenNodeIdList)?.value
    ).toEqual(['stale']);
    expect(
      output.nodes.find((node) => node.nodeId === 'loop')?.inputs.map((item) => item.key)
    ).not.toContain(NodeInputKeyEnum.nodeWidth);
    expect(
      output.nodes
        .find((node) => node.nodeId === 'tool')
        ?.inputs.find((item) => item.key === 'dynamicInput')
    ).toMatchObject({
      key: 'dynamicInput',
      selectedType: FlowNodeInputTypeEnum.agentGenerated,
      value: 'generated'
    });
    expect(
      output.nodes
        .find((node) => node.nodeId === 'tool')
        ?.inputs.find((item) => item.key === NodeInputKeyEnum.userChatInput)
    ).toMatchObject({
      key: NodeInputKeyEnum.userChatInput,
      selectedType: FlowNodeInputTypeEnum.agentGenerated
    });
    expect(output.edges).toEqual([
      {
        source: 'start',
        target: 'answer',
        sourceHandle: 'source',
        targetHandle: 'target'
      },
      {
        source: 'start',
        target: 'answer',
        sourceHandle: 'source',
        targetHandle: 'target'
      },
      {
        source: 'start',
        target: 'tool',
        sourceHandle: NodeOutputKeyEnum.selectedTools,
        targetHandle: NodeOutputKeyEnum.selectedTools
      }
    ]);
  });

  it('round-trips serialized runtime output through a fresh runtime', () => {
    const runtime = hydrateRuntime({ input: createStoreWorkflow(), t });
    const first = serializeRuntime(runtime);
    const nextRuntime = hydrateRuntime({ input: first, t });

    expect(serializeRuntime(nextRuntime)).toEqual(first);
  });

  it('matches the legacy persistence path on current-shaped workflows', () => {
    const input = createStoreWorkflow();
    const viaCodec = serializeRuntime(hydrateRuntime({ input, t }));
    const viaLegacy = legacyPersist(input);

    expect(viaCodec.nodes).toEqual(stripCanvasSizeFromLegacy(viaLegacy.nodes));
    expect(viaCodec.edges).toEqual(viaLegacy.edges);
  });

  it('preserves root-level variable references like the legacy path', () => {
    const input = {
      ...createStoreWorkflow(),
      chatConfig: {
        variables: [
          {
            id: 'var1',
            key: 'customVar',
            label: 'Custom',
            type: VariableInputEnum.custom,
            valueType: WorkflowIOValueTypeEnum.string,
            list: [],
            defaultValue: '',
            description: '',
            isRequired: false
          }
        ]
      }
    };
    input.nodes[1].inputs[0].value = [VARIABLE_NODE_ID, 'customVar'];

    const viaCodec = serializeRuntime(hydrateRuntime({ input, t }));

    expect(
      viaCodec.nodes
        .find((node) => node.nodeId === 'answer')
        ?.inputs.find((item) => item.key === NodeInputKeyEnum.answerText)?.value
    ).toEqual([VARIABLE_NODE_ID, 'customVar']);
    expect(viaCodec.nodes).toEqual(stripCanvasSizeFromLegacy(legacyPersist(input).nodes));
  });

  it('migrates legacy structures at the inbound boundary', () => {
    const input = {
      nodes: [
        {
          nodeId: 'legacy',
          flowNodeType: 'lafModule',
          name: 'Legacy',
          avatar: null,
          position: null,
          inputs: [{ key: 'old', label: null, renderTypeList: [], value: null }],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {}
    };

    const output = serializeRuntime(hydrateRuntime({ input, t }));

    // 旧结构在新边界被迁移为当前 canonical 形状：未知节点类型降级为空节点，历史 null 被清理。
    expect(output.nodes).toHaveLength(1);
    expect(output.nodes[0].flowNodeType).toBe(FlowNodeTypeEnum.emptyNode);
    expect(output.nodes[0].avatar).toBe('');
  });

  it('keeps dead references and exports their snapshots at the outbound boundary', () => {
    const runtime = hydrateRuntime({
      input: {
        nodes: [
          {
            nodeId: 'start',
            flowNodeType: FlowNodeTypeEnum.workflowStart,
            name: 'Start',
            inputs: [],
            outputs: [
              {
                id: NodeOutputKeyEnum.userChatInput,
                key: NodeOutputKeyEnum.userChatInput,
                type: FlowNodeOutputTypeEnum.source,
                valueType: WorkflowIOValueTypeEnum.string
              }
            ]
          },
          {
            nodeId: 'mid',
            flowNodeType: FlowNodeTypeEnum.answerNode,
            name: 'Middle',
            avatar: 'core/workflow/template/answer',
            inputs: [],
            outputs: [
              {
                id: 'text',
                key: 'text',
                type: FlowNodeOutputTypeEnum.source,
                valueType: WorkflowIOValueTypeEnum.string,
                label: 'Middle Text'
              }
            ]
          },
          {
            nodeId: 'answer',
            flowNodeType: FlowNodeTypeEnum.answerNode,
            name: 'Answer',
            inputs: [
              {
                key: NodeInputKeyEnum.answerText,
                label: 'Answer',
                renderTypeList: [FlowNodeInputTypeEnum.reference],
                selectedType: FlowNodeInputTypeEnum.reference,
                valueType: WorkflowIOValueTypeEnum.string,
                value: [['mid', 'text']]
              }
            ],
            outputs: []
          }
        ],
        edges: [
          { source: 'start', target: 'mid', sourceHandle: 'source', targetHandle: 'target' },
          { source: 'mid', target: 'answer', sourceHandle: 'source', targetHandle: 'target' }
        ],
        chatConfig: {}
      },
      t
    });
    expect(serializeRuntime(runtime).referenceSnapshots).toEqual([]);

    expect(runtime.dispatch({ type: 'removeNodes', nodeIds: ['mid'] }).ok).toBe(true);
    const output = serializeRuntime(runtime);

    // 出站裁剪已删：死引用原样进保存数据，否则快照没有 consumer，重开后无从展示历史名字
    expect(
      output.nodes
        .find((node) => node.nodeId === 'answer')
        ?.inputs.find((item) => item.key === NodeInputKeyEnum.answerText)?.value
    ).toEqual([['mid', 'text']]);
    expect(output.referenceSnapshots).toHaveLength(1);
    expect(output.referenceSnapshots[0]).toMatchObject({
      reference: ['mid', 'text'],
      sourceLabel: 'Middle',
      outputLabel: 'Middle Text'
    });

    // 保存产物重新入站后历史元数据仍在，重开不会退化成空白 chip
    expect(serializeRuntime(hydrateRuntime({ input: output, t })).referenceSnapshots).toEqual(
      output.referenceSnapshots
    );
  });
});
