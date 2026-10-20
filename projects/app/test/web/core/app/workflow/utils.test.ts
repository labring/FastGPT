import {
  filterWorkflowNodeOutputsByType,
  filterSelectableWorkflowNodeOutputs,
  workflowReferenceValueIsSelectable
} from '@fastgpt/global/common/workflow/reference';
import { describe, it, expect, vi } from 'vitest';
import type {
  FlowNodeItemType,
  FlowNodeTemplateType,
  StoreNodeItemType
} from '@fastgpt/global/core/workflow/type/node';
import type { Edge } from 'reactflow';
import {
  FlowNodeTypeEnum,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID
} from '@fastgpt/global/core/workflow/constants';
import {
  nodeTemplate2FlowNode,
  storeNode2FlowNode,
  getNodeAllSource
} from '@/web/core/workflow/utils';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import { uiWorkflow2StoreWorkflow } from '@/pageComponents/app/detail/WorkflowComponents/utils';
import { AiChatModule } from '@fastgpt/global/core/workflow/template/system/aiChat';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';
import { AgentNode } from '@fastgpt/global/core/workflow/template/system/agent';
import { ClassifyQuestionModule } from '@fastgpt/global/core/workflow/template/system/classifyQuestion';
import { ToolCallNode } from '@fastgpt/global/core/workflow/template/system/toolCall';
import { LoopRunModeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { Input_Template_Dataset_Tag_Filter_Version } from '@fastgpt/global/core/workflow/template/input';

describe('nodeTemplate2FlowNode', () => {
  it('does not prefill either auxiliary model when creating dataset search', () => {
    const node = nodeTemplate2FlowNode({
      template: DatasetSearchModule,
      position: { x: 0, y: 0 },
      initialModelId: 'default-llm',
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
    'stores the initial model on a new $flowNodeType node without changing its template',
    (template) => {
      const node = nodeTemplate2FlowNode({
        template,
        position: { x: 0, y: 0 },
        t: ((key: string) => key) as any,
        initialModelId: 'selected-model-id'
      });
      const stored = uiWorkflow2StoreWorkflow({ nodes: [node], edges: [] });
      expect(stored.nodes[0].inputs.find((i) => i.key === NodeInputKeyEnum.aiModelId)?.value).toBe(
        'selected-model-id'
      );
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
            label: '',
            key: NodeInputKeyEnum.aiModel,
            renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel],
            value: 'legacy-model'
          },
          {
            label: '',
            key: NodeInputKeyEnum.aiModelId,
            renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel],
            value: ''
          },
          {
            label: '',
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
            label: '',
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
            label: '',
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
    const result = uiWorkflow2StoreWorkflow({ nodes: [node], edges: [], chatConfig: {} });

    expect(result.nodes[0].inputs[0]).toMatchObject({
      selectedType: FlowNodeInputTypeEnum.input,
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
    });
    expect(result.nodes[0].inputs[0].renderTypeList).not.toContain(
      FlowNodeInputTypeEnum.agentGenerated
    );
  });

  it('loopRun: 自动补齐动态输出缺失的 canEdit 输入声明（AI 文档只声明 outputs 的场景）', () => {
    const storeNode: StoreNodeItemType = {
      nodeId: 'examLoop',
      flowNodeType: FlowNodeTypeEnum.loopRun,
      position: { x: 0, y: 0 },
      inputs: [
        {
          label: '',
          key: NodeInputKeyEnum.loopRunMode,
          value: LoopRunModeEnum.array,
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        },
        {
          label: '',
          key: NodeInputKeyEnum.loopRunInputArray,
          value: [],
          valueType: WorkflowIOValueTypeEnum.arrayAny,
          renderTypeList: [FlowNodeInputTypeEnum.reference]
        },
        {
          label: '',
          key: NodeInputKeyEnum.loopCustomOutputs,
          value: [],
          valueType: WorkflowIOValueTypeEnum.dynamic,
          renderTypeList: [FlowNodeInputTypeEnum.addInputParam]
        },
        {
          label: '',
          key: NodeInputKeyEnum.childrenNodeIdList,
          value: [],
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        }
      ],
      outputs: [
        {
          id: 'collectedResults',
          key: 'collectedResults',
          label: 'collectedResults',
          type: FlowNodeOutputTypeEnum.dynamic,
          valueType: WorkflowIOValueTypeEnum.arrayAny
        }
      ],
      name: 'Loop',
      version: '1.0'
    };

    const result = storeNode2FlowNode({
      item: storeNode,
      t: ((key: string) => key) as any
    });

    const declared = result.data.inputs.find((input) => input.key === 'collectedResults');
    expect(declared).toBeDefined();
    expect(declared).toMatchObject({
      key: 'collectedResults',
      canEdit: true,
      valueType: WorkflowIOValueTypeEnum.arrayAny,
      required: false
    });
    expect(declared?.renderTypeList).toContain(FlowNodeInputTypeEnum.reference);
    // 动态输出保留，避免 NodeLoopRun 挂载时被当作未声明输出删除
    expect(result.data.outputs.find((o) => o.key === 'collectedResults')?.type).toBe(
      FlowNodeOutputTypeEnum.dynamic
    );
  });

  it('loopRun: 已有 canEdit 输入声明的动态输出不重复补齐', () => {
    const storeNode: StoreNodeItemType = {
      nodeId: 'examLoop',
      flowNodeType: FlowNodeTypeEnum.loopRun,
      position: { x: 0, y: 0 },
      inputs: [
        {
          label: '',
          key: NodeInputKeyEnum.loopRunMode,
          value: LoopRunModeEnum.array,
          valueType: WorkflowIOValueTypeEnum.string,
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        },
        {
          key: 'collectedResults',
          label: 'collectedResults',
          valueType: WorkflowIOValueTypeEnum.arrayAny,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          canEdit: true
        }
      ],
      outputs: [
        {
          id: 'collectedResults',
          key: 'collectedResults',
          label: 'collectedResults',
          type: FlowNodeOutputTypeEnum.dynamic,
          valueType: WorkflowIOValueTypeEnum.arrayAny
        }
      ],
      name: 'Loop',
      version: '1.0'
    };

    const result = storeNode2FlowNode({
      item: storeNode,
      t: ((key: string) => key) as any
    });

    const canEditInputs = result.data.inputs.filter((input) => input.canEdit === true);
    expect(canEditInputs).toHaveLength(1);
    expect(canEditInputs[0].key).toBe('collectedResults');
  });

  it('非 loopRun 节点的动态输出不受兜底影响', () => {
    const storeNode: StoreNodeItemType = {
      nodeId: 'node1',
      flowNodeType: FlowNodeTypeEnum.formInput,
      position: { x: 0, y: 0 },
      inputs: [],
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

    expect(result.data.inputs.some((input) => input.canEdit === true)).toBe(false);
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
      id: nodeId,
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
