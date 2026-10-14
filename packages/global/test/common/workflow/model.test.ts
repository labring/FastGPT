import { describe, expect, it } from 'vitest';

import {
  formatModels,
  addModelNamesToWorkflow,
  isWorkflowModelExpression
} from '@fastgpt/global/common/workflow/model';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum, NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

describe('isWorkflowModelExpression', () => {
  it.each(['{{selectedModel}}', '{{source.modelId}}'])('recognizes %s', (value) => {
    expect(isWorkflowModelExpression(value)).toBe(true);
  });

  it.each([undefined, null, 1, [], ['source', 'modelId'], '', 'model-id', '{modelId}'])(
    'does not treat %j as a model expression',
    (value) => {
      expect(isWorkflowModelExpression(value)).toBe(false);
    }
  );
});

describe('formatModels', () => {
  it.each([undefined, null, '', '   '])(
    'reports unconfigured models distinctly on publish (%s)',
    (value) => {
      const nodes = [
        {
          nodeId: 'chat',
          name: 'Chat',
          flowNodeType: FlowNodeTypeEnum.chatNode,
          inputs: [
            {
              key: NodeInputKeyEnum.aiModelId,
              label: 'Model',
              value,
              renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
            }
          ],
          outputs: []
        }
      ];
      expect(() => formatModels({ nodes, models: [], modelReferencePolicy: 'validate' })).toThrow(
        'is not configured'
      );
    }
  );
  const models = [
    { model: 'gpt-4', modelId: '68ad85a7463006c963799a05', type: ModelTypeEnum.llm },
    { model: 'rerank-v1', modelId: '68ad85a7463006c963799a06', type: ModelTypeEnum.rerank },
    { model: 'extension-v1', modelId: '68ad85a7463006c963799a07', type: ModelTypeEnum.llm },
    { model: 'deep-search-v1', modelId: '68ad85a7463006c963799a08', type: ModelTypeEnum.llm },
    { model: 'legacy-tts', modelId: 'existing-tts-id', type: ModelTypeEnum.tts }
  ];
  const defaultModelIds = {
    [ModelTypeEnum.llm]: models[2].modelId,
    [ModelTypeEnum.rerank]: models[1].modelId,
    [ModelTypeEnum.tts]: models[4].modelId
  };

  it('returns undefined nodes unchanged', () => {
    const result = formatModels({ nodes: undefined, models, modelReferencePolicy: 'fallback' });
    expect(result).toBeUndefined();
  });

  it('converts legacy chat config models and removes deprecated fields', () => {
    const chatConfig = {
      questionGuide: { open: true, model: 'gpt-4' },
      ttsConfig: {
        type: 'model' as const,
        modelId: 'existing-tts-id',
        model: 'legacy-tts',
        voice: 'alloy'
      }
    };

    formatModels({ nodes: [], chatConfig, models, modelReferencePolicy: 'fallback' });

    expect(chatConfig.questionGuide).toEqual({
      open: true,
      modelId: '68ad85a7463006c963799a05'
    });
    expect(chatConfig.ttsConfig).toEqual({
      type: 'model',
      modelId: 'existing-tts-id',
      voice: 'alloy'
    });
  });

  it('uses an empty fallback when no same-type model is available for create flows', () => {
    const chatConfig = {
      questionGuide: { open: true, model: 'temporarily-unavailable-model' }
    };

    formatModels({ nodes: [], chatConfig, models: [], modelReferencePolicy: 'fallback' });

    expect(chatConfig.questionGuide).toEqual({
      open: true,
      modelId: ''
    });
  });

  it('does not check or replace models when an optional chat feature is disabled', () => {
    const chatConfig = {
      questionGuide: { open: false, modelId: 'disabled-llm' },
      ttsConfig: {
        type: 'web' as const,
        model: 'disabled-tts'
      }
    };

    expect(() =>
      formatModels({
        nodes: [],
        chatConfig,
        models,
        defaultModelIds,
        modelReferencePolicy: 'validate'
      })
    ).not.toThrow();

    expect(chatConfig.questionGuide).toEqual({ open: false, modelId: 'disabled-llm' });
    expect(chatConfig.ttsConfig).toEqual({
      type: 'web',
      modelId: 'disabled-tts'
    });
  });

  it('does not synthesize optional chat model fields when no model was configured', () => {
    const chatConfig = {
      questionGuide: { open: false },
      ttsConfig: { type: 'web' as const, voice: 'alloy' }
    };

    formatModels({ nodes: [], chatConfig, models, modelReferencePolicy: 'validate' });

    expect(chatConfig.questionGuide).not.toHaveProperty('modelId');
    expect(chatConfig.ttsConfig).not.toHaveProperty('modelId');
  });

  it('throws for an unresolved chat model when its feature is enabled', () => {
    const chatConfig = {
      questionGuide: { open: true, modelId: 'disabled-llm' }
    };

    expect(() =>
      formatModels({ nodes: [], chatConfig, models, modelReferencePolicy: 'validate' })
    ).toThrow('unavailable');
  });

  it('replaces every static legacy workflow model key and value with modelId', () => {
    const nodes = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        name: 'Chat',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModel,
            label: 'Model',
            value: 'gpt-4',
            selectedType: FlowNodeInputTypeEnum.selectLLMModel,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          },
          {
            key: NodeInputKeyEnum.datasetSearchRerankModel,
            label: 'Rerank model',
            value: 'rerank-v1',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          },
          {
            key: NodeInputKeyEnum.datasetSearchExtensionModel,
            label: 'Extension model',
            value: 'extension-v1',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          },
          {
            key: NodeInputKeyEnum.datasetDeepSearchModel,
            label: 'Deep search model',
            value: 'deep-search-v1',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];

    const result = formatModels({ nodes, models, modelReferencePolicy: 'fallback' });

    expect(result?.[0].inputs).toHaveLength(4);
    expect(result?.[0].inputs.map((input) => input.key)).not.toEqual(
      expect.arrayContaining([
        NodeInputKeyEnum.aiModel,
        NodeInputKeyEnum.datasetSearchRerankModel,
        NodeInputKeyEnum.datasetSearchExtensionModel,
        NodeInputKeyEnum.datasetDeepSearchModel
      ])
    );
    expect(result?.[0].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: NodeInputKeyEnum.aiModelId,
          value: models[0].modelId
        }),
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetSearchRerankModelId,
          value: models[1].modelId
        }),
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetSearchExtensionModelId,
          value: models[2].modelId
        }),
        expect.objectContaining({
          key: NodeInputKeyEnum.datasetDeepSearchModelId,
          value: models[3].modelId
        })
      ])
    );
  });

  it('falls back an unresolved static legacy model to the system default model', () => {
    const nodes = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModel,
            label: 'Model',
            value: 'unauthorized-model',
            selectedType: FlowNodeInputTypeEnum.selectLLMModel,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];

    expect(() =>
      formatModels({ nodes, models, defaultModelIds, modelReferencePolicy: 'fallback' })
    ).not.toThrow();
    expect(nodes[0].inputs[0].key).toBe(NodeInputKeyEnum.aiModelId);
    expect(nodes[0].inputs[0].value).toBe(models[2].modelId);
    expect(nodes[0].inputs).toHaveLength(1);
  });

  it('keeps valid modelId inputs and falls back for disabled optional model inputs', () => {
    const nodes = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.agent,
        name: 'Chat',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModelId,
            label: 'Model',
            value: models[0].modelId,
            selectedType: FlowNodeInputTypeEnum.selectLLMModel,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          },
          {
            key: NodeInputKeyEnum.datasetSearchExtensionModelId,
            label: 'Extension model ID',
            value: '68ad85a7463006c963799aff',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          },
          {
            key: NodeInputKeyEnum.datasetSearchExtensionModel,
            label: 'Extension model',
            value: 'extension-v1',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];

    const result = formatModels({
      nodes,
      models,
      defaultModelIds,
      modelReferencePolicy: 'fallback'
    });

    expect(result?.[0].inputs[0].value).toBe(models[0].modelId);
    expect(result?.[0].inputs[1].value).toBe(models[2].modelId);
    expect(result?.[0].inputs).toHaveLength(2);
    expect(result?.[0].inputs.some((input) => input.key === NodeInputKeyEnum.aiModel)).toBe(false);
    expect(
      result?.[0].inputs.some((input) => input.key === NodeInputKeyEnum.datasetSearchExtensionModel)
    ).toBe(false);
  });

  it('renames reference model keys without changing their values', () => {
    const nodes = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.agent,
        name: 'Chat',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModel,
            label: 'Model',
            value: 'unauthorized-model',
            selectedType: FlowNodeInputTypeEnum.reference,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel, FlowNodeInputTypeEnum.reference]
          },
          {
            key: NodeInputKeyEnum.datasetSearchRerankModel,
            label: 'Rerank model',
            value: ['nodeId', 'outputKey'],
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];
    const result = formatModels({ nodes, models, modelReferencePolicy: 'fallback' });
    expect(result?.[0].inputs[0].key).toBe(NodeInputKeyEnum.aiModelId);
    expect(result?.[0].inputs[0].value).toBe('unauthorized-model');
    expect(result?.[0].inputs[1].key).toBe(NodeInputKeyEnum.datasetSearchRerankModelId);
    expect(result?.[0].inputs[1].value).toEqual(['nodeId', 'outputKey']);
    expect(result?.[0].inputs).toHaveLength(2);
  });

  it('moves dynamic legacy model expressions to the canonical modelId key', () => {
    const nodes = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModel,
            value: '{{selectedModel}}',
            valueType: WorkflowIOValueTypeEnum.string
          }
        ],
        outputs: []
      }
    ];

    formatModels({ nodes, models, modelReferencePolicy: 'fallback' });

    expect(nodes[0].inputs).toEqual([
      expect.objectContaining({
        key: NodeInputKeyEnum.aiModelId,
        value: '{{selectedModel}}'
      })
    ]);
  });

  it('leaves nodes without model inputs unchanged', () => {
    const nodes = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [
          {
            key: 'otherKey',
            label: 'Other',
            value: 'some value',
            renderTypeList: [FlowNodeInputTypeEnum.input]
          }
        ],
        outputs: []
      }
    ];
    const result = formatModels({ nodes, models, modelReferencePolicy: 'fallback' });
    expect(result?.[0].inputs[0].value).toBe('some value');
  });

  it('does not rewrite an external tool input that happens to be named model', () => {
    const nodes = [
      {
        nodeId: 'external-tool',
        flowNodeType: FlowNodeTypeEnum.tool,
        name: 'External tool',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModel,
            label: 'Business model parameter',
            value: 'gpt-4',
            renderTypeList: [FlowNodeInputTypeEnum.select]
          }
        ],
        outputs: []
      }
    ];

    formatModels({ nodes, models, modelReferencePolicy: 'fallback' });

    expect(nodes[0].inputs).toEqual([
      expect.objectContaining({ key: NodeInputKeyEnum.aiModel, value: 'gpt-4' })
    ]);
  });

  it('clears an unresolved rerank model without falling back across model types', () => {
    const nodes = [
      {
        nodeId: 'dataset-search',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        name: 'Dataset search',
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSearchRerankModel,
            label: 'Rerank model',
            value: 'missing-rerank',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];

    formatModels({
      nodes,
      models: models.filter((model) => model.type === ModelTypeEnum.llm),
      modelReferencePolicy: 'fallback'
    });

    expect(nodes[0].inputs).toEqual([
      expect.objectContaining({
        key: NodeInputKeyEnum.datasetSearchRerankModelId,
        value: ''
      })
    ]);
  });

  it('throws one aggregated error for unresolved models on publish', () => {
    const nodes = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.agent,
        name: 'Agent',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModelId,
            value: 'disabled-model-id',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          },
          {
            key: NodeInputKeyEnum.datasetSearchRerankModel,
            value: 'disabled-rerank',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          },
          {
            key: NodeInputKeyEnum.datasetSearchUsingReRank,
            value: true,
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          }
        ],
        outputs: []
      }
    ];

    expect(() => formatModels({ nodes, models, modelReferencePolicy: 'validate' })).toThrow(
      'unavailable'
    );
  });

  it('does not repair an invalid modelId from a valid legacy model when falling back', () => {
    const nodes = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModelId,
            value: 'invalid-id',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          },
          {
            key: NodeInputKeyEnum.aiModel,
            value: 'gpt-4',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];

    formatModels({ nodes, models, defaultModelIds, modelReferencePolicy: 'fallback' });

    expect(nodes[0].inputs).toEqual([
      expect.objectContaining({ key: NodeInputKeyEnum.aiModelId, value: models[2].modelId })
    ]);
  });

  it('repairs an imported modelId by model name and removes the legacy field', () => {
    const nodes = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModelId,
            value: 'model-id-from-another-environment',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          },
          {
            key: NodeInputKeyEnum.aiModel,
            value: 'gpt-4',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];
    const chatConfig = {
      questionGuide: {
        open: true,
        modelId: 'question-guide-id-from-another-environment',
        model: 'gpt-4'
      }
    };

    formatModels({ nodes, chatConfig, models, modelReferencePolicy: 'import' });

    expect(nodes[0].inputs).toEqual([
      expect.objectContaining({ key: NodeInputKeyEnum.aiModelId, value: models[0].modelId })
    ]);
    expect(chatConfig.questionGuide).toEqual({ open: true, modelId: models[0].modelId });
  });

  it('clears unresolved imported model values while preserving canonical inputs', () => {
    const nodes = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
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
        ],
        outputs: []
      },
      {
        nodeId: 'node2',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModel,
            value: 'invalid-legacy-model',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      },
      {
        nodeId: 'agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        name: 'Agent',
        inputs: [
          {
            key: NodeInputKeyEnum.datasetParams,
            value: {
              usingReRank: true,
              rerankModelId: 'invalid-rerank-id',
              rerankModel: 'invalid-rerank-model',
              datasetSearchUsingExtensionQuery: true,
              datasetSearchExtensionModelId: 'invalid-extension-id',
              datasetSearchExtensionModel: 'invalid-extension-model'
            },
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          }
        ],
        outputs: []
      }
    ];
    const chatConfig = {
      questionGuide: {
        open: true,
        modelId: 'invalid-question-guide-id',
        model: 'invalid-question-guide-model'
      },
      ttsConfig: {
        type: 'model' as const,
        modelId: 'invalid-tts-id',
        model: 'invalid-tts-model',
        voice: 'alloy'
      }
    };

    formatModels({ nodes, chatConfig, models, modelReferencePolicy: 'import' });

    expect(nodes[0].inputs).toHaveLength(1);
    expect(nodes[0].inputs[0]).toMatchObject({ key: NodeInputKeyEnum.aiModelId });
    expect(nodes[0].inputs[0]).toHaveProperty('value', undefined);
    expect(nodes[1].inputs).toHaveLength(1);
    expect(nodes[1].inputs[0]).toMatchObject({ key: NodeInputKeyEnum.aiModelId });
    expect(nodes[1].inputs[0]).toHaveProperty('value', undefined);

    const datasetParams = nodes[2].inputs[0].value as Record<string, unknown>;
    expect(datasetParams).toHaveProperty('rerankModelId', undefined);
    expect(datasetParams).not.toHaveProperty('rerankModel');
    expect(datasetParams).toHaveProperty('datasetSearchExtensionModelId', undefined);
    expect(datasetParams).not.toHaveProperty('datasetSearchExtensionModel');

    expect(chatConfig.questionGuide).toHaveProperty('modelId', undefined);
    expect(chatConfig.questionGuide).not.toHaveProperty('model');
    expect(chatConfig.ttsConfig).toHaveProperty('modelId', undefined);
    expect(chatConfig.ttsConfig).not.toHaveProperty('model');
  });

  it('preserves unresolved draft values while removing legacy fields', () => {
    const nodes = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModelId,
            value: 'invalid-id',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          },
          {
            key: NodeInputKeyEnum.aiModel,
            value: 'gpt-4',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      },
      {
        nodeId: 'node2',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModel,
            value: 'unresolved-legacy-model',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];
    const chatConfig = {
      questionGuide: { open: true, modelId: 'invalid-question-guide', model: 'gpt-4' }
    };

    expect(() =>
      formatModels({ nodes, chatConfig, models, modelReferencePolicy: 'preserve' })
    ).not.toThrow();

    expect(nodes[0].inputs).toEqual([
      expect.objectContaining({ key: NodeInputKeyEnum.aiModelId, value: 'invalid-id' })
    ]);
    expect(nodes[1].inputs).toEqual([
      expect.objectContaining({
        key: NodeInputKeyEnum.aiModelId,
        value: 'unresolved-legacy-model'
      })
    ]);
    expect(chatConfig.questionGuide).toEqual({
      open: true,
      modelId: 'invalid-question-guide'
    });
  });

  it('does not validate a canonical reference modelId and removes the legacy input', () => {
    const nodes = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModelId,
            value: ['source-node', 'model-id'],
            selectedType: FlowNodeInputTypeEnum.reference,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel, FlowNodeInputTypeEnum.reference]
          },
          {
            key: NodeInputKeyEnum.aiModel,
            value: 'disabled-model',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];

    expect(() => formatModels({ nodes, models, modelReferencePolicy: 'validate' })).not.toThrow();
    expect(nodes[0].inputs).toEqual([
      expect.objectContaining({
        key: NodeInputKeyEnum.aiModelId,
        value: ['source-node', 'model-id']
      })
    ]);
  });

  it('normalizes nested agent dataset model fields and applies feature gates', () => {
    const nodes = [
      {
        nodeId: 'agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        name: 'Agent',
        inputs: [
          {
            key: NodeInputKeyEnum.datasetParams,
            value: {
              datasets: [{ datasetId: 'dataset-1' }],
              usingReRank: false,
              rerankModel: 'disabled-rerank',
              datasetSearchUsingExtensionQuery: true,
              datasetSearchExtensionModel: 'extension-v1'
            },
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          }
        ],
        outputs: []
      }
    ];

    formatModels({ nodes, models, defaultModelIds, modelReferencePolicy: 'validate' });

    expect(nodes[0].inputs[0].value).toEqual({
      datasets: [{ datasetId: 'dataset-1' }],
      usingReRank: false,
      rerankModelId: 'disabled-rerank',
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionModelId: models[2].modelId
    });
  });

  it('moves nested agent dataset model references to modelId fields without validation', () => {
    const nodes = [
      {
        nodeId: 'agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        name: 'Agent',
        inputs: [
          {
            key: NodeInputKeyEnum.datasetParams,
            value: {
              datasets: [{ datasetId: 'dataset-1' }],
              usingReRank: true,
              rerankModel: ['source-node', 'rerank-model-id'],
              datasetSearchUsingExtensionQuery: true,
              datasetSearchExtensionModelId: '{{extensionModelId}}',
              datasetSearchExtensionModel: 'legacy-extension-model'
            },
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          }
        ],
        outputs: []
      }
    ];

    expect(() => formatModels({ nodes, models, modelReferencePolicy: 'validate' })).not.toThrow();
    expect(nodes[0].inputs[0].value).toEqual({
      datasets: [{ datasetId: 'dataset-1' }],
      usingReRank: true,
      rerankModelId: ['source-node', 'rerank-model-id'],
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionModelId: '{{extensionModelId}}'
    });
  });

  it('adds portable model names for export while retaining modelIds', () => {
    const nodes = [
      {
        nodeId: 'agent',
        flowNodeType: FlowNodeTypeEnum.agent,
        name: 'Agent',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModelId,
            value: models[0].modelId,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          },
          {
            key: NodeInputKeyEnum.datasetParams,
            value: {
              usingReRank: true,
              rerankModelId: models[1].modelId
            },
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          }
        ],
        outputs: []
      },
      {
        nodeId: 'external-tool',
        flowNodeType: FlowNodeTypeEnum.tool,
        name: 'External tool',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModelId,
            value: models[0].modelId,
            renderTypeList: [FlowNodeInputTypeEnum.input]
          }
        ],
        outputs: []
      }
    ];
    const chatConfig = {
      questionGuide: { open: true, modelId: models[0].modelId },
      ttsConfig: { type: 'model' as const, modelId: models[4].modelId }
    };

    addModelNamesToWorkflow({ nodes, chatConfig, models });

    expect(nodes[0].inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: NodeInputKeyEnum.aiModelId, value: models[0].modelId }),
        expect.objectContaining({ key: NodeInputKeyEnum.aiModel, value: models[0].model })
      ])
    );
    expect(nodes[0].inputs[1].value).toEqual({
      usingReRank: true,
      rerankModelId: models[1].modelId,
      rerankModel: models[1].model
    });
    expect(nodes[1].inputs).toHaveLength(1);
    expect(chatConfig.questionGuide).toEqual({
      open: true,
      modelId: models[0].modelId,
      model: models[0].model
    });
    expect(chatConfig.ttsConfig).toEqual({
      type: 'model',
      modelId: models[4].modelId,
      model: models[4].model
    });
  });

  it('never matches team models for legacy model extraction, default fallback, or export model names', () => {
    const teamModels = [
      {
        modelId: 'team-llm-id',
        model: 'team-llm',
        type: ModelTypeEnum.llm,
        scope: 'team'
      }
    ];
    const legacyNodes = [
      {
        nodeId: 'chat-legacy',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat Legacy',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModel,
            value: 'team-llm',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      },
      {
        nodeId: 'chat-id',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat ID',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModelId,
            value: 'team-llm-id',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];
    const chatConfig = {
      questionGuide: { open: true }
    };

    formatModels({
      nodes: legacyNodes,
      chatConfig,
      models: teamModels,
      defaultModelIds: { [ModelTypeEnum.llm]: 'team-llm-id' },
      modelReferencePolicy: 'preserve'
    });

    expect(legacyNodes[0].inputs[0]).toMatchObject({
      key: NodeInputKeyEnum.aiModelId,
      value: 'team-llm'
    });
    expect(legacyNodes[1].inputs[0]).toMatchObject({
      key: NodeInputKeyEnum.aiModelId,
      value: 'team-llm-id'
    });
    expect(chatConfig.questionGuide).toEqual({
      open: true,
      modelId: ''
    });

    addModelNamesToWorkflow({
      nodes: [legacyNodes[1]],
      models: teamModels
    });
    expect(legacyNodes[1].inputs).toHaveLength(1);
  });

  it('validates all duplicate model inputs on a node instead of only the first match', () => {
    const duplicateModelIdNodes = [
      {
        nodeId: 'chat-dup-id',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat Dup ID',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModelId,
            value: models[0].modelId,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          },
          {
            key: NodeInputKeyEnum.aiModelId,
            value: 'invalid-second-model-id',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];

    expect(() =>
      formatModels({
        nodes: duplicateModelIdNodes,
        models,
        modelReferencePolicy: 'validate'
      })
    ).toThrow('Model model is unavailable');

    const duplicateLegacyNodes = [
      {
        nodeId: 'chat-dup-legacy',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat Dup Legacy',
        inputs: [
          {
            key: NodeInputKeyEnum.aiModel,
            value: models[0].model,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          },
          {
            key: NodeInputKeyEnum.aiModel,
            value: 'invalid-second-legacy-model',
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];

    expect(() =>
      formatModels({
        nodes: duplicateLegacyNodes,
        models,
        modelReferencePolicy: 'validate'
      })
    ).toThrow('Model model is unavailable');
  });
});
