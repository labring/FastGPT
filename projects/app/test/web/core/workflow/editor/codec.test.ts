import {
  DatasetTagFilterLogicEnum,
  DatasetTagFilterValueModeEnum,
  DatasetTagFilterVersionEnum
} from '@fastgpt/global/core/dataset/constants';
import { HttpNode468 } from '@fastgpt/global/core/workflow/template/system/http468';
import { builtinTemplateProvider } from '@fastgpt/workflow-core/test/template/provider';
import { createWorkflowDocument } from '@fastgpt/workflow-core/domain/document';
import { applyWorkflowCommand } from '@fastgpt/workflow-core/command/apply';
import { encodeWorkflowNodeReferences } from '@fastgpt/workflow-core/reference/codec';
import { getAvailableInputReferences } from '@fastgpt/workflow-core/reference/query';
import { compileStoreWorkflow } from '@fastgpt/workflow-core/store/compile';
import { decompileStoreWorkflow } from '@fastgpt/workflow-core/store/decompile';
import { describe, expect, it, vi } from 'vitest';
import { hydrateWorkflowEditor } from '@fastgpt/global/common/workflow/editor/protocol';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { ToolCallNode } from '@fastgpt/global/core/workflow/template/system/toolCall';
import { VariableConditionEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  hydrateRuntime,
  getWorkflowConnectionError,
  materializeWorkflow,
  serializeRuntime
} from '@/web/core/workflow/editor/codec';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { WorkflowDiagnosticCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { WorkflowDiagnosticSchema } from '@fastgpt/workflow-core/domain/diagnostic';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { hasDebugToolInNodes } from '@fastgpt/global/core/app/tool/utils';
import { serializeWorkflowData } from '@/web/core/workflow/editor/session/workflowPersistence';
import { checkWorkflowBeforeRunOrPublish } from '@/web/core/workflow/check/check';
import { workflowRuntimeToWorkflowDocument } from '@/pageComponents/app/detail/WorkflowComponents/adapters/document';

const t = ((key: string) => key) as never;

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
  it('preserves folded nodes and debug sources through the save and reload path', () => {
    const input = createStoreWorkflow();
    const nodes = input.nodes.map((node) =>
      node.nodeId === 'loop' ? { ...node, isFolded: true, source: 'debug:tmbId:member' } : node
    );
    const runtime = hydrateRuntime({ input: { ...input, nodes }, t });
    const saved = serializeWorkflowData({
      runtimeRef: { current: runtime },
      pendingSaveRevisionRef: { current: undefined }
    });
    expect(saved).toBeDefined();
    if (!saved) throw new Error('workflow not saved');
    expect(saved.nodes.find((node) => node.nodeId === 'loop')).toMatchObject({
      isFolded: true,
      source: 'debug:tmbId:member'
    });
    expect(hasDebugToolInNodes(saved.nodes)).toBe(true);
    const reopened = hydrateRuntime({ input: saved, t });
    expect(reopened.getWorkflowData().nodes.find((node) => node.nodeId === 'loop')).toMatchObject({
      isFolded: true,
      source: 'debug:tmbId:member'
    });
    runtime.dispose();
    reopened.dispose();
  });

  it('restores each output callback by node id after legacy nodes are removed', () => {
    const firstCondition = () => true;
    const secondCondition = () => false;
    const makeNode = (nodeId: string, invalidCondition: () => boolean) => ({
      nodeId,
      name: nodeId,
      flowNodeType: FlowNodeTypeEnum.answerNode,
      inputs: [],
      outputs: [
        {
          id: 'custom',
          key: 'custom',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.string,
          invalidCondition
        }
      ]
    });
    const runtime = hydrateWorkflowEditor({
      nodes: [
        { nodeId: 'old', name: 'old', flowNodeType: 'userGuide', inputs: [], outputs: [] },
        makeNode('first', firstCondition),
        {
          nodeId: 'old-config',
          name: 'old',
          flowNodeType: 'pluginConfig',
          inputs: [],
          outputs: []
        },
        makeNode('second', secondCondition)
      ],
      edges: [],
      chatConfig: {}
    });
    expect(runtime.getNode('old')).toBeUndefined();
    expect(runtime.getNode('old-config')).toBeUndefined();
    expect(runtime.getNode('first')?.outputs[0].invalidCondition).toBe(firstCondition);
    expect(runtime.getNode('second')?.outputs[0].invalidCondition).toBe(secondCondition);
    runtime.dispose();
  });

  it('restores model-dependent output validity for nodes added from the canvas', async () => {
    const { AiChatModule } = await import('@fastgpt/global/core/workflow/template/system/aiChat');
    const { nodeTemplate2FlowNode } = await import('@/web/core/workflow/utils');
    const { canvasNodeToStoreNode } = await import('@/web/core/workflow/editor/canvas/canvasTypes');
    const node = nodeTemplate2FlowNode({ template: AiChatModule, position: { x: 0, y: 0 }, t });
    const modelInput = node.data.inputs.find((input) => input.key === NodeInputKeyEnum.aiModelId);
    if (!modelInput) throw new Error('missing model input');
    modelInput.value = 'reasoning-model';
    const runtime = hydrateRuntime({
      input: { nodes: [], edges: [], chatConfig: {} },
      t,
      getEnvironment: () => ({
        models: [
          {
            modelId: 'reasoning-model',
            model: 'reasoning-model',
            type: ModelTypeEnum.llm,
            config: { maxContext: 1, maxResponse: 1, quoteMaxToken: 1, reasoning: true }
          },
          {
            modelId: 'plain-model',
            model: 'plain-model',
            type: ModelTypeEnum.llm,
            config: { maxContext: 1, maxResponse: 1, quoteMaxToken: 1, reasoning: false }
          }
        ],
        sandbox: { configured: true, planSupported: true }
      })
    });
    expect(
      runtime.dispatch({
        type: 'addNode',
        node: canvasNodeToStoreNode({ ...node, type: node.data.flowNodeType })
      }).ok
    ).toBe(true);
    expect(
      runtime
        .getNode(node.data.nodeId)
        ?.outputs.find((output) => output.id === NodeOutputKeyEnum.reasoningText)?.invalid
    ).toBe(false);
    expect(
      runtime.dispatch({
        type: 'updateField',
        nodeId: node.data.nodeId,
        fieldKey: NodeInputKeyEnum.aiModelId,
        value: 'plain-model'
      }).ok
    ).toBe(true);
    expect(
      runtime
        .getNode(node.data.nodeId)
        ?.outputs.find((output) => output.id === NodeOutputKeyEnum.reasoningText)?.invalid
    ).toBe(true);
    runtime.dispatch({
      type: 'updateField',
      nodeId: node.data.nodeId,
      fieldKey: NodeInputKeyEnum.aiModelId,
      value: 'reasoning-model'
    });
    expect(
      runtime
        .getNode(node.data.nodeId)
        ?.outputs.find((output) => output.id === NodeOutputKeyEnum.reasoningText)?.invalid
    ).toBe(false);
    runtime.dispose();
  });
  it.each([true, false])(
    'preserves disabled outputs across Web save and Core query (reasoning: %s)',
    (reasoning) => {
      const [start] = createStoreWorkflow().nodes;
      const disabled = {
        id: 'disabled-example',
        key: 'disabled-example',
        type: FlowNodeOutputTypeEnum.dynamic,
        valueType: WorkflowIOValueTypeEnum.string,
        invalid: true
      };
      const input = {
        nodes: [
          { ...start, outputs: [...start.outputs, disabled] },
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
                value: 'chat-model'
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
          },
          {
            nodeId: 'consumer',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            name: 'Consumer',
            inputs: [],
            outputs: []
          }
        ],
        edges: [
          {
            source: 'start',
            sourceHandle: 'start-source-right',
            target: 'chat',
            targetHandle: 'chat-target-left'
          },
          {
            source: 'chat',
            sourceHandle: 'chat-source-right',
            target: 'consumer',
            targetHandle: 'consumer-target-left'
          }
        ],
        chatConfig: {}
      };
      const getEnvironment = () => ({
        models: [
          {
            modelId: 'chat-model',
            model: 'chat-model',
            type: ModelTypeEnum.llm,
            config: { maxContext: 1, maxResponse: 1, quoteMaxToken: 1, reasoning }
          }
        ],
        sandbox: { configured: true, planSupported: true }
      });

      const opened = hydrateRuntime({ input, t, getEnvironment });
      const saved = serializeRuntime(opened);
      expect(saved.nodes.flatMap(({ outputs }) => outputs)).toContainEqual(
        expect.objectContaining(disabled)
      );
      expect(() => structuredClone(saved)).not.toThrow();

      const candidates = getAvailableInputReferences({
        document: decompileStoreWorkflow({ workflow: saved }),
        nodeId: 'consumer',
        inputKey: NodeInputKeyEnum.userChatInput
      }).map(({ ref }) => ref);
      expect(candidates).toContainEqual({
        nodeId: 'start',
        outputKey: NodeOutputKeyEnum.userChatInput
      });
      expect(candidates).not.toContainEqual({ nodeId: 'start', outputKey: disabled.key });
      expect(
        candidates.some(
          ({ nodeId, outputKey }) =>
            nodeId === 'chat' && outputKey === NodeOutputKeyEnum.reasoningText
        )
      ).toBe(reasoning);

      const reloaded = hydrateRuntime({ input: saved, t, getEnvironment });
      expect(reloaded.getNode('start')?.outputs.find(({ id }) => id === disabled.id)?.invalid).toBe(
        true
      );
      expect(
        reloaded.getNode('chat')?.outputs.find(({ id }) => id === NodeOutputKeyEnum.reasoningText)
          ?.invalid
      ).toBe(!reasoning);
      opened.dispose();
      reloaded.dispose();
    }
  );

  it('materializes templates and preserves persistence semantics', () => {
    const input = createStoreWorkflow();
    const inputSnapshot = structuredClone(input);
    const runtime = hydrateRuntime({ input, t });
    const output = serializeRuntime(runtime);

    expect(input).toEqual(inputSnapshot);
    expect(serializeRuntime(hydrateRuntime({ input: output, t }))).toEqual(output);
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

  it('repairs a legacy child list before the run and publish check without recording an edit', () => {
    const runtime = hydrateRuntime({ input: createStoreWorkflow(), t });
    const snapshot = runtime.getWorkflowData();
    const { diagnostics } = checkWorkflowBeforeRunOrPublish({
      nodes: snapshot.nodes.map((node) => ({
        id: node.nodeId,
        position: node.position ?? { x: 0, y: 0 },
        data: { ...node, id: node.nodeId }
      })),
      edges: snapshot.edges,
      chatConfig: snapshot.chatConfig
    });
    expect(diagnostics).not.toContainEqual(
      expect.objectContaining({ code: WorkflowDiagnosticCodeEnum.containerChildrenOutOfSync })
    );
    expect(
      serializeRuntime(runtime)
        .nodes.find((node) => node.nodeId === 'loop')
        ?.inputs.find((input) => input.key === NodeInputKeyEnum.childrenNodeIdList)?.value
    ).toEqual(['child']);
    expect(runtime.getSavepoint()).toEqual({ contentRevision: 0, isDirty: false });
    expect(runtime.getHistory().canUndo).toBe(false);
  });

  it('preserves root-level variable references', () => {
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
          {
            source: 'start',
            target: 'mid',
            sourceHandle: 'start-source-right',
            targetHandle: 'mid-target-left'
          },
          {
            source: 'mid',
            target: 'answer',
            sourceHandle: 'mid-source-right',
            targetHandle: 'answer-target-left'
          }
        ],
        chatConfig: {}
      },
      t
    });
    expect(serializeRuntime(runtime).referenceSnapshots).toEqual([]);
    expect(workflowRuntimeToWorkflowDocument({ runtime })).not.toHaveProperty('referenceSnapshots');

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
    expect(workflowRuntimeToWorkflowDocument({ runtime }).referenceSnapshots).toEqual(
      output.referenceSnapshots
    );

    // 保存产物重新入站后历史元数据仍在，重开不会退化成空白 chip
    expect(serializeRuntime(hydrateRuntime({ input: output, t })).referenceSnapshots).toEqual(
      output.referenceSnapshots
    );
  });
});

describe('workflow-core reference boundary', () => {
  it('keeps a historical output ID when a replacement has the same key', () => {
    const workflow = createStoreWorkflow();
    const historic = {
      reference: ['code', 'result'] as [string, string],
      sourceLabel: 'Old Code',
      outputLabel: 'Old Result'
    };
    const value = '{{$code.result$}}/{{$code.new-result-id$}}';
    const fieldKey = NodeInputKeyEnum.answerText;
    const answer = workflow.nodes[1];
    answer.inputs[0].value = value;
    const runtime = hydrateRuntime({
      t,
      input: {
        ...workflow,
        nodes: [
          {
            nodeId: 'code',
            flowNodeType: FlowNodeTypeEnum.code,
            name: 'Code',
            inputs: [],
            outputs: [
              {
                id: 'new-result-id',
                key: 'result',
                label: 'New Result',
                type: FlowNodeOutputTypeEnum.dynamic,
                valueType: WorkflowIOValueTypeEnum.string
              }
            ]
          },
          answer
        ],
        edges: [
          {
            source: 'code',
            target: 'answer',
            sourceHandle: 'code-source-right',
            targetHandle: 'answer-target-left'
          }
        ],
        referenceSnapshots: [historic]
      }
    });

    expect(runtime.getField({ nodeId: 'answer', fieldKey })?.references).toMatchObject([
      { ...historic, code: 'invalid_reference' },
      { reference: ['code', 'new-result-id'], code: 'valid', outputLabel: 'New Result' }
    ]);
    const saved = serializeRuntime(runtime);
    expect(saved.nodes[1].inputs.find(({ key }) => key === fieldKey)?.value).toBe(value);
    expect(saved.referenceSnapshots).toEqual([historic]);
    runtime.dispose();

    const reopened = hydrateRuntime({ input: { ...saved, referenceSnapshots: [] }, t });
    expect(reopened.getField({ nodeId: 'answer', fieldKey })?.references).toMatchObject([
      { reference: historic.reference, code: 'invalid_reference' },
      { reference: ['code', 'new-result-id'], code: 'valid' }
    ]);
    const resaved = serializeRuntime(reopened);
    expect(resaved.nodes[1].inputs.find(({ key }) => key === fieldKey)?.value).toBe(value);
    expect(resaved.referenceSnapshots).toEqual([]);
    reopened.dispose();
  });

  it('preserves literal IF operands while remapping a reference-mode operand', () => {
    const input = {
      key: NodeInputKeyEnum.ifElseList,
      label: 'IF conditions',
      renderTypeList: [FlowNodeInputTypeEnum.custom],
      value: [
        {
          branchId: 'IF',
          condition: 'AND',
          list: [
            { valueType: 'input', value: '{{$code.sample$}} {{$missing.output$}}' },
            { valueType: 'reference', value: ['code', 'sample'] }
          ].map((row) => ({
            ...row,
            variable: ['code', 'out-id'],
            condition: VariableConditionEnum.equalTo
          }))
        }
      ]
    };
    const runtime = hydrateRuntime({
      t,
      input: {
        ...createStoreWorkflow(),
        nodes: encodeWorkflowNodeReferences([
          {
            nodeId: 'code',
            flowNodeType: FlowNodeTypeEnum.code,
            name: 'Code',
            inputs: [],
            outputs: [
              {
                id: 'out-id',
                key: 'sample',
                label: 'Sample',
                type: FlowNodeOutputTypeEnum.dynamic,
                valueType: WorkflowIOValueTypeEnum.string
              }
            ]
          },
          {
            nodeId: 'if',
            flowNodeType: FlowNodeTypeEnum.ifElseNode,
            name: 'IF',
            inputs: [input],
            outputs: []
          }
        ]),
        edges: [
          {
            source: 'code',
            target: 'if',
            sourceHandle: 'code-source-right',
            targetHandle: 'if-target-left'
          }
        ]
      }
    });
    const field = runtime.getField({ nodeId: 'if', fieldKey: input.key });
    expect(field?.references.map(({ reference }) => reference)).toEqual(
      Array.from({ length: 3 }, () => ['code', 'out-id'])
    );
    expect(runtime.getWorkflowIssues().issues.some(({ inputKey }) => inputKey === input.key)).toBe(
      false
    );
    const saved = serializeRuntime(runtime).nodes[1].inputs.find(({ key }) => key === input.key);
    expect(saved?.value[0].list).toEqual([
      input.value[0].list[0],
      { ...input.value[0].list[1], value: ['code', 'out-id'] }
    ]);
    runtime.dispose();
  });
  it('preserves own JSON keys when opening and saving code parameters', () => {
    const value = Object.fromEntries([
      ['__proto__', 'business value'],
      ['regular', 'another value']
    ]);
    const runtime = hydrateRuntime({
      t,
      input: {
        ...createStoreWorkflow(),
        nodes: [
          {
            nodeId: 'code',
            flowNodeType: FlowNodeTypeEnum.code,
            name: 'Code',
            inputs: [
              {
                key: 'literalObject',
                label: 'Object',
                canEdit: true,
                renderTypeList: [FlowNodeInputTypeEnum.JSONEditor],
                valueType: WorkflowIOValueTypeEnum.object,
                value
              }
            ],
            outputs: []
          }
        ],
        edges: []
      }
    });
    const saved = serializeRuntime(runtime).nodes[0].inputs.find(
      ({ key }) => key === 'literalObject'
    )?.value;
    expect(Object.keys(saved)).toEqual(['__proto__', 'regular']);
    expect(saved).toEqual(value);
    runtime.dispose();
  });
  it.each([
    { value: ['red', 'blue'], valueType: WorkflowIOValueTypeEnum.arrayString },
    {
      value: ['start', NodeOutputKeyEnum.userChatInput],
      valueType: WorkflowIOValueTypeEnum.arrayString
    },
    { value: { ref: ['missing', 'output'] }, valueType: WorkflowIOValueTypeEnum.object }
  ])(
    'keeps the hand-entered JSON $value through hydration, checking and save',
    ({ value, valueType }) => {
      const workflow = createStoreWorkflow();
      workflow.nodes = workflow.nodes.slice(0, 2);
      workflow.nodes[0].outputs[0].id = 'stable-output-id';
      const literal = {
        key: 'literalArray',
        label: 'Literal array',
        canEdit: true,
        renderTypeList: [FlowNodeInputTypeEnum.JSONEditor],
        valueType,
        value
      };
      const runtime = hydrateRuntime({
        t,
        input: {
          ...workflow,
          nodes: [
            ...workflow.nodes,
            {
              nodeId: 'code',
              name: 'Code',
              flowNodeType: FlowNodeTypeEnum.code,
              inputs: [literal],
              outputs: []
            }
          ]
        }
      });
      expect(runtime.getField({ nodeId: 'code', fieldKey: literal.key })?.references).toEqual([]);
      expect(
        runtime.getWorkflowIssues().issues.some((issue) => issue.inputKey === literal.key)
      ).toBe(false);
      expect(
        serializeRuntime(runtime)
          .nodes.find(({ nodeId }) => nodeId === 'code')
          ?.inputs.find(({ key }) => key === literal.key)?.value
      ).toEqual(literal.value);
    }
  );
  it('migrates a legacy whole-filter key and preserves its output ID after reopening', () => {
    const fieldKey = NodeInputKeyEnum.collectionFilterMatch;
    const readFilter = ({ nodes }: ReturnType<typeof serializeRuntime>) =>
      nodes.find(({ nodeId }) => nodeId === 'search')?.inputs.find(({ key }) => key === fieldKey);
    const runtime = hydrateRuntime({
      t,
      input: {
        nodes: [
          {
            nodeId: 'code',
            name: 'Code',
            flowNodeType: FlowNodeTypeEnum.code,
            inputs: [],
            outputs: [
              {
                id: 'filter-id',
                key: 'result',
                type: FlowNodeOutputTypeEnum.dynamic,
                valueType: WorkflowIOValueTypeEnum.string
              }
            ]
          },
          {
            nodeId: 'search',
            name: 'Search',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            inputs: [
              {
                key: NodeInputKeyEnum.collectionFilterVersion,
                label: '',
                renderTypeList: [FlowNodeInputTypeEnum.hidden],
                value: DatasetTagFilterVersionEnum.legacy
              },
              {
                key: fieldKey,
                label: 'Tag filter',
                renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
                selectedType: FlowNodeInputTypeEnum.textarea,
                value: ['code', 'result'],
                defaultValue: ['code', 'result']
              }
            ],
            outputs: []
          }
        ],
        edges: [
          {
            source: 'code',
            target: 'search',
            sourceHandle: 'code-source-right',
            targetHandle: 'search-target-left'
          }
        ]
      }
    });

    const saved = serializeRuntime(runtime);
    const reference = ['code', 'filter-id'];
    expect(readFilter(saved)).toMatchObject({ value: reference, defaultValue: reference });
    runtime.dispose();

    const output = saved.nodes[0].outputs.find(({ id }) => id === 'filter-id')!;
    output.key = output.id;
    output.id = 'replacement-id';
    const reopened = hydrateRuntime({ input: { ...saved, referenceSnapshots: [] }, t });
    expect(readFilter(serializeRuntime(reopened))).toMatchObject({
      value: reference,
      defaultValue: reference
    });
    reopened.dispose();
  });

  it('canonicalizes reference conditions and preserves manual dataset filter strings', () => {
    const workflow = createStoreWorkflow();
    const fieldKey = NodeInputKeyEnum.collectionFilterMatch;
    const literalCondition = {
      valueMode: DatasetTagFilterValueModeEnum.input,
      value: ['{{$producer.tag$}}', 'tag-b']
    };
    const runtime = hydrateRuntime({
      input: {
        ...workflow,
        nodes: encodeWorkflowNodeReferences([
          {
            nodeId: 'producer',
            name: 'Producer',
            flowNodeType: FlowNodeTypeEnum.code,
            inputs: [],
            outputs: [
              {
                key: 'tag',
                id: 'output-id',
                type: FlowNodeOutputTypeEnum.dynamic,
                valueType: WorkflowIOValueTypeEnum.string
              }
            ]
          },
          {
            nodeId: 'dataset',
            name: 'Dataset',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            inputs: [
              {
                key: fieldKey,
                label: 'Tag filter',
                renderTypeList: [FlowNodeInputTypeEnum.datasetTagFilter],
                value: {
                  logic: DatasetTagFilterLogicEnum.AND,
                  conditions: [
                    {
                      valueMode: DatasetTagFilterValueModeEnum.reference,
                      value: ['removed', 'filter']
                    },
                    literalCondition,
                    {
                      valueMode: DatasetTagFilterValueModeEnum.reference,
                      value: ['producer', 'tag']
                    }
                  ]
                }
              }
            ],
            outputs: []
          }
        ]),
        edges: [
          {
            source: 'producer',
            target: 'dataset',
            sourceHandle: 'producer-source-right',
            targetHandle: 'dataset-target-left'
          }
        ]
      },
      t
    });

    expect(runtime.getField({ nodeId: 'dataset', fieldKey })?.references).toEqual([
      expect.objectContaining({ reference: ['removed', 'filter'] }),
      expect.objectContaining({ reference: ['producer', 'output-id'] })
    ]);
    expect(runtime.getWorkflowIssues().issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ inputKey: fieldKey, code: 'invalid_reference' })
      ])
    );
    const saved = serializeRuntime(runtime).nodes[1].inputs.find(({ key }) => key === fieldKey);
    expect(saved?.value.conditions[1]).toEqual(literalCondition);
    expect(saved?.value.conditions[2].value).toEqual(['producer', 'output-id']);
    runtime.dispose();
  });

  it('preserves document references compiled to output IDs when opening and saving', () => {
    const workflow = createStoreWorkflow();
    workflow.nodes = workflow.nodes.slice(0, 2);
    workflow.edges = [
      {
        source: 'start',
        target: 'answer',
        sourceHandle: 'start-source-right',
        targetHandle: 'answer-target-left'
      }
    ];
    workflow.nodes[0].outputs[0].id = 'stable-output-id';
    const runtime = hydrateRuntime({
      input: { ...workflow, nodes: encodeWorkflowNodeReferences(workflow.nodes) },
      t
    });
    const value = runtime
      .getNode('answer')!
      .inputs.find((input) => input.key === NodeInputKeyEnum.answerText)!.value;
    expect(value).toEqual(['start', 'stable-output-id']);
    expect(
      runtime.getField({ nodeId: 'answer', kind: 'input', fieldKey: NodeInputKeyEnum.answerText })!
        .references
    ).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'valid' })]));
    const saved = serializeRuntime(runtime);
    expect(
      saved.nodes[1].inputs.find((input) => input.key === NodeInputKeyEnum.answerText)!.value
    ).toEqual(['start', 'stable-output-id']);
    expect(
      hydrateRuntime({ input: saved, t })
        .getNode('answer')!
        .inputs.find((input) => input.key === NodeInputKeyEnum.answerText)!.value
    ).toEqual(['start', 'stable-output-id']);
    expect(workflow.nodes[1].inputs[0].value).toEqual(['start', NodeOutputKeyEnum.userChatInput]);
  });
  it('keeps an existing id when another output key has the same name', () => {
    const workflow = createStoreWorkflow();
    workflow.nodes = workflow.nodes.slice(0, 2);
    workflow.edges = [];
    workflow.nodes[0].outputs[0].id = 'stable-output-id';
    workflow.nodes[0].outputs.push({
      id: 'other-id',
      key: 'stable-output-id',
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string
    });
    workflow.nodes[1].inputs[0].value = ['start', 'stable-output-id'];
    const materialized = materializeWorkflow({ input: workflow, t });
    expect(
      materialized.nodes[1].inputs.find((input) => input.key === NodeInputKeyEnum.answerText)!.value
    ).toEqual(['start', 'stable-output-id']);
    expect(
      materializeWorkflow({ input: materialized, t }).nodes[1].inputs.find(
        (input) => input.key === NodeInputKeyEnum.answerText
      )!.value
    ).toEqual(['start', 'stable-output-id']);
  });
});

describe('workflow-core connection boundary', () => {
  const createRuntime = () =>
    hydrateRuntime({
      input: {
        nodes: [
          {
            nodeId: 'start',
            name: 'Start',
            flowNodeType: FlowNodeTypeEnum.workflowStart,
            inputs: [],
            outputs: []
          },
          {
            nodeId: 'a',
            name: 'A',
            flowNodeType: FlowNodeTypeEnum.textEditor,
            inputs: [],
            outputs: []
          },
          {
            nodeId: 'b',
            name: 'B',
            flowNodeType: FlowNodeTypeEnum.textEditor,
            inputs: [],
            outputs: []
          },
          {
            nodeId: 'loop',
            name: 'Loop',
            flowNodeType: FlowNodeTypeEnum.loopRun,
            inputs: [],
            outputs: []
          }
        ],
        edges: [],
        chatConfig: {}
      },
      t
    });
  const edge = (source: string, target: string) => ({
    source,
    target,
    sourceHandle: `${source}-source-right`,
    targetHandle: `${target}-target-left`
  });

  it('checks nodes added earlier in the same transaction through Core', () => {
    const runtime = createRuntime();
    expect(
      runtime.dispatch([
        {
          type: 'addNode',
          node: {
            nodeId: 'new',
            name: 'New',
            flowNodeType: FlowNodeTypeEnum.textEditor,
            inputs: [],
            outputs: []
          }
        },
        { type: 'connectEdge', edge: edge('start', 'new') }
      ]).ok
    ).toBe(true);
    expect(runtime.getWorkflowData().edges).toEqual([edge('start', 'new')]);
  });

  it('rejects unsupported target handles without publishing or creating history', () => {
    const runtime = createRuntime();
    const before = runtime.getWorkflowData();
    const history = runtime.getHistory();
    const result = runtime.dispatch({
      type: 'connectEdge',
      edge: { ...edge('start', 'a'), targetHandle: 'unsupported' }
    });
    expect(result.ok).toBe(false);
    expect(WorkflowDiagnosticSchema.parse(result.error?.diagnostic).code).toBe(
      WorkflowDiagnosticCodeEnum.edgeHandleUnsupported
    );
    expect(runtime.getWorkflowData()).toEqual(before);
    expect(runtime.getHistory()).toEqual(history);
    expect(runtime.getSavepoint().isDirty).toBe(false);
  });

  it('rejects cycles introduced by earlier commands and rolls back the entire batch', () => {
    const runtime = createRuntime();
    const before = runtime.getWorkflowData();
    expect(
      runtime.dispatch([
        { type: 'connectEdge', edge: edge('a', 'b') },
        { type: 'connectEdge', edge: edge('b', 'a') }
      ]).ok
    ).toBe(false);
    expect(runtime.getWorkflowData()).toEqual(before);
    expect(runtime.getHistory().undoCount).toBe(0);
  });

  it('rechecks incident edges after attaching a node using its staged parent', () => {
    const runtime = createRuntime();
    expect(runtime.dispatch({ type: 'connectEdge', edge: edge('a', 'b') }).ok).toBe(true);
    expect(
      runtime.dispatch({ type: 'attachToContainer', nodeId: 'a', containerId: 'loop' }).ok
    ).toBe(true);
    expect(runtime.getNode('a')!.parentNodeId).toBe('loop');
    expect(runtime.getWorkflowData().edges).toEqual([]);
    expect(runtime.undo().ok).toBe(true);
    expect(runtime.getNode('a')!.parentNodeId).toBeUndefined();
    expect(runtime.getWorkflowData().edges).toEqual([edge('a', 'b')]);
  });
  it('checks live output availability without exporting a persisted document', () => {
    const output = {
      id: 'live',
      key: 'live',
      type: FlowNodeOutputTypeEnum.source,
      valueType: WorkflowIOValueTypeEnum.string
    };
    const runtime = hydrateWorkflowEditor({
      nodes: [
        {
          nodeId: 'start',
          name: 'Start',
          flowNodeType: FlowNodeTypeEnum.workflowStart,
          inputs: [],
          outputs: [{ ...output, invalid: true }]
        },
        {
          nodeId: 'target',
          name: 'Target',
          flowNodeType: FlowNodeTypeEnum.textEditor,
          inputs: [],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {}
    });
    const exportDocument = vi.spyOn(runtime, 'getWorkflowData');
    const query = {
      connection: {
        source: 'start',
        sourceHandle: 'start-source-live',
        target: 'target',
        targetHandle: 'target-target-left'
      },
      edges: [],
      getNodeById: runtime.getNode
    };
    expect(getWorkflowConnectionError(query)).toBeDefined();
    expect(
      runtime.dispatch({
        type: 'updateNode',
        nodeId: 'start',
        patch: { outputs: [{ ...output, invalid: false }] }
      }).ok
    ).toBe(true);
    expect(getWorkflowConnectionError(query)).toBeUndefined();
    expect(exportDocument).not.toHaveBeenCalled();
  });
});

describe('workflow template persistence', () => {
  it('keeps generated HTTP nodes free of deprecated fields while retaining existing custom inputs', async () => {
    const legacyInput = {
      key: 'legacy-token',
      label: 'Legacy token',
      renderTypeList: [FlowNodeInputTypeEnum.input],
      valueType: WorkflowIOValueTypeEnum.string,
      canEdit: true,
      value: 'saved-value'
    };
    const result = await applyWorkflowCommand({
      document: createWorkflowDocument({
        nodes: [
          {
            ...HttpNode468,
            nodeId: 'legacy-http',
            inputs: [...HttpNode468.inputs, legacyInput]
          }
        ]
      }),
      command: {
        type: 'node.add',
        nodeId: 'generated-http',
        template: { kind: 'builtin', templateId: 'http-request' },
        inputOverrides: { [NodeInputKeyEnum.httpReqUrl]: 'https://example.com/hook' }
      },
      dependencies: { templateProvider: builtinTemplateProvider, locale: 'en' }
    });
    const runtime = hydrateRuntime({ input: compileStoreWorkflow(result.document), t });
    const workflow = serializeRuntime(runtime);
    expect(workflow.nodes.find((node) => node.nodeId === 'legacy-http')?.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: NodeInputKeyEnum.addInputParam }),
        expect.objectContaining({
          ...legacyInput,
          renderTypeList: expect.arrayContaining(legacyInput.renderTypeList)
        })
      ])
    );
    const generatedInputs = workflow.nodes.find((node) => node.nodeId === 'generated-http')!.inputs;
    expect(generatedInputs.some((input) => input.key === NodeInputKeyEnum.addInputParam)).toBe(
      false
    );
    expect(generatedInputs.find((input) => input.key === NodeInputKeyEnum.httpReqUrl)?.value).toBe(
      'https://example.com/hook'
    );
  });
});
