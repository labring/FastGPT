import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { formatModels } from '@fastgpt/global/common/workflow/model';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import {
  extractAppResources,
  mergeAppResources,
  resolveStoredAppResources,
  splitExtractedAppResources
} from '@fastgpt/service/core/app/resource/utils';

const createInput = (key: string, value: unknown, reference = false) => ({
  key,
  label: key,
  value,
  renderTypeList: reference ? [FlowNodeInputTypeEnum.reference] : [FlowNodeInputTypeEnum.input]
});

const createNode = ({
  flowNodeType = FlowNodeTypeEnum.workflowStart,
  pluginId,
  inputs = []
}: {
  flowNodeType?: FlowNodeTypeEnum;
  pluginId?: string;
  inputs?: ReturnType<typeof createInput>[];
}) =>
  ({
    nodeId: `${flowNodeType}-node`,
    name: 'node',
    flowNodeType,
    pluginId,
    inputs,
    outputs: []
  }) as unknown as StoreNodeItemType;

describe('extractAppResources', () => {
  it.each([NodeInputKeyEnum.aiModel, NodeInputKeyEnum.aiModelId])(
    'excludes dynamic expressions after normalizing %s for publication',
    (modelKey) => {
      const nodes = [
        createNode({
          flowNodeType: FlowNodeTypeEnum.agent,
          inputs: [
            createInput(modelKey, '{{selectedModel}}'),
            createInput(NodeInputKeyEnum.datasetParams, {
              datasets: [{ datasetId: 'dataset-id' }],
              usingReRank: true,
              rerankModelId: '{{rerankModelId}}',
              datasetSearchUsingExtensionQuery: true,
              datasetSearchExtensionModelId: '{{extensionModelId}}'
            })
          ]
        }),
        createNode({
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
          inputs: [
            createInput(NodeInputKeyEnum.datasetSelectList, [{ datasetId: 'dataset-id' }]),
            createInput(NodeInputKeyEnum.datasetSearchUsingReRank, true),
            createInput(NodeInputKeyEnum.datasetSearchRerankModelId, '{{rerankModelId}}'),
            createInput(NodeInputKeyEnum.datasetSearchUsingExtensionQuery, true),
            createInput(NodeInputKeyEnum.datasetSearchExtensionModelId, '{{extensionModelId}}')
          ]
        }),
        createNode({
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [createInput(NodeInputKeyEnum.aiModelId, 'static-model-id')]
        })
      ];
      const chatConfig = {
        questionGuide: { open: true, modelId: '{{guideModelId}}' },
        ttsConfig: { type: 'model' as const, modelId: '{{ttsModelId}}' }
      };

      expect(() =>
        formatModels({
          nodes,
          chatConfig,
          models: [{ modelId: 'static-model-id', model: 'static-model', type: ModelTypeEnum.llm }],
          modelReferencePolicy: 'validate'
        })
      ).not.toThrow();
      expect(nodes[0].inputs[0]).toMatchObject({
        key: NodeInputKeyEnum.aiModelId,
        value: '{{selectedModel}}'
      });
      expect(extractAppResources({ nodes, chatConfig })).toEqual([
        { type: 'dataset', id: 'dataset-id' },
        { type: 'model', id: 'static-model-id' }
      ]);
    }
  );

  it('ignores dataset model resources when no dataset is selected', () => {
    const resources = extractAppResources({
      nodes: [
        createNode({
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
          inputs: [
            createInput(NodeInputKeyEnum.datasetSelectList, []),
            createInput(NodeInputKeyEnum.datasetSearchUsingReRank, true),
            createInput(NodeInputKeyEnum.datasetSearchRerankModelId, 'rerank-model-id'),
            createInput(NodeInputKeyEnum.datasetSearchUsingExtensionQuery, true),
            createInput(NodeInputKeyEnum.datasetSearchExtensionModelId, 'extension-model-id'),
            createInput(NodeInputKeyEnum.datasetDeepSearch, true),
            createInput(NodeInputKeyEnum.datasetDeepSearchModelId, 'deep-search-model-id')
          ]
        }),
        createNode({
          flowNodeType: FlowNodeTypeEnum.agent,
          inputs: [
            createInput(NodeInputKeyEnum.datasetParams, {
              datasets: [],
              [NodeInputKeyEnum.datasetSearchUsingReRank]: true,
              [NodeInputKeyEnum.datasetSearchRerankModelId]: 'nested-rerank-model-id',
              [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]: true,
              [NodeInputKeyEnum.datasetSearchExtensionModelId]: 'nested-extension-model-id'
            })
          ]
        })
      ]
    });

    expect(resources.filter((resource) => resource.type === 'model')).toEqual([]);
  });

  it('normalizes personal, MCP and HTTP tools into parent resources', () => {
    const resources = extractAppResources({
      nodes: [
        createNode({
          flowNodeType: FlowNodeTypeEnum.tool,
          pluginId: 'personal-tool-app'
        }),
        createNode({
          flowNodeType: FlowNodeTypeEnum.tool,
          pluginId: 'mcp-mcp-app/search'
        }),
        createNode({
          flowNodeType: FlowNodeTypeEnum.tool,
          pluginId: 'http-http-app/request'
        }),
        createNode({
          flowNodeType: FlowNodeTypeEnum.tool,
          pluginId: 'systemTool-search'
        })
      ]
    });

    expect(resources).toEqual([
      { type: 'tool', id: 'http-app', data: { toolNames: ['request'] } },
      { type: 'tool', id: 'mcp-app', data: { toolNames: ['search'] } },
      { type: 'tool', id: 'tool-app' }
    ]);
  });

  it('extracts agent, dataset, skill and model resources with stable deduplication', () => {
    const resources = extractAppResources({
      nodes: [
        createNode({
          flowNodeType: FlowNodeTypeEnum.appModule,
          pluginId: 'agent-app'
        }),
        createNode({
          flowNodeType: FlowNodeTypeEnum.agent,
          inputs: [
            createInput(NodeInputKeyEnum.datasetSelectList, [
              { datasetId: '65f000000000000000000001' },
              { datasetId: '65f000000000000000000001' }
            ]),
            createInput(NodeInputKeyEnum.skills, [{ skillId: 'skill-1' }]),
            createInput(NodeInputKeyEnum.aiModelId, 'llm-model-id'),
            createInput(NodeInputKeyEnum.datasetSearchUsingReRank, true),
            createInput(NodeInputKeyEnum.datasetSearchUsingExtensionQuery, true),
            createInput(NodeInputKeyEnum.datasetSearchRerankModelId, 'rerank-model-id'),
            createInput(NodeInputKeyEnum.datasetSearchExtensionModelId, 'extension-model-id'),
            createInput(NodeInputKeyEnum.datasetParams, {
              datasets: [{ datasetId: '65f000000000000000000002' }],
              [NodeInputKeyEnum.datasetSearchUsingReRank]: true,
              [NodeInputKeyEnum.datasetSearchRerankModelId]: 'nested-rerank-model-id',
              [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]: true,
              [NodeInputKeyEnum.datasetSearchExtensionModelId]: 'nested-extension-model-id'
            })
          ]
        }),
        createNode({
          inputs: [
            createInput(NodeInputKeyEnum.skills, [{ skillId: 'skill-1' }]),
            // 外部节点可以声明同名参数，不能计入 FastGPT 系统模型资源。
            createInput(NodeInputKeyEnum.aiModelId, 'plugin-model-id')
          ]
        })
      ],
      chatConfig: {
        questionGuide: { open: true, modelId: 'guide-model-id' },
        ttsConfig: { type: 'model', modelId: 'tts-model-id' }
      } as any
    });

    expect(resources).toEqual([
      { type: 'agent', id: 'agent-app' },
      { type: 'dataset', id: '65f000000000000000000001' },
      { type: 'dataset', id: '65f000000000000000000002' },
      { type: 'model', id: 'extension-model-id' },
      { type: 'model', id: 'guide-model-id' },
      { type: 'model', id: 'llm-model-id' },
      { type: 'model', id: 'nested-extension-model-id' },
      { type: 'model', id: 'nested-rerank-model-id' },
      { type: 'model', id: 'rerank-model-id' },
      { type: 'model', id: 'tts-model-id' },
      { type: 'skill', id: 'skill-1' }
    ]);
  });

  it('does not record reference or disabled canonical model inputs', () => {
    const resources = extractAppResources({
      nodes: [
        createNode({
          flowNodeType: FlowNodeTypeEnum.agent,
          inputs: [
            createInput(NodeInputKeyEnum.aiModelId, ['source', 'model'], true),
            createInput(NodeInputKeyEnum.datasetSearchUsingReRank, false),
            createInput(NodeInputKeyEnum.datasetSearchRerankModelId, 'disabled-rerank-model-id')
          ]
        })
      ]
    });

    expect(resources).toEqual([]);
  });

  it('extracts all static canonical model inputs on a node with duplicate modelId keys', () => {
    const resources = extractAppResources({
      nodes: [
        createNode({
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [
            createInput(NodeInputKeyEnum.aiModelId, 'static-model-1'),
            createInput(NodeInputKeyEnum.aiModelId, 'static-model-2'),
            createInput(NodeInputKeyEnum.aiModelId, ['source', 'model'], true)
          ]
        })
      ]
    });

    expect(resources).toEqual([
      { type: 'model', id: 'static-model-1' },
      { type: 'model', id: 'static-model-2' }
    ]);
  });

  it('maps legacy model fields via system catalog when canonical modelId is absent and ignores unknown legacy names', () => {
    const resources = extractAppResources({
      nodes: [
        createNode({
          flowNodeType: FlowNodeTypeEnum.agent,
          inputs: [
            createInput(NodeInputKeyEnum.aiModel, 'gpt-5'),
            createInput(NodeInputKeyEnum.datasetParams, {
              datasets: [{ datasetId: '65f000000000000000000001' }],
              [NodeInputKeyEnum.datasetSearchUsingReRank]: true,
              [NodeInputKeyEnum.datasetSearchRerankModel]: 'legacy-rerank',
              [NodeInputKeyEnum.datasetSearchUsingExtensionQuery]: true,
              [NodeInputKeyEnum.datasetSearchExtensionModel]: 'gpt-5'
            })
          ]
        })
      ],
      chatConfig: {
        questionGuide: { open: true, model: 'legacy-guide' } as any,
        ttsConfig: { type: 'model', model: 'legacy-tts' } as any
      } as any
    });

    expect(resources.filter((resource) => resource.type === 'model')).toEqual([
      { type: 'model', id: '68ad85a7463006c963799a68' }
    ]);
  });

  it('records selected workflow apps as tool resources', () => {
    const resources = extractAppResources({
      nodes: [
        createNode({
          flowNodeType: FlowNodeTypeEnum.agent,
          inputs: [
            createInput(NodeInputKeyEnum.selectedTools, [
              {
                id: 'personal-workflow-tool',
                flowNodeType: FlowNodeTypeEnum.appModule
              },
              { id: 'personal-plugin-tool', flowNodeType: FlowNodeTypeEnum.pluginModule }
            ])
          ]
        })
      ]
    });

    expect(resources).toEqual([
      { type: 'tool', id: 'plugin-tool' },
      { type: 'tool', id: 'workflow-tool' }
    ]);
  });

  it('ignores reference mode datasets in resource extraction', () => {
    const resources = extractAppResources({
      nodes: [
        createNode({
          flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
          inputs: [
            // 引用模式的输入（renderTypeList 包含 reference）
            createInput(NodeInputKeyEnum.datasetSelectList, ['VARIABLE_NODE_ID', 'dataSets'], true),
            createInput(NodeInputKeyEnum.datasetParams, {
              datasets: [{ datasetId: 'dataset-1' }, ['VARIABLE_NODE_ID', 'dataSets']]
            })
          ]
        })
      ]
    });

    expect(resources).toEqual([{ type: 'dataset', id: 'dataset-1' }]);
  });
});

describe('mergeAppResources', () => {
  it('deduplicates models by id and lets a whole toolset override child tools', () => {
    expect(
      mergeAppResources([
        { type: 'model', id: 'same-model' },
        { type: 'tool', id: 'toolset', data: { toolNames: ['b'] } },
        { type: 'model', id: 'same-model' },
        { type: 'tool', id: 'toolset' },
        { type: 'tool', id: 'toolset', data: { toolNames: ['a'] } },
        { type: 'tool', id: 'empty-names', data: { toolNames: [] } }
      ])
    ).toEqual([
      { type: 'model', id: 'same-model' },
      { type: 'tool', id: 'empty-names' },
      { type: 'tool', id: 'toolset' }
    ]);
  });
});

describe('resolveStoredAppResources', () => {
  it('extracts from nodes and merges legacy skill refs when resources is missing', () => {
    expect(
      resolveStoredAppResources({
        nodes: [
          createNode({
            flowNodeType: FlowNodeTypeEnum.appModule,
            pluginId: 'agent-1'
          })
        ],
        resourceRefs: { skillIds: ['legacy-skill'] }
      })
    ).toEqual([
      { type: 'agent', id: 'agent-1' },
      { type: 'skill', id: 'legacy-skill' }
    ]);
  });

  it('keeps an empty array as an empty snapshot', () => {
    expect(
      resolveStoredAppResources({
        resources: [],
        nodes: [
          createNode({
            flowNodeType: FlowNodeTypeEnum.appModule,
            pluginId: 'agent-1'
          })
        ]
      })
    ).toEqual([]);
  });

  it('normalizes legacy child tool ids in a stored snapshot', () => {
    expect(
      resolveStoredAppResources({
        resources: [{ type: 'tool', id: 'mcp-mcp-app/search' }]
      })
    ).toEqual([{ type: 'tool', id: 'mcp-app', data: { toolNames: ['search'] } }]);
  });

  it('normalizes legacy model metadata to the common resource shape', () => {
    expect(
      resolveStoredAppResources({
        resources: [{ type: 'model', id: 'model-1', data: { modelType: 'llm' } }]
      })
    ).toEqual([{ type: 'model', id: 'model-1' }]);
  });
});

describe('splitExtractedAppResources', () => {
  it('does not treat toolNames as a permission delta', () => {
    const { kept, added } = splitExtractedAppResources({
      extracted: [{ type: 'tool', id: 'mcp-app', data: { toolNames: ['a', 'b'] } }],
      baseline: [{ type: 'tool', id: 'mcp-app', data: { toolNames: ['a'] } }]
    });
    expect(added).toEqual([]);
    expect(kept).toEqual([{ type: 'tool', id: 'mcp-app', data: { toolNames: ['a', 'b'] } }]);
  });

  it('splits newly added ACL resources from kept baseline resources', () => {
    const { kept, added } = splitExtractedAppResources({
      extracted: [
        { type: 'dataset', id: 'old-dataset' },
        { type: 'skill', id: 'new-skill' },
        { type: 'model', id: 'gpt' }
      ],
      baseline: [{ type: 'dataset', id: 'old-dataset' }]
    });
    expect(kept).toEqual([{ type: 'dataset', id: 'old-dataset' }]);
    expect(added).toEqual([
      { type: 'skill', id: 'new-skill' },
      { type: 'model', id: 'gpt' }
    ]);
  });
});
