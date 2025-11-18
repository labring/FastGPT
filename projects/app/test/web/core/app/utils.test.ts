import { describe, expect, it } from 'vitest';
import { filterSensitiveFormData, getAppQGuideCustomURL } from '@/web/core/app/utils';
import { form2AppWorkflow } from '@/pageComponents/app/detail/Edit/SimpleApp/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/type';

describe('form2AppWorkflow', () => {
  const mockT = (str: string) => str;

  it('should generate simple chat workflow when no datasets or tools selected', () => {
    const form: AppFormEditFormType = {
      aiSettings: {
        [NodeInputKeyEnum.aiModel]: 'gpt-3.5',
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
        searchMode: 'embedding',
        embeddingWeight: 0.7,
        usingReRank: false,
        rerankModel: '',
        rerankWeight: 0.5,
        datasetSearchUsingExtensionQuery: false,
        datasetSearchExtensionModel: '',
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
        [NodeInputKeyEnum.aiModel]: 'gpt-3.5',
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
        searchMode: 'embedding',
        embeddingWeight: 0.7,
        usingReRank: false,
        rerankModel: '',
        rerankWeight: 0.5,
        datasetSearchUsingExtensionQuery: false,
        datasetSearchExtensionModel: '',
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
    const appForm: AppFormEditFormType = {
      aiSettings: {
        [NodeInputKeyEnum.aiModel]: 'gpt-4',
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
        searchMode: 'embedding' as any,
        similarity: 0.9,
        limit: 1500,
        embeddingWeight: 0.7,
        usingReRank: false,
        rerankModel: '',
        rerankWeight: 0.5,
        datasetSearchUsingExtensionQuery: false,
        datasetSearchExtensionModel: '',
        datasetSearchExtensionBg: ''
      },
      selectedTools: [],
      chatConfig: {}
    };

    const result = filterSensitiveFormData(appForm);
    const defaultForm = getDefaultAppForm();

    expect(result.dataset).toEqual(defaultForm.dataset);
    expect(result.aiSettings).toEqual(appForm.aiSettings);
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
