import { describe, expect, it } from 'vitest';
import {
  filterSensitiveFormData,
  getAppQGuideCustomURL,
  getEmbeddingModelSelectList
} from '@/web/core/app/utils';
import { form2AppWorkflow } from '@/pageComponents/app/detail/Edit/SimpleApp/utils';
import { appWorkflow2AgentForm } from '@/pageComponents/app/detail/Edit/ChatAgent/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { DatasetSearchModeEnum, RerankMethodEnum } from '@fastgpt/global/core/dataset/constants';

describe('form2AppWorkflow', () => {
  const mockT = (str: string) => str;

  it('should generate simple chat workflow when no datasets or tools selected', () => {
    const form: AppFormEditFormType = {
      aiSettings: {
        [NodeInputKeyEnum.aiModelId]: 'gpt-3.5',
        [NodeInputKeyEnum.aiChatTemperature]: 0.7,
        [NodeInputKeyEnum.aiChatMaxToken]: 2000,
        [NodeInputKeyEnum.aiSystemPrompt]: 'You are a helpful assistant',
        maxHistories: 5,
        [NodeInputKeyEnum.aiChatIsResponseText]: true,
        [NodeInputKeyEnum.aiChatReasoning]: true,
        [NodeInputKeyEnum.aiChatTopP]: 0.8,
        [NodeInputKeyEnum.aiChatStopSign]: '',
        [NodeInputKeyEnum.aiChatResponseFormat]: '',
        [NodeInputKeyEnum.aiChatJsonSchema]: ''
      },
      dataset: {
        datasets: [],
        similarity: 0.8,
        limit: 1500,
        searchMode: DatasetSearchModeEnum.embedding,
        embeddingWeight: 0.7,
        usingReRank: false,
        rerankModelId: '',
        rerankMethod: RerankMethodEnum.content,
        rerankWeight: 0.5,
        datasetSearchUsingExtensionQuery: false,
        datasetSearchExtensionModelId: '',
        datasetSearchExtensionBg: ''
      },
      selectedTools: [],
      chatConfig: {}
    };

    const result = form2AppWorkflow(form, mockT);

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(1);
  });

  it('should generate dataset workflow when datasets are selected', () => {
    const form: AppFormEditFormType = {
      aiSettings: {
        [NodeInputKeyEnum.aiModelId]: 'gpt-3.5',
        [NodeInputKeyEnum.aiChatTemperature]: 0.7,
        [NodeInputKeyEnum.aiChatMaxToken]: 2000,
        [NodeInputKeyEnum.aiSystemPrompt]: 'You are a helpful assistant',
        maxHistories: 5,
        [NodeInputKeyEnum.aiChatIsResponseText]: true,
        [NodeInputKeyEnum.aiChatReasoning]: true,
        [NodeInputKeyEnum.aiChatTopP]: 0.8,
        [NodeInputKeyEnum.aiChatStopSign]: '',
        [NodeInputKeyEnum.aiChatResponseFormat]: '',
        [NodeInputKeyEnum.aiChatJsonSchema]: ''
      },
      dataset: {
        datasets: [
          {
            datasetId: 'dataset1',
            avatar: '',
            name: 'Test Dataset',
            vectorModel: { model: 'text-embedding-ada-002' } as any
          }
        ],
        similarity: 0.8,
        limit: 1500,
        searchMode: DatasetSearchModeEnum.embedding,
        embeddingWeight: 0.7,
        usingReRank: false,
        rerankModelId: '',
        rerankMethod: RerankMethodEnum.content,
        rerankWeight: 0.5,
        datasetSearchUsingExtensionQuery: false,
        datasetSearchExtensionModelId: '',
        datasetSearchExtensionBg: ''
      },
      selectedTools: [],
      chatConfig: {}
    };

    const result = form2AppWorkflow(form, mockT);

    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(2);
  });
});

describe('filterSensitiveFormData', () => {
  it('should filter sensitive data from app form', () => {
    const toolSecretValue = {
      type: 'manual',
      value: {
        apiKey: {
          secret: '',
          value: 'secret-key'
        }
      }
    };
    const appForm: AppFormEditFormType = {
      aiSettings: {
        [NodeInputKeyEnum.aiModelId]: 'gpt-4',
        [NodeInputKeyEnum.aiChatTemperature]: 0.8,
        maxHistories: 5,
        [NodeInputKeyEnum.aiChatIsResponseText]: true
      },
      dataset: {
        datasets: [
          {
            datasetId: 'sensitive-dataset',
            avatar: '',
            name: 'Sensitive Dataset',
            vectorModel: { model: 'text-embedding-ada-002' } as any
          }
        ],
        searchMode: DatasetSearchModeEnum.embedding,
        similarity: 0.9,
        limit: 1500,
        embeddingWeight: 0.7,
        usingReRank: false,
        rerankModelId: '',
        rerankWeight: 0.5,
        datasetSearchUsingExtensionQuery: false,
        datasetSearchExtensionModelId: '',
        datasetSearchExtensionBg: ''
      },
      selectedTools: [
        {
          id: 'tool-1',
          pluginId: 'plugin-1',
          flowNodeType: FlowNodeTypeEnum.tool,
          templateType: 'other',
          name: 'Weather Tool',
          avatar: '',
          intro: '',
          inputs: [
            {
              key: NodeInputKeyEnum.systemInputConfig,
              value: toolSecretValue,
              renderTypeList: [],
              valueType: 'any'
            },
            {
              key: NodeInputKeyEnum.history,
              value: 5,
              renderTypeList: [],
              valueType: 'number'
            }
          ],
          outputs: []
        } as any
      ],
      chatConfig: {}
    };

    const result = filterSensitiveFormData(appForm);
    const defaultForm = getDefaultAppForm();
    const resultSecretInput = result.selectedTools[0].inputs.find(
      (input) => input.key === NodeInputKeyEnum.systemInputConfig
    );
    const resultHistoryInput = result.selectedTools[0].inputs.find(
      (input) => input.key === NodeInputKeyEnum.history
    );

    expect(result.dataset).toEqual(defaultForm.dataset);
    expect(result.aiSettings).toEqual(appForm.aiSettings);
    expect(resultSecretInput?.value).toBeUndefined();
    expect(resultHistoryInput?.value).toBe(5);
    expect(appForm.selectedTools[0].inputs[0].value).toEqual(toolSecretValue);
  });
});

describe('getAppQGuideCustomURL', () => {
  it('should get custom URL from app detail', () => {
    const appDetail = {
      modules: [
        {
          flowNodeType: FlowNodeTypeEnum.systemConfig,
          inputs: [
            {
              key: NodeInputKeyEnum.chatInputGuide,
              value: {
                customUrl: 'https://example.com'
              }
            }
          ]
        }
      ]
    } as any;

    const result = getAppQGuideCustomURL(appDetail);
    expect(result).toBe('https://example.com');
  });

  it('should return empty string if no custom URL found', () => {
    const appDetail = {
      modules: [
        {
          flowNodeType: FlowNodeTypeEnum.systemConfig,
          inputs: []
        }
      ]
    } as any;

    const result = getAppQGuideCustomURL(appDetail);
    expect(result).toBe('');
  });
});

describe('appWorkflow2AgentForm', () => {
  it('should normalize dataset rerank fields from partial datasetParams', () => {
    const result = appWorkflow2AgentForm({
      nodes: [
        {
          flowNodeType: FlowNodeTypeEnum.agent,
          inputs: [
            {
              key: NodeInputKeyEnum.datasetParams,
              value: {
                datasets: [],
                searchMode: 'embedding'
              }
            }
          ]
        } as any
      ],
      chatConfig: {} as any
    });

    expect(result.dataset.usingReRank).toBe(false);
    expect(result.dataset.rerankModelId).toBe('');
    expect(result.dataset.rerankWeight).toBe(0.4);
  });
});

describe('getEmbeddingModelSelectList', () => {
  const baseModel = {
    model: 'text-embedding-ada-002',
    name: 'text-embedding-ada-002',
    isTuned: false
  };

  const tunedModel = {
    model: 'tuned-embedding-v1',
    name: 'tuned-embedding-v1',
    isTuned: true,
    trainTaskSummary: {
      baseModelIds: ['text-embedding-ada-002'],
      totalCount: 1,
      hasRunning: false,
      hasError: false
    }
  };

  const multiBaseTunedModel = {
    model: 'tuned-embedding-v2',
    name: 'tuned-embedding-v2',
    isTuned: true,
    trainTaskSummary: {
      baseModelIds: ['text-embedding-ada-002', 'other-base-model'],
      totalCount: 2,
      hasRunning: false,
      hasError: false
    }
  };

  const unrelatedTunedModel = {
    model: 'tuned-other',
    name: 'tuned-other',
    isTuned: true,
    trainTaskSummary: {
      baseModelIds: ['some-other-model'],
      totalCount: 1,
      hasRunning: false,
      hasError: false
    }
  };

  const tunedModelWithoutSummary = {
    model: 'tuned-no-summary',
    name: 'tuned-no-summary',
    isTuned: true
  };

  const modelList = [
    baseModel,
    tunedModel,
    multiBaseTunedModel,
    unrelatedTunedModel,
    tunedModelWithoutSummary
  ];

  it('should return empty array when datasetVectorModel is undefined', () => {
    const result = getEmbeddingModelSelectList(modelList, undefined);
    expect(result).toEqual([]);
  });

  it('should return empty array when modelList is empty', () => {
    const result = getEmbeddingModelSelectList([], 'text-embedding-ada-002');
    expect(result).toEqual([]);
  });

  it('should include base model that matches datasetVectorModel directly', () => {
    const result = getEmbeddingModelSelectList(modelList, 'text-embedding-ada-002');
    expect(result).toContainEqual({
      value: 'text-embedding-ada-002',
      label: 'text-embedding-ada-002'
    });
  });

  it('should include tuned model whose baseModelIds contains datasetVectorModel', () => {
    const result = getEmbeddingModelSelectList(modelList, 'text-embedding-ada-002');
    expect(result).toContainEqual({ value: 'tuned-embedding-v1', label: 'tuned-embedding-v1' });
    expect(result).toContainEqual({ value: 'tuned-embedding-v2', label: 'tuned-embedding-v2' });
  });

  it('should not include tuned model whose baseModelIds does not contain datasetVectorModel', () => {
    const result = getEmbeddingModelSelectList(modelList, 'text-embedding-ada-002');
    expect(result).not.toContainEqual({ value: 'tuned-other', label: 'tuned-other' });
  });

  it('should not include non-tuned model that does not match datasetVectorModel', () => {
    const result = getEmbeddingModelSelectList(modelList, 'some-other-model');
    expect(result).toContainEqual({ value: 'tuned-other', label: 'tuned-other' });
    expect(result).not.toContainEqual({
      value: 'text-embedding-ada-002',
      label: 'text-embedding-ada-002'
    });
  });

  it('should handle tuned model without trainTaskSummary gracefully', () => {
    const result = getEmbeddingModelSelectList(modelList, 'text-embedding-ada-002');
    expect(result).not.toContainEqual({ value: 'tuned-no-summary', label: 'tuned-no-summary' });
  });

  it('should handle trainTaskSummary without baseModelIds gracefully', () => {
    const modelWithoutBaseModelIds = {
      model: 'tuned-empty-ids',
      name: 'tuned-empty-ids',
      isTuned: true,
      trainTaskSummary: {
        totalCount: 0,
        hasRunning: false,
        hasError: false
      }
    };
    const list = [baseModel, modelWithoutBaseModelIds];
    const result = getEmbeddingModelSelectList(list, 'text-embedding-ada-002');
    expect(result).toContainEqual({
      value: 'text-embedding-ada-002',
      label: 'text-embedding-ada-002'
    });
    expect(result).not.toContainEqual({ value: 'tuned-empty-ids', label: 'tuned-empty-ids' });
  });
});
