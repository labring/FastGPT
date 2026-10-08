import { describe, it, expect, vi } from 'vitest';
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
  filterSelectableWorkflowNodeOutputs
} from '@/web/core/workflow/utils';
import { workflowReferenceValueIsSelectable } from '@fastgpt/global/core/workflow/editor/utils';
import {
  applyWorkflowStartInputAutoFill,
  collectWorkflowStartInputAutoFillPatches,
  collectWorkflowStartAutoFillRevertPatches,
  collectWorkflowStartOutputAutoFillRevertPatches
} from '@/web/core/workflow/workflowStartAutoFill';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import { NodeOutputKeyEnum, VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import { uiWorkflow2StoreWorkflow } from '@/web/core/workflow/editor/codec';
import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';
import { AgentNode } from '@fastgpt/global/core/workflow/template/system/agent';
import { ClassifyQuestionModule } from '@fastgpt/global/core/workflow/template/system/classifyQuestion';
import { ToolCallNode } from '@fastgpt/global/core/workflow/template/system/toolCall';
import { userFilesInput } from '@fastgpt/global/core/workflow/template/system/workflowStart';
import { Input_Template_Dataset_Tag_Filter_Version } from '@fastgpt/global/core/workflow/template/input';

describe('nodeTemplate2FlowNode', () => {
  it('does not prefill either auxiliary model when creating dataset search', () => {
    const node = nodeTemplate2FlowNode({
      template: DatasetSearchModule,
      position: { x: 0, y: 0 },
      defaultModelIds: { llm: 'default-llm', rerank: 'default-rerank' },
      t: ((key: string) => key) as any
    });
    const stored = uiWorkflow2StoreWorkflow({ nodes: [node], edges: [] });
    expect(stored.nodes[0].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
          value: false
        }),
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetSearchRerankModelId
        })
      ])
    );
    expect(
      stored.nodes[0].inputs.find(
        (input) => input.key === NodeInputKeyEnum.datasetSearchRerankModelId
      )?.value
    ).toBeUndefined();
    expect(
      stored.nodes[0].inputs.find(
        (input) => input.key === NodeInputKeyEnum.datasetSearchExtensionModelId
      )?.value
    ).toBeUndefined();
    expect(
      DatasetSearchModule.inputs.find(
        (i) => i.key === NodeInputKeyEnum.datasetSearchExtensionModelId
      )?.value
    ).toBeUndefined();
  });

  it.each([AiChatModule, ToolCallNode, ClassifyQuestionModule])(
    'initializes $flowNodeType models once at node creation',
    (template) => {
      for (const expected of ['remembered', 'system']) {
        const node = nodeTemplate2FlowNode({
          template,
          position: { x: 0, y: 0 },
          t: ((key: string) => key) as any,
          initialModelId: expected
        });
        const stored = uiWorkflow2StoreWorkflow({ nodes: [node], edges: [] });
        expect(
          stored.nodes[0].inputs.find((i) => i.key === NodeInputKeyEnum.aiModelId)?.value
        ).toBe(expected);
      }
      expect(
        template.inputs.find((i) => i.key === NodeInputKeyEnum.aiModelId)?.value
      ).toBeUndefined();
    }
  );

  it('uses the business-resolved default and leaves existing values or references unchanged', () => {
    const create = (value: unknown, reference = false) =>
      nodeTemplate2FlowNode({
        template: {
          ...AiChatModule,
          inputs: AiChatModule.inputs.map((input) =>
            input.key === NodeInputKeyEnum.aiModelId
              ? {
                  ...input,
                  value,
                  ...(reference ? { selectedType: FlowNodeInputTypeEnum.reference } : {})
                }
              : input
          )
        },
        position: { x: 0, y: 0 },
        t: ((key: string) => key) as any,
        initialModelId: 'first'
      }).data.inputs.find((i) => i.key === NodeInputKeyEnum.aiModelId)?.value;
    expect(create(undefined)).toBe('first');
    expect(create(null)).toBe('first');
    expect(create('')).toBe('first');
    expect(create('existing-unavailable')).toBe('existing-unavailable');
    expect(create(undefined, true)).toBeUndefined();
    expect(create(['node', 'modelId'], true)).toEqual(['node', 'modelId']);
    const empty = nodeTemplate2FlowNode({
      template: AiChatModule,
      position: { x: 0, y: 0 },
      t: ((key: string) => key) as any
    });
    expect(
      empty.data.inputs.find((i) => i.key === NodeInputKeyEnum.aiModelId)?.value
    ).toBeUndefined();
  });

  it('keeps explicit template model choices and leaves no-candidate IDs empty', () => {
    const template = {
      ...DatasetSearchModule,
      inputs: DatasetSearchModule.inputs.map((i) =>
        i.key === NodeInputKeyEnum.datasetSearchExtensionModelId ? { ...i, value: 'chosen-id' } : i
      )
    };
    const node = nodeTemplate2FlowNode({
      template,
      position: { x: 0, y: 0 },
      t: ((key: string) => key) as any
    });
    expect(
      node.data.inputs.find((i) => i.key === NodeInputKeyEnum.datasetSearchExtensionModelId)?.value
    ).toBe('chosen-id');
    expect(
      node.data.inputs.find((i) => i.key === NodeInputKeyEnum.datasetSearchRerankModelId)?.value
    ).toBeUndefined();
  });

  it('should initialize template text once before formatting the instance name', () => {
    const template: FlowNodeTemplateType = {
      id: 'template1',
      templateType: 'formInput',
      name: 'workflow:template_name',
      intro: 'workflow:template_intro',
      flowNodeType: FlowNodeTypeEnum.formInput,
      inputs: [],
      outputs: []
    };
    const t = vi.fn(
      (key: string) =>
        ({
          'workflow:template_name': 'Template Name',
          'workflow:template_intro': 'Template Intro'
        })[key] ?? key
    );

    const result = nodeTemplate2FlowNode({
      template,
      position: { x: 100, y: 100 },
      selected: true,
      parentNodeId: 'parent1',
      t: t as any,
      formatName: (name) => `${name} 2`
    });

    expect(result).toMatchObject({
      type: FlowNodeTypeEnum.formInput,
      position: { x: 100, y: 100 },
      selected: true,
      data: {
        name: 'Template Name 2',
        intro: 'Template Intro',
        flowNodeType: FlowNodeTypeEnum.formInput,
        parentNodeId: 'parent1'
      }
    });
    expect(result.id).toBeDefined();
    expect(t.mock.calls.map(([key]) => key)).toEqual([
      'workflow:template_name',
      'workflow:template_intro'
    ]);
  });
});

describe('auto-fill input variables after connecting from workflow start', () => {
  const makeNode = (
    nodeId: string,
    flowNodeType: FlowNodeTypeEnum,
    data?: Partial<FlowNodeItemType>
  ): Node<FlowNodeItemType> =>
    ({
      id: nodeId,
      type: flowNodeType,
      position: { x: 0, y: 0 },
      data: {
        nodeId,
        flowNodeType,
        name: nodeId,
        inputs: [],
        outputs: [],
        ...data
      }
    }) as Node<FlowNodeItemType>;

  const startNode = makeNode('start', FlowNodeTypeEnum.workflowStart, {
    outputs: [
      {
        id: NodeOutputKeyEnum.userChatInput,
        key: NodeOutputKeyEnum.userChatInput,
        label: 'question',
        type: FlowNodeOutputTypeEnum.static,
        valueType: WorkflowIOValueTypeEnum.string
      }
    ]
  });

  const makeFreshConnectedNode = (
    nodeId: string,
    template: FlowNodeTemplateType
  ): Node<FlowNodeItemType> =>
    makeNode(nodeId, template.flowNodeType, {
      inputs: template.inputs.map((input) => ({
        ...input,
        value: input.value ?? input.defaultValue
      })),
      outputs: template.outputs
    });

  const startNodeWithFiles = makeNode('start', FlowNodeTypeEnum.workflowStart, {
    outputs: [...startNode.data.outputs, userFilesInput]
  });

  const applyStartAutoFill = (targetNode: Node<FlowNodeItemType>, workflowStart = startNode) => {
    targetNode.data.inputs = applyWorkflowStartInputAutoFill({
      inputs: targetNode.data.inputs,
      workflowStartNodeId: workflowStart.data.nodeId,
      workflowStartOutputs: workflowStart.data.outputs
    });
  };

  const expectInputValue = (
    node: Node<FlowNodeItemType>,
    inputKey: NodeInputKeyEnum,
    expectedValue: unknown
  ) => {
    expect(
      node.data.inputs.find((input) => input.key === inputKey)?.value,
      `${node.data.name || node.id}.${inputKey} should auto reference workflow start output after connection`
    ).toEqual(expectedValue);
  };

  it.each([
    [
      'AI 对话',
      AiChatModule,
      'ai-chat',
      NodeInputKeyEnum.userChatInput,
      ['start', NodeOutputKeyEnum.userChatInput]
    ],
    [
      '知识库搜索',
      DatasetSearchModule,
      'dataset-search',
      NodeInputKeyEnum.datasetSearchInput,
      [['start', NodeOutputKeyEnum.userChatInput]]
    ],
    [
      '问题分类',
      ClassifyQuestionModule,
      'classify',
      NodeInputKeyEnum.userChatInput,
      ['start', NodeOutputKeyEnum.userChatInput]
    ],
    [
      '工具调用',
      ToolCallNode,
      'tool-call',
      NodeInputKeyEnum.userChatInput,
      ['start', NodeOutputKeyEnum.userChatInput]
    ]
  ] as const)(
    '%s 节点连线后应自动填充用户问题引用',
    (_nodeName, template, nodeId, inputKey, expectedValue) => {
      const targetNode = makeFreshConnectedNode(nodeId, template);
      applyStartAutoFill(targetNode);

      expectInputValue(targetNode, inputKey, expectedValue);
    }
  );

  it('AI 对话节点连线且开启文件上传后应自动填充文件链接引用', () => {
    const targetNode = makeFreshConnectedNode('ai-chat', AiChatModule);
    applyStartAutoFill(targetNode, startNodeWithFiles);

    expectInputValue(targetNode, NodeInputKeyEnum.fileUrlList, [
      ['start', NodeOutputKeyEnum.userFiles]
    ]);
    expect(
      workflowReferenceValueIsSelectable({
        value: targetNode.data.inputs.find((input) => input.key === NodeInputKeyEnum.fileUrlList)
          ?.value as any,
        sourceNodes: [
          {
            nodeId: startNodeWithFiles.data.nodeId,
            outputs: startNodeWithFiles.data.outputs
          }
        ],
        valueType: WorkflowIOValueTypeEnum.arrayString
      })
    ).toBe(true);
  });

  it('收集自动填充补丁时，同一个节点的文件链接和用户问题应同时返回', () => {
    const targetNode = makeFreshConnectedNode('ai-chat', AiChatModule);

    const patches = collectWorkflowStartInputAutoFillPatches({
      nodes: [startNodeWithFiles, targetNode],
      edges: [{ source: 'start', target: 'ai-chat' }],
      workflowStartNode: startNodeWithFiles.data
    });

    expect(
      patches
        .filter((patch) => patch.nodeId === 'ai-chat')
        .map((patch) => patch.key)
        .sort()
    ).toEqual([NodeInputKeyEnum.fileUrlList, NodeInputKeyEnum.userChatInput].sort());
  });

  it('开启文件上传后再关闭，应清理自动写入的 userFiles 引用', () => {
    const aiNode = makeFreshConnectedNode('ai-chat', AiChatModule);
    const datasetNode = makeFreshConnectedNode('dataset-search', DatasetSearchModule);
    const edges: Edge[] = [
      { id: 'e-start-ai', source: 'start', target: 'ai-chat', type: EDGE_TYPE },
      { id: 'e-ai-dataset', source: 'ai-chat', target: 'dataset-search', type: EDGE_TYPE }
    ];
    const nodes = [startNodeWithFiles, aiNode, datasetNode];

    const autoFillPatches = collectWorkflowStartInputAutoFillPatches({
      nodes,
      edges,
      workflowStartNode: startNodeWithFiles.data
    });

    nodes.forEach((node) => {
      node.data.inputs = node.data.inputs.map((input) => {
        const patch = autoFillPatches.find(
          (item) => item.nodeId === node.data.nodeId && item.key === input.key
        );
        return patch ? patch.value : input;
      });
    });

    const revertPatches = collectWorkflowStartOutputAutoFillRevertPatches({
      nodes,
      edges,
      workflowStartNode: startNodeWithFiles.data,
      outputKey: userFilesInput.key
    });

    expect(revertPatches.map((patch) => `${patch.nodeId}:${patch.key}`).sort()).toEqual(
      [
        `ai-chat:${NodeInputKeyEnum.fileUrlList}`,
        `dataset-search:${NodeInputKeyEnum.datasetSearchInput}`
      ].sort()
    );

    nodes.forEach((node) => {
      node.data.inputs = node.data.inputs.map((input) => {
        const patch = revertPatches.find(
          (item) => item.nodeId === node.data.nodeId && item.key === input.key
        );
        return patch ? patch.value : input;
      });
    });

    expectInputValue(aiNode, NodeInputKeyEnum.fileUrlList, undefined);
    expectInputValue(datasetNode, NodeInputKeyEnum.datasetSearchInput, [
      ['start', NodeOutputKeyEnum.userChatInput]
    ]);
  });

  it('流程开始节点可达的间接下游节点也应自动填充用户问题引用', () => {
    const aiNode = makeFreshConnectedNode('ai-chat', AiChatModule);
    const toolNode = makeFreshConnectedNode('tool-call', ToolCallNode);

    const patches = collectWorkflowStartInputAutoFillPatches({
      nodes: [startNode, aiNode, toolNode],
      edges: [
        { source: 'start', target: 'ai-chat' },
        { source: 'ai-chat', target: 'tool-call' }
      ],
      workflowStartNode: startNode.data
    });

    const toolUserQuestionPatch = patches.find(
      (patch) => patch.nodeId === 'tool-call' && patch.key === NodeInputKeyEnum.userChatInput
    );

    expect(toolUserQuestionPatch?.value.value).toEqual(['start', NodeOutputKeyEnum.userChatInput]);
  });

  it('合法手动配置的用户问题引用不应被连线自动填充覆盖', () => {
    const targetNode = makeFreshConnectedNode('ai-chat', AiChatModule);
    const manualReference = [VARIABLE_NODE_ID, 'customQuestion'];
    targetNode.data.inputs = targetNode.data.inputs.map((input) =>
      input.key === NodeInputKeyEnum.userChatInput ? { ...input, value: manualReference } : input
    );

    applyStartAutoFill(targetNode);

    expectInputValue(targetNode, NodeInputKeyEnum.userChatInput, manualReference);
  });

  it('未从流程开始连线时不应自动填充', () => {
    const targetNode = makeFreshConnectedNode('ai-chat', AiChatModule);

    expectInputValue(targetNode, NodeInputKeyEnum.userChatInput, undefined);
  });

  it('断开流程开始连线后应回滚自动填充', () => {
    const targetNode = makeFreshConnectedNode('ai-chat', AiChatModule);
    applyStartAutoFill(targetNode);

    const patches = collectWorkflowStartAutoFillRevertPatches({
      removedEdges: [{ id: 'e1', source: 'start', target: 'ai-chat' }],
      remainingEdges: [],
      getNodeById: (nodeId) => {
        if (nodeId === 'start') return startNode.data;
        if (nodeId === 'ai-chat') return targetNode.data;
        return undefined;
      }
    });

    expect(patches.map((patch) => patch.key)).toContain(NodeInputKeyEnum.userChatInput);
    targetNode.data.inputs = targetNode.data.inputs.map((input) => {
      const patch = patches.find((item) => item.key === input.key);
      return patch ? patch.value : input;
    });

    expectInputValue(targetNode, NodeInputKeyEnum.userChatInput, undefined);
  });

  it('断开流程开始主链路后应回滚整条下游链的自动填充', () => {
    const aiNode = makeFreshConnectedNode('ai-chat', AiChatModule);
    const datasetNode = makeFreshConnectedNode('dataset-search', DatasetSearchModule);
    const classifyNode = makeFreshConnectedNode('classify', ClassifyQuestionModule);
    const toolNode = makeFreshConnectedNode('tool-call', ToolCallNode);
    const nodes = [startNodeWithFiles, aiNode, datasetNode, classifyNode, toolNode];
    const previousEdges: Edge[] = [
      { id: 'e-start-ai', source: 'start', target: 'ai-chat', type: EDGE_TYPE },
      { id: 'e-ai-dataset', source: 'ai-chat', target: 'dataset-search', type: EDGE_TYPE },
      { id: 'e-ai-classify', source: 'ai-chat', target: 'classify', type: EDGE_TYPE },
      { id: 'e-classify-tool', source: 'classify', target: 'tool-call', type: EDGE_TYPE }
    ];

    const autoFillPatches = collectWorkflowStartInputAutoFillPatches({
      nodes,
      edges: previousEdges,
      workflowStartNode: startNodeWithFiles.data
    });

    nodes.forEach((node) => {
      node.data.inputs = node.data.inputs.map((input) => {
        const patch = autoFillPatches.find(
          (item) => item.nodeId === node.data.nodeId && item.key === input.key
        );
        return patch ? patch.value : input;
      });
    });

    const revertPatches = collectWorkflowStartAutoFillRevertPatches({
      removedEdges: [{ id: 'e-start-ai', source: 'start', target: 'ai-chat' }],
      remainingEdges: previousEdges.filter((edge) => edge.id !== 'e-start-ai'),
      getNodeById: (nodeId) => nodes.find((node) => node.data.nodeId === nodeId)?.data
    });

    expect(revertPatches.map((patch) => `${patch.nodeId}:${patch.key}`).sort()).toEqual(
      [
        `ai-chat:${NodeInputKeyEnum.fileUrlList}`,
        `ai-chat:${NodeInputKeyEnum.userChatInput}`,
        `dataset-search:${NodeInputKeyEnum.datasetSearchInput}`,
        `classify:${NodeInputKeyEnum.userChatInput}`,
        `tool-call:${NodeInputKeyEnum.fileUrlList}`,
        `tool-call:${NodeInputKeyEnum.userChatInput}`
      ].sort()
    );

    nodes.forEach((node) => {
      node.data.inputs = node.data.inputs.map((input) => {
        const patch = revertPatches.find(
          (item) => item.nodeId === node.data.nodeId && item.key === input.key
        );
        return patch ? patch.value : input;
      });
    });

    // 回滚后引用值回到未填充状态，必填校验由 Runtime Issue View 负责（见 issueRules.test.ts）。
    expectInputValue(aiNode, NodeInputKeyEnum.userChatInput, undefined);
    expectInputValue(datasetNode, NodeInputKeyEnum.datasetSearchInput, undefined);
    expectInputValue(toolNode, NodeInputKeyEnum.userChatInput, undefined);
  });

  it('断开中间连线后应只回滚失去流程开始可达性的下游节点自动填充', () => {
    const aiNode = makeFreshConnectedNode('ai-chat', AiChatModule);
    const datasetNode = makeFreshConnectedNode('dataset-search', DatasetSearchModule);
    const classifyNode = makeFreshConnectedNode('classify', ClassifyQuestionModule);
    const toolNode = makeFreshConnectedNode('tool-call', ToolCallNode);
    const nodes = [startNodeWithFiles, aiNode, datasetNode, classifyNode, toolNode];
    const previousEdges: Edge[] = [
      { id: 'e-start-ai', source: 'start', target: 'ai-chat', type: EDGE_TYPE },
      { id: 'e-ai-dataset', source: 'ai-chat', target: 'dataset-search', type: EDGE_TYPE },
      { id: 'e-ai-classify', source: 'ai-chat', target: 'classify', type: EDGE_TYPE },
      { id: 'e-classify-tool', source: 'classify', target: 'tool-call', type: EDGE_TYPE }
    ];

    const autoFillPatches = collectWorkflowStartInputAutoFillPatches({
      nodes,
      edges: previousEdges,
      workflowStartNode: startNodeWithFiles.data
    });

    nodes.forEach((node) => {
      node.data.inputs = node.data.inputs.map((input) => {
        const patch = autoFillPatches.find(
          (item) => item.nodeId === node.data.nodeId && item.key === input.key
        );
        return patch ? patch.value : input;
      });
    });

    const remainingEdges = previousEdges.filter((edge) => edge.id !== 'e-ai-classify');
    const revertPatches = collectWorkflowStartAutoFillRevertPatches({
      removedEdges: [{ id: 'e-ai-classify', source: 'ai-chat', target: 'classify' }],
      remainingEdges,
      getNodeById: (nodeId) => nodes.find((node) => node.data.nodeId === nodeId)?.data
    });

    expect(revertPatches.map((patch) => `${patch.nodeId}:${patch.key}`).sort()).toEqual(
      [
        `classify:${NodeInputKeyEnum.userChatInput}`,
        `tool-call:${NodeInputKeyEnum.fileUrlList}`,
        `tool-call:${NodeInputKeyEnum.userChatInput}`
      ].sort()
    );
    expect(
      revertPatches.some(
        (patch) =>
          patch.nodeId === 'dataset-search' && patch.key === NodeInputKeyEnum.datasetSearchInput
      )
    ).toBe(false);

    nodes.forEach((node) => {
      node.data.inputs = node.data.inputs.map((input) => {
        const patch = revertPatches.find(
          (item) => item.nodeId === node.data.nodeId && item.key === input.key
        );
        return patch ? patch.value : input;
      });
    });

    // 只有失去流程开始可达性的分支被回滚，dataset-search 仍保留自动填充的用户问题引用。
    expectInputValue(classifyNode, NodeInputKeyEnum.userChatInput, undefined);
    expectInputValue(toolNode, NodeInputKeyEnum.userChatInput, undefined);
    expect(
      datasetNode.data.inputs.find((input) => input.key === NodeInputKeyEnum.datasetSearchInput)
        ?.value
    ).toContainEqual(['start', NodeOutputKeyEnum.userChatInput]);
  });
});

describe('storeNode2FlowNode', () => {
  it('preserves saved query extension settings despite the new disabled template default', () => {
    const node = storeNode2FlowNode({
      item: {
        ...DatasetSearchModule,
        nodeId: 'saved-search',
        inputs: DatasetSearchModule.inputs.map((input) => {
          if (input.key === NodeInputKeyEnum.datasetSearchUsingExtensionQuery)
            return { ...input, value: true };
          if (input.key === NodeInputKeyEnum.datasetSearchExtensionModelId)
            return { ...input, value: 'saved-model' };
          return input;
        })
      },
      t: ((key: string) => key) as any
    });
    expect(
      node.data.inputs.find(
        (input) => input.key === NodeInputKeyEnum.datasetSearchUsingExtensionQuery
      )?.value
    ).toBe(true);
    expect(
      node.data.inputs.find((input) => input.key === NodeInputKeyEnum.datasetSearchExtensionModelId)
        ?.value
    ).toBe('saved-model');
  });

  it.each([
    {
      name: 'unversioned node with metadata',
      version: undefined,
      filterValue: { logic: 'AND', conditions: [] },
      expectedVersion: 'legacy',
      expectedLabel: 'workflow:collection_metadata_filter'
    },
    {
      name: 'unversioned node without metadata',
      version: undefined,
      filterValue: undefined,
      expectedVersion: 'structured',
      expectedLabel: 'workflow:tag_filter'
    },
    {
      name: 'explicitly structured node with a legacy-shaped value',
      version: 'structured',
      filterValue: '{"tags":{"$and":["legacy-shape"]}}',
      expectedVersion: 'structured',
      expectedLabel: 'workflow:tag_filter'
    }
  ])(
    'hydrates $name as $expectedVersion',
    ({ version, filterValue, expectedVersion, expectedLabel }) => {
      const storeNode = {
        ...DatasetSearchModule,
        nodeId: 'dataset-search',
        position: { x: 0, y: 0 },
        inputs: DatasetSearchModule.inputs
          .filter((input) => input.key !== NodeInputKeyEnum.collectionFilterVersion)
          .map((input) =>
            input.key === NodeInputKeyEnum.collectionFilterMatch
              ? { ...input, value: filterValue }
              : input
          )
          .concat(version ? [{ ...Input_Template_Dataset_Tag_Filter_Version, value: version }] : [])
      } as StoreNodeItemType;

      const result = storeNode2FlowNode({
        item: storeNode,
        t: ((key: string) => key) as any
      });

      expect(
        result.data.inputs.find((input) => input.key === NodeInputKeyEnum.collectionFilterVersion)
          ?.value
      ).toBe(expectedVersion);
      expect(
        result.data.inputs.find((input) => input.key === NodeInputKeyEnum.collectionFilterMatch)
      ).toMatchObject({
        label: expectedLabel
      });
    }
  );

  it('hydrates Agent V2 with an explicit structured marker', () => {
    const storeNode = {
      ...AgentNode,
      nodeId: 'agent',
      position: { x: 0, y: 0 },
      inputs: AgentNode.inputs.filter(
        (input) => input.key !== NodeInputKeyEnum.collectionFilterVersion
      )
    } as StoreNodeItemType;

    const result = storeNode2FlowNode({
      item: storeNode,
      t: ((key: string) => key) as any
    });

    expect(
      result.data.inputs.find((input) => input.key === NodeInputKeyEnum.collectionFilterVersion)
        ?.value
    ).toBe('structured');
    expect(
      result.data.inputs.find((input) => input.key === NodeInputKeyEnum.collectionFilterMatch)
        ?.label
    ).toBe('workflow:tag_filter');
  });

  it('restores tool set nodes without a source handle', () => {
    const storeNode = {
      nodeId: 'tool-set-node',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      position: { x: 0, y: 0 },
      inputs: [],
      outputs: [],
      name: 'Tool set',
      showSourceHandle: true
    } as StoreNodeItemType & { showSourceHandle: true };

    const result = storeNode2FlowNode({
      item: storeNode,
      t: ((key: string) => key) as any
    });

    expect(result.data.showSourceHandle).toBe(false);
  });

  it('should materialize stored editable text when it matches an i18n key', () => {
    const storeNode: StoreNodeItemType = {
      nodeId: 'node1',
      flowNodeType: FlowNodeTypeEnum.formInput,
      position: { x: 100, y: 100 },
      inputs: [],
      outputs: [],
      name: 'workflow:stored_name',
      intro: 'workflow:stored_intro',
      version: '1.0'
    };

    const result = storeNode2FlowNode({
      item: storeNode,
      selected: true,
      t: ((key: string) =>
        ({
          'workflow:stored_name': 'Stored Name',
          'workflow:stored_intro': 'Stored Intro'
        })[key] ?? key) as any
    });

    expect(result).toMatchObject({
      id: 'node1',
      type: FlowNodeTypeEnum.formInput,
      position: { x: 100, y: 100 },
      selected: true,
      data: {
        name: 'Stored Name',
        intro: 'Stored Intro'
      }
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

  it('should preserve the canonical selection while restoring canvas nodes', () => {
    const storeNode: StoreNodeItemType = {
      nodeId: 'chat-node',
      flowNodeType: FlowNodeTypeEnum.chatNode,
      position: { x: 0, y: 0 },
      inputs: [
        {
          key: NodeInputKeyEnum.userChatInput,
          label: 'User question',
          renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
          selectedType: FlowNodeInputTypeEnum.reference
        }
      ],
      outputs: [],
      name: 'Chat node',
      version: '1.0'
    };

    const result = storeNode2FlowNode({
      item: storeNode,
      isTool: true,
      t: ((key: string) => key) as any
    });
    const userQuestion = result.data.inputs.find(
      (input) => input.key === NodeInputKeyEnum.userChatInput
    );

    expect(userQuestion?.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.reference,
      FlowNodeInputTypeEnum.textarea
    ]);
    expect(userQuestion?.selectedType).toBe(FlowNodeInputTypeEnum.reference);
  });

  it('hydrates dataset search label from the current template and keeps saved input data', () => {
    const datasetSearchInput = DatasetSearchModule.inputs.find(
      (input) => input.key === NodeInputKeyEnum.datasetSearchInput
    );
    const savedValue = [['workflow-start', NodeInputKeyEnum.userChatInput]];

    const result = storeNode2FlowNode({
      item: {
        nodeId: 'dataset-search',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        position: { x: 0, y: 0 },
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSearchInput,
            label: '历史语言标签',
            renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.reference,
            valueType: WorkflowIOValueTypeEnum.arrayString,
            value: savedValue
          }
        ],
        outputs: [],
        name: 'Dataset search',
        version: '1.0'
      },
      t: ((key: string) => key) as any
    });

    const hydratedInput = result.data.inputs.find(
      (input) => input.key === NodeInputKeyEnum.datasetSearchInput
    );

    expect(hydratedInput).toMatchObject({
      label: datasetSearchInput?.label,
      selectedType: FlowNodeInputTypeEnum.reference,
      value: savedValue
    });
    expect(hydratedInput?.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.reference,
      FlowNodeInputTypeEnum.textarea
    ]);
  });

  it('should restore an existing AI chat file link as JSON editor', () => {
    const storeNode: StoreNodeItemType = {
      nodeId: 'chat-node',
      flowNodeType: FlowNodeTypeEnum.chatNode,
      position: { x: 0, y: 0 },
      inputs: [
        {
          key: NodeInputKeyEnum.fileUrlList,
          label: 'File links',
          renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.JSONEditor],
          selectedType: FlowNodeInputTypeEnum.JSONEditor,
          valueType: WorkflowIOValueTypeEnum.arrayString,
          value: []
        }
      ],
      outputs: [],
      name: 'Chat node',
      version: '1.0'
    };

    const result = storeNode2FlowNode({
      item: storeNode,
      t: ((key: string) => key) as any
    });
    const fileLinkInput = result.data.inputs.find(
      (input) => input.key === NodeInputKeyEnum.fileUrlList
    );

    expect(fileLinkInput).toMatchObject({
      renderTypeList: [
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.reference,
        FlowNodeInputTypeEnum.JSONEditor
      ],
      selectedType: FlowNodeInputTypeEnum.JSONEditor
    });
  });

  it('keeps one canonical model input when raw data contains modelId and model', () => {
    const result = storeNode2FlowNode({
      item: {
        nodeId: 'chat-node',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        position: { x: 0, y: 0 },
        inputs: [
          {
            key: NodeInputKeyEnum.aiModel,
            renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel],
            value: 'legacy-model'
          },
          {
            key: NodeInputKeyEnum.aiModelId,
            renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel],
            value: ''
          },
          {
            key: NodeInputKeyEnum.aiModel,
            renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel],
            value: 'duplicate-legacy-model'
          }
        ],
        outputs: [],
        name: 'Chat node',
        version: '1.0'
      },
      t: ((key: string) => key) as any
    });
    const modelInputs = result.data.inputs.filter(
      (input) => input.key === NodeInputKeyEnum.aiModelId || input.key === NodeInputKeyEnum.aiModel
    );

    expect(modelInputs).toEqual([
      expect.objectContaining({ key: NodeInputKeyEnum.aiModelId, value: '' })
    ]);
  });

  it('renders a legacy model in the canonical template slot without adding modelId', () => {
    const result = storeNode2FlowNode({
      item: {
        nodeId: 'chat-node',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        position: { x: 0, y: 0 },
        inputs: [
          {
            key: NodeInputKeyEnum.aiModel,
            renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel],
            selectedType: FlowNodeInputTypeEnum.settingLLMModel,
            value: 'legacy-model'
          }
        ],
        outputs: [],
        name: 'Chat node',
        version: '1.0'
      },
      t: ((key: string) => key) as any
    });
    const modelInputs = result.data.inputs.filter(
      (input) => input.key === NodeInputKeyEnum.aiModelId || input.key === NodeInputKeyEnum.aiModel
    );

    expect(modelInputs).toEqual([
      expect.objectContaining({
        key: NodeInputKeyEnum.aiModel,
        value: 'legacy-model',
        renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel, FlowNodeInputTypeEnum.reference]
      })
    ]);
  });

  it('renames a dynamic legacy model before merging the current template', () => {
    const referenceValue = ['source-node', 'model-output'];
    const result = storeNode2FlowNode({
      item: {
        nodeId: 'chat-node',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        position: { x: 0, y: 0 },
        inputs: [
          {
            key: NodeInputKeyEnum.aiModel,
            renderTypeList: [
              FlowNodeInputTypeEnum.settingLLMModel,
              FlowNodeInputTypeEnum.reference
            ],
            selectedType: FlowNodeInputTypeEnum.reference,
            value: referenceValue
          }
        ],
        outputs: [],
        name: 'Chat node',
        version: '1.0'
      },
      t: ((key: string) => key) as any
    });
    const modelInputs = result.data.inputs.filter(
      (input) => input.key === NodeInputKeyEnum.aiModelId || input.key === NodeInputKeyEnum.aiModel
    );

    expect(modelInputs).toEqual([
      expect.objectContaining({
        key: NodeInputKeyEnum.aiModelId,
        selectedType: FlowNodeInputTypeEnum.reference,
        value: referenceValue
      })
    ]);
  });

  it('should preserve the canonical agent mode in tool context', () => {
    const storeNode: StoreNodeItemType = {
      nodeId: 'workflow-tool',
      flowNodeType: FlowNodeTypeEnum.pluginModule,
      position: { x: 0, y: 0 },
      inputs: [
        {
          key: 'query',
          label: 'Search query',
          renderTypeList: [
            FlowNodeInputTypeEnum.agentGenerated,
            FlowNodeInputTypeEnum.input,
            FlowNodeInputTypeEnum.reference
          ],
          selectedType: FlowNodeInputTypeEnum.agentGenerated,
          defaultToAgentGenerated: true
        }
      ],
      outputs: [],
      name: 'Workflow tool',
      version: '1.0'
    };

    const result = storeNode2FlowNode({
      item: storeNode,
      isTool: true,
      t: ((key: string) => key) as any
    });

    expect(result.data.inputs[0]).toMatchObject({
      selectedType: FlowNodeInputTypeEnum.agentGenerated,
      renderTypeList: [
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.input,
        FlowNodeInputTypeEnum.reference
      ]
    });
  });

  it('removes agentGenerated from workflow tool inputs before saving again', () => {
    const storeNode: StoreNodeItemType = {
      nodeId: 'plugin-input',
      flowNodeType: FlowNodeTypeEnum.pluginInput,
      position: { x: 0, y: 0 },
      inputs: [
        {
          key: 'query',
          label: 'Query',
          valueType: WorkflowIOValueTypeEnum.string,
          selectedType: FlowNodeInputTypeEnum.input,
          renderTypeList: [
            FlowNodeInputTypeEnum.agentGenerated,
            FlowNodeInputTypeEnum.input,
            FlowNodeInputTypeEnum.reference
          ]
        }
      ],
      outputs: [],
      name: 'Plugin input',
      version: '1.0'
    };

    const node = storeNode2FlowNode({
      item: storeNode,
      t: ((key: string) => key) as any
    });
    const result = uiWorkflow2StoreWorkflow({ nodes: [node], edges: [] });

    expect(result.nodes[0].inputs[0]).toMatchObject({
      selectedType: FlowNodeInputTypeEnum.input,
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
    });
    expect(result.nodes[0].inputs[0].renderTypeList).not.toContain(
      FlowNodeInputTypeEnum.agentGenerated
    );
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
