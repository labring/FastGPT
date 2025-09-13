import { describe, expect, it } from 'vitest';
import {
  form2AppWorkflow,
  filterSensitiveFormData,
  getAppQGuideCustomURL
} from '@/web/core/app/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';

describe('form2AppWorkflow', () => {
  const mockT = (str: string) => str;

  it('should generate simple chat workflow when no datasets or tools selected', () => {
    const form = {
      aiSettings: {
        model: 'gpt-3.5',
        temperature: 0.7,
        maxToken: 2000,
        systemPrompt: 'You are a helpful assistant',
        maxHistories: 5,
        aiChatReasoning: true,
        aiChatTopP: 0.8,
        aiChatStopSign: '',
        aiChatResponseFormat: '',
        aiChatJsonSchema: ''
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
    const form = {
      aiSettings: {
        model: 'gpt-3.5',
        temperature: 0.7,
        maxToken: 2000,
        systemPrompt: 'You are a helpful assistant',
        maxHistories: 5,
        aiChatReasoning: true,
        aiChatTopP: 0.8,
        aiChatStopSign: '',
        aiChatResponseFormat: '',
        aiChatJsonSchema: ''
      },
      dataset: {
        datasets: ['dataset1'],
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
    const appForm = {
      aiSettings: {
        model: 'gpt-4',
        temperature: 0.8
      },
      dataset: {
        datasets: ['sensitive-dataset'],
        similarity: 0.9
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
    };

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
    };

    const result = getAppQGuideCustomURL(appDetail);
    expect(result).toBe('');
  });
});
