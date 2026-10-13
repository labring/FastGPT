import { describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

vi.mock('@/pageComponents/app/detail/Edit/SimpleApp/utils', () => ({
  form2AppWorkflow: vi.fn((data) => ({
    nodes: [
      {
        flowNodeType: 'workflowStart',
        formData: data
      }
    ],
    edges: [],
    chatConfig: data.chatConfig
  }))
}));

const {
  normalizeSimpleImportForm,
  parseAppImportConfig,
  parseDashboardImportConfig,
  parseWorkflowImportConfig,
  resolveImportAppType,
  isDashboardImportAppTypeAllowed
} = await import('@/pageComponents/dashboard/agent/utils/appTemplateParse');

const t = (key: string) => key;

const createSimpleConfig = (extra: Record<string, unknown> = {}) => ({
  aiSettings: {
    model: 'gpt-4o',
    isResponseAnswerText: true,
    maxHistories: 6
  },
  dataset: {
    datasets: [],
    similarity: 0.4,
    limit: 3000,
    searchMode: DatasetSearchModeEnum.embedding,
    usingReRank: true,
    rerankModel: '',
    rerankWeight: 0.5,
    datasetSearchUsingExtensionQuery: true,
    datasetSearchExtensionBg: ''
  },
  selectedTools: [],
  selectedAgentSkills: [],
  chatConfig: {},
  ...extra
});

const createWorkflowNode = (flowNodeType: string, nodeId = flowNodeType) => ({
  nodeId,
  name: flowNodeType,
  flowNodeType,
  inputs: [],
  outputs: []
});

describe('normalizeSimpleImportForm', () => {
  it('should fill missing simple form arrays and default fields', () => {
    const result = normalizeSimpleImportForm({
      aiSettings: {
        model: 'gpt-4o',
        isResponseAnswerText: true,
        maxHistories: 3
      },
      dataset: {
        datasets: []
      },
      chatConfig: {}
    });

    expect(result.selectedTools).toEqual([]);
    expect(result.selectedAgentSkills).toEqual([]);
    expect(result.dataset.limit).toBe(3000);
    expect(result.dataset.searchMode).toBe(DatasetSearchModeEnum.embedding);
  });

  it('preserves legacy tool input fields for server migration', () => {
    const result = normalizeSimpleImportForm(
      createSimpleConfig({
        selectedTools: [
          {
            inputs: [
              {
                key: 'query',
                label: 'Query',
                renderTypeList: ['input', 'reference'],
                selectedTypeIndex: 1,
                isToolParam: true
              }
            ]
          }
        ]
      })
    );

    expect((result.selectedTools[0] as any).inputs[0]).toMatchObject({
      selectedTypeIndex: 1,
      isToolParam: true
    });
  });
});

describe('resolveImportAppType', () => {
  it('should prefer supported top-level type from new JSON', () => {
    expect(
      resolveImportAppType({
        type: AppTypeEnum.workflow,
        nodes: [{ flowNodeType: 'pluginInput' }]
      })
    ).toBe(AppTypeEnum.workflow);
  });

  it('should reject chatAgent and unknown top-level type', () => {
    expect(resolveImportAppType({ type: AppTypeEnum.chatAgent })).toBe('');
    expect(resolveImportAppType({ type: 'workflow' })).toBe('');
  });

  it('should support legacy workflowTool type alias', () => {
    expect(resolveImportAppType({ type: 'workflowTool' })).toBe(AppTypeEnum.workflowTool);
  });

  it('should fall back to old JSON structure detection when type is missing', () => {
    expect(resolveImportAppType(createSimpleConfig())).toBe(AppTypeEnum.simple);
    expect(
      resolveImportAppType({
        nodes: [{ flowNodeType: 'workflowStart' }],
        edges: []
      })
    ).toBe(AppTypeEnum.workflow);
    expect(
      resolveImportAppType({
        nodes: [{ flowNodeType: 'pluginInput' }],
        edges: []
      })
    ).toBe(AppTypeEnum.workflowTool);
  });

  it('should prefer plugin input in tool scene for old mixed workflow JSON', () => {
    const config = {
      nodes: [{ flowNodeType: 'workflowStart' }, { flowNodeType: 'pluginInput' }],
      edges: []
    };

    expect(resolveImportAppType(config, 'tool')).toBe(AppTypeEnum.workflowTool);
    expect(resolveImportAppType(config, 'agent')).toBe(AppTypeEnum.workflow);
  });

  it('should return empty type for malformed node list items', () => {
    expect(
      resolveImportAppType({
        nodes: [null]
      })
    ).toBe('');
  });
});

describe('parseDashboardImportConfig', () => {
  it('should parse simple JSON in agent dashboard and ignore import meta', async () => {
    const result = await parseDashboardImportConfig({
      config: createSimpleConfig({
        type: AppTypeEnum.simple,
        name: 'Simple app',
        intro: 'Simple intro',
        selectedTools: [
          {
            inputs: [
              {
                key: 'query',
                label: 'Query',
                renderTypeList: ['input', 'reference'],
                selectedTypeIndex: 1,
                isToolParam: true
              }
            ]
          }
        ]
      }),
      scene: 'agent',
      t
    });

    expect(result.appType).toBe(AppTypeEnum.simple);
    expect(result.workflow.nodes[0].flowNodeType).toBe('workflowStart');
    expect((result.workflow.nodes[0] as any).formData).not.toHaveProperty('type');
    expect((result.workflow.nodes[0] as any).formData).not.toHaveProperty('name');
    expect((result.workflow.nodes[0] as any).formData).not.toHaveProperty('intro');
    expect((result.workflow.nodes[0] as any).formData.selectedTools[0].inputs[0]).toMatchObject({
      selectedTypeIndex: 1,
      isToolParam: true
    });
  });

  it('should parse workflow JSON in agent dashboard', async () => {
    const result = await parseDashboardImportConfig({
      config: {
        type: AppTypeEnum.workflow,
        name: 'Workflow',
        intro: 'Workflow intro',
        nodes: [createWorkflowNode('workflowStart')],
        edges: [{ source: 'a', sourceHandle: 'a-out', target: 'b', targetHandle: 'b-in' }],
        chatConfig: { welcomeText: 'hello' }
      },
      scene: 'agent',
      t
    });

    expect(result).toEqual({
      appType: AppTypeEnum.workflow,
      workflow: {
        nodes: [createWorkflowNode('workflowStart')],
        edges: [{ source: 'a', sourceHandle: 'a-out', target: 'b', targetHandle: 'b-in' }],
        chatConfig: { welcomeText: 'hello' }
      }
    });
  });

  it('should repair an imported cross-environment modelId by model name', async () => {
    const result = await parseDashboardImportConfig({
      config: {
        type: AppTypeEnum.workflow,
        nodes: [
          createWorkflowNode('workflowStart'),
          {
            ...createWorkflowNode('chatNode', 'chat'),
            inputs: [
              {
                key: NodeInputKeyEnum.aiModelId,
                value: 'source-environment-model-id',
                renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
              },
              {
                key: NodeInputKeyEnum.aiModel,
                value: 'gpt-4o',
                renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
              }
            ]
          }
        ],
        edges: []
      },
      scene: 'agent',
      t,
      models: [
        { modelId: 'target-environment-model-id', model: 'gpt-4o', type: ModelTypeEnum.llm }
      ],
      modelCatalogLoaded: true
    });

    expect(result.workflow.nodes[1].inputs).toEqual([
      expect.objectContaining({
        key: NodeInputKeyEnum.aiModelId,
        value: 'target-environment-model-id'
      })
    ]);
  });

  it('should clear unresolved imported values and preserve the modelId input', async () => {
    const result = await parseDashboardImportConfig({
      config: {
        type: AppTypeEnum.workflow,
        nodes: [
          createWorkflowNode('workflowStart'),
          {
            ...createWorkflowNode('chatNode', 'chat'),
            inputs: [
              {
                key: NodeInputKeyEnum.aiModelId,
                value: 'invalid-id',
                renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
              },
              {
                key: NodeInputKeyEnum.aiModel,
                value: 'invalid-model',
                renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
              }
            ]
          }
        ],
        edges: []
      },
      scene: 'agent',
      t,
      models: [
        { modelId: 'available-model-id', model: 'available-model', type: ModelTypeEnum.llm }
      ],
      modelCatalogLoaded: true
    });

    expect(result.workflow.nodes[1].inputs).toHaveLength(1);
    expect(result.workflow.nodes[1].inputs[0]).toMatchObject({
      key: NodeInputKeyEnum.aiModelId
    });
    expect(result.workflow.nodes[1].inputs[0]).toHaveProperty('value', undefined);
  });

  it('should preserve legacy workflow fields for create API migration', async () => {
    const legacyStartNode = {
      ...createWorkflowNode('workflowStart'),
      inputs: [{ key: 'query', llmModelType: 'chat' }]
    };
    const legacySystemNode = createWorkflowNode('userGuide');

    const result = await parseDashboardImportConfig({
      config: {
        type: AppTypeEnum.workflow,
        nodes: [legacyStartNode, legacySystemNode],
        edges: [],
        chatConfig: { _id: 'legacy-chat-config' }
      },
      scene: 'agent',
      t
    });

    expect(result.workflow.nodes).toEqual([legacyStartNode, legacySystemNode]);
    expect(result.workflow.chatConfig).toEqual({ _id: 'legacy-chat-config' });
  });

  it('should parse workflow tool JSON in tool dashboard', async () => {
    const result = await parseDashboardImportConfig({
      config: {
        type: AppTypeEnum.workflowTool,
        nodes: [createWorkflowNode('pluginInput')],
        edges: []
      },
      scene: 'tool',
      t
    });

    expect(result.appType).toBe(AppTypeEnum.workflowTool);
  });

  it('should parse legacy workflowTool alias JSON in tool dashboard', async () => {
    const result = await parseDashboardImportConfig({
      config: {
        type: 'workflowTool',
        nodes: [createWorkflowNode('pluginInput')],
        edges: []
      },
      scene: 'tool',
      t
    });

    expect(result.appType).toBe(AppTypeEnum.workflowTool);
  });

  it('should parse old mixed workflow JSON as workflow tool in tool dashboard', async () => {
    const result = await parseDashboardImportConfig({
      config: {
        nodes: [createWorkflowNode('workflowStart'), createWorkflowNode('pluginInput')],
        edges: []
      },
      scene: 'tool',
      t
    });

    expect(result.appType).toBe(AppTypeEnum.workflowTool);
  });

  it('should reject workflow tool JSON in agent dashboard', async () => {
    await expect(
      parseDashboardImportConfig({
        config: {
          type: AppTypeEnum.workflowTool,
          nodes: [{ flowNodeType: 'pluginInput' }],
          edges: []
        },
        scene: 'agent',
        t
      })
    ).rejects.toThrow('app:type_not_recognized');
  });

  it('should reject simple and workflow JSON in tool dashboard', async () => {
    await expect(
      parseDashboardImportConfig({
        config: createSimpleConfig({
          type: AppTypeEnum.simple
        }),
        scene: 'tool',
        t
      })
    ).rejects.toThrow('app:type_not_recognized');

    await expect(
      parseDashboardImportConfig({
        config: {
          type: AppTypeEnum.workflow,
          nodes: [createWorkflowNode('workflowStart')],
          edges: []
        },
        scene: 'tool',
        t
      })
    ).rejects.toThrow('app:type_not_recognized');
  });

  it('should reject chatAgent and unknown typed JSON with existing type_not_recognized text', async () => {
    await expect(
      parseDashboardImportConfig({
        config: { type: AppTypeEnum.chatAgent },
        scene: 'agent',
        t
      })
    ).rejects.toThrow('app:type_not_recognized');

    await expect(
      parseDashboardImportConfig({
        config: { type: 'workflow' },
        scene: 'agent',
        t
      })
    ).rejects.toThrow('app:type_not_recognized');
  });

  it('should reject top-level type and structure mismatch', async () => {
    await expect(
      parseDashboardImportConfig({
        config: {
          type: AppTypeEnum.workflow,
          nodes: [createWorkflowNode('pluginInput')],
          edges: []
        },
        scene: 'agent',
        t
      })
    ).rejects.toThrow('app:type_not_recognized');

    await expect(
      parseDashboardImportConfig({
        config: {
          type: AppTypeEnum.simple,
          nodes: [createWorkflowNode('workflowStart')],
          edges: []
        },
        scene: 'agent',
        t
      })
    ).rejects.toThrow('app:type_not_recognized');
  });

  it('should reject malformed old workflow JSON safely', async () => {
    await expect(
      parseDashboardImportConfig({
        config: {
          nodes: {}
        },
        scene: 'agent',
        t
      })
    ).rejects.toThrow('app:type_not_recognized');
  });
});

describe('isDashboardImportAppTypeAllowed', () => {
  it('should match app type with dashboard scene', () => {
    expect(isDashboardImportAppTypeAllowed({ appType: AppTypeEnum.simple, scene: 'agent' })).toBe(
      true
    );
    expect(isDashboardImportAppTypeAllowed({ appType: AppTypeEnum.workflow, scene: 'agent' })).toBe(
      true
    );
    expect(
      isDashboardImportAppTypeAllowed({ appType: AppTypeEnum.workflowTool, scene: 'agent' })
    ).toBe(false);
    expect(isDashboardImportAppTypeAllowed({ appType: AppTypeEnum.simple, scene: 'tool' })).toBe(
      false
    );
    expect(isDashboardImportAppTypeAllowed({ appType: AppTypeEnum.workflow, scene: 'tool' })).toBe(
      false
    );
    expect(
      isDashboardImportAppTypeAllowed({ appType: AppTypeEnum.workflowTool, scene: 'tool' })
    ).toBe(true);
  });
});

describe('parseAppImportConfig', () => {
  it('should reject model normalization before the model catalog is loaded', async () => {
    await expect(
      parseAppImportConfig({
        config: {
          type: AppTypeEnum.workflow,
          nodes: [createWorkflowNode('workflowStart')],
          edges: []
        },
        t,
        models: [],
        modelCatalogLoaded: false
      })
    ).rejects.toThrow('common:model_catalog_load_failed');
  });

  it('should accept an empty catalog after it has been loaded successfully', async () => {
    const modelInputs = [
      {
        key: NodeInputKeyEnum.aiModelId,
        value: 'source-model-id',
        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
      },
      {
        key: NodeInputKeyEnum.aiModel,
        value: 'source-model',
        renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
      }
    ];
    const result = await parseAppImportConfig({
      config: {
        type: AppTypeEnum.workflow,
        nodes: [
          createWorkflowNode('workflowStart'),
          { ...createWorkflowNode('chatNode'), inputs: modelInputs }
        ],
        edges: []
      },
      t,
      models: [],
      modelCatalogLoaded: true
    });

    expect(result.workflow.nodes[1].inputs).toEqual(modelInputs);
  });

  it('should parse through the shared import entry with caller constraints', async () => {
    const result = await parseAppImportConfig({
      config: {
        type: 'workflowTool',
        nodes: [createWorkflowNode('pluginInput')],
        edges: []
      },
      resolveScene: 'tool',
      expectedAppType: AppTypeEnum.workflowTool,
      t
    });

    expect(result.appType).toBe(AppTypeEnum.workflowTool);
    expect(result.workflow.nodes).toEqual([createWorkflowNode('pluginInput')]);
  });

  it('should reject mismatched app type in the shared import entry', async () => {
    await expect(
      parseAppImportConfig({
        config: {
          type: AppTypeEnum.workflow,
          nodes: [createWorkflowNode('workflowStart')],
          edges: []
        },
        resolveScene: 'agent',
        expectedAppType: AppTypeEnum.workflowTool,
        t
      })
    ).rejects.toThrow('app:type_not_recognized');
  });
});

describe('parseWorkflowImportConfig', () => {
  it('should parse workflow JSON and ignore app meta in workflow detail import', async () => {
    const result = await parseWorkflowImportConfig({
      config: {
        type: AppTypeEnum.workflow,
        name: 'Workflow name',
        intro: 'Workflow intro',
        nodes: [createWorkflowNode('workflowStart')],
        edges: [{ source: 'a', sourceHandle: 'a-out', target: 'b', targetHandle: 'b-in' }],
        chatConfig: { welcomeText: 'hello' }
      },
      t
    });

    expect(result).toEqual({
      nodes: [createWorkflowNode('workflowStart')],
      edges: [{ source: 'a', sourceHandle: 'a-out', target: 'b', targetHandle: 'b-in' }],
      chatConfig: { welcomeText: 'hello', welcomeConfig: { welcomeText: 'hello' } }
    });
  });

  it('should parse workflow tool JSON in workflow tool detail import', async () => {
    const result = await parseWorkflowImportConfig({
      config: {
        type: AppTypeEnum.workflowTool,
        name: 'Tool name',
        intro: 'Tool intro',
        nodes: [createWorkflowNode('pluginInput'), createWorkflowNode('pluginOutput')],
        edges: [],
        chatConfig: { welcomeText: 'plugin hello' }
      },
      appType: AppTypeEnum.workflowTool,
      t
    });

    expect(result).toEqual({
      nodes: [createWorkflowNode('pluginInput'), createWorkflowNode('pluginOutput')],
      edges: [],
      chatConfig: {
        welcomeText: 'plugin hello',
        welcomeConfig: { welcomeText: 'plugin hello' }
      }
    });
  });

  it('should reject mismatched JSON in workflow detail import', async () => {
    await expect(
      parseWorkflowImportConfig({
        config: {
          type: AppTypeEnum.workflowTool,
          nodes: [createWorkflowNode('pluginInput')],
          edges: []
        },
        t
      })
    ).rejects.toThrow('app:type_not_recognized');

    await expect(
      parseWorkflowImportConfig({
        config: {
          type: AppTypeEnum.workflow,
          nodes: [createWorkflowNode('workflowStart')],
          edges: []
        },
        appType: AppTypeEnum.workflowTool,
        t
      })
    ).rejects.toThrow('app:type_not_recognized');

    await expect(
      parseWorkflowImportConfig({
        config: createSimpleConfig({
          type: AppTypeEnum.simple
        }),
        t
      })
    ).rejects.toThrow('app:type_not_recognized');
  });
});
