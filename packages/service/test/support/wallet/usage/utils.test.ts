import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDataType, LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import { describe, expect, it, vi } from 'vitest';

const createModel = (
  data: Pick<AIModelDataType, 'modelId' | 'name' | 'model'> &
    Partial<Pick<LLMModelDataType, 'pricing'>>
): AIModelDataType => ({
  ...data,
  type: ModelTypeEnum.llm,
  provider: 'test',
  scope: ModelScopeEnum.system,
  isActive: true,
  config: { maxContext: 1000, maxResponse: 100, quoteMaxToken: 500 }
});

const mockModels: Record<string, AIModelDataType> = {
  'gpt-4': createModel({
    modelId: '507f1f77bcf86cd799439021',
    name: 'GPT-4',
    model: 'gpt-4',
    pricing: { tiers: [{ inputPrice: 3, outputPrice: 6 }] }
  }),
  'gpt-3.5': createModel({
    modelId: '507f1f77bcf86cd799439022',
    name: 'GPT-3.5',
    model: 'gpt-3.5',
    pricing: { tiers: [{ inputPrice: 2, outputPrice: 2 }] }
  }),
  'tiered-model': createModel({
    modelId: '507f1f77bcf86cd799439023',
    name: 'Tiered',
    model: 'tiered-model',
    pricing: {
      tiers: [
        { maxInputTokens: 1, inputPrice: 1, outputPrice: 2 },
        { inputPrice: 5, outputPrice: 10 }
      ]
    }
  })
};

vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getSystemModelHandle: async () => ({
    findModelData: (reference: { modelId?: string; model?: string }) => {
      if (reference.modelId) {
        return Object.values(mockModels).find((model) => model.modelId === reference.modelId);
      }
      return reference.model ? mockModels[reference.model] : undefined;
    }
  }),
  getTeamModelHandle: async () => ({
    findModelData: (reference: { modelId?: string; model?: string }) => {
      if (reference.modelId) {
        return Object.values(mockModels).find((model) => model.modelId === reference.modelId);
      }
      return reference.model ? mockModels[reference.model] : undefined;
    }
  })
}));

describe('formatModelChars2Points', () => {
  it('should calculate points with configured LLM pricing', () => {
    const result = formatModelChars2Points({
      model: mockModels['gpt-4'],
      inputTokens: 1000000,
      outputTokens: 500000
    });
    expect(result.modelId).toBe('507f1f77bcf86cd799439021');
    // 每百万单价：1M 输入和 0.5M 输出，共 6 积分。
    expect(result.totalPoints).toBe(6);
  });

  it('should calculate points with comprehensive price', () => {
    const result = formatModelChars2Points({
      model: mockModels['gpt-3.5'],
      inputTokens: 2000000,
      outputTokens: 1000000
    });
    expect(result.modelId).toBe('507f1f77bcf86cd799439022');
    // 单档输入、输出单价均为 2。
    // 2M 输入和 1M 输出，共 6 积分。
    expect(result.totalPoints).toBe(6);
  });

  it('should use default 0 tokens when not provided', () => {
    const result = formatModelChars2Points({ model: mockModels['gpt-4'] });
    expect(result.modelId).toBe('507f1f77bcf86cd799439021');
    expect(result.totalPoints).toBe(0);
  });

  it('should calculate points with price tiers', () => {
    const result = formatModelChars2Points({
      model: mockModels['tiered-model'],
      inputTokens: 2000000,
      outputTokens: 100000
    });
    expect(result.modelId).toBe('507f1f77bcf86cd799439023');
    // 2M 输入匹配第二档，0.1M 输出，共 11 积分。
    expect(result.totalPoints).toBe(11);
  });
});
