import { describe, expect, it } from 'vitest';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import type { SystemModelItemType } from '@fastgpt/service/core/ai/model/type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

// formatModelChars2Points 现在直接接收完整模型对象（SystemModelItemType），不再内部查表。
const llmBaseFields = {
  maxContext: 16000,
  maxResponse: 8000,
  quoteMaxToken: 12000,
  functionCall: true,
  toolChoice: true
};

const gpt4Model: SystemModelItemType = {
  id: 'model-gpt4',
  type: ModelTypeEnum.llm,
  provider: 'openai',
  model: 'gpt-4',
  name: 'GPT-4',
  isActive: true,
  isSystem: true,
  ...llmBaseFields,
  charsPointsPrice: 0,
  inputPrice: 3,
  outputPrice: 6
};

const gpt35Model: SystemModelItemType = {
  id: 'model-gpt35',
  type: ModelTypeEnum.llm,
  provider: 'openai',
  model: 'gpt-3.5',
  name: 'GPT-3.5',
  isActive: true,
  isSystem: true,
  ...llmBaseFields,
  charsPointsPrice: 2
};

const tieredModel: SystemModelItemType = {
  id: 'model-tiered',
  type: ModelTypeEnum.llm,
  provider: 'openai',
  model: 'tiered-model',
  name: 'Tiered',
  isActive: true,
  isSystem: true,
  ...llmBaseFields,
  priceTiers: [
    { maxInputTokens: 1, inputPrice: 1, outputPrice: 2 },
    { inputPrice: 5, outputPrice: 10 }
  ]
};

describe('formatModelChars2Points', () => {
  it('should return 0 points and empty name when model is undefined', () => {
    const result = formatModelChars2Points({ modelData: undefined });
    expect(result).toEqual({ totalPoints: 0, modelName: '' });
  });

  it('should calculate points with legacy input/output pricing', () => {
    const result = formatModelChars2Points({
      modelData: gpt4Model,
      inputTokens: 1000,
      outputTokens: 500
    });
    expect(result.modelName).toBe('GPT-4');
    // inputPrice:3 * (1000/1000) + outputPrice:6 * (500/1000) = 3 + 3 = 6
    expect(result.totalPoints).toBe(6);
  });

  it('should calculate points with comprehensive price', () => {
    const result = formatModelChars2Points({
      modelData: gpt35Model,
      inputTokens: 2000,
      outputTokens: 1000
    });
    expect(result.modelName).toBe('GPT-3.5');
    // charsPointsPrice:2 → inputPrice=outputPrice=2
    // 2 * (2000/1000) + 2 * (1000/1000) = 4 + 2 = 6
    expect(result.totalPoints).toBe(6);
  });

  it('should use default 0 tokens when not provided', () => {
    const result = formatModelChars2Points({ modelData: gpt4Model });
    expect(result.modelName).toBe('GPT-4');
    expect(result.totalPoints).toBe(0);
  });

  it('should support custom multiple parameter', () => {
    const result = formatModelChars2Points({
      modelData: gpt4Model,
      inputTokens: 500,
      outputTokens: 500,
      multiple: 500
    });
    expect(result.modelName).toBe('GPT-4');
    // inputPrice:3 * (500/500) + outputPrice:6 * (500/500) = 3 + 6 = 9
    expect(result.totalPoints).toBe(9);
  });

  it('should calculate points with price tiers', () => {
    const result = formatModelChars2Points({
      modelData: tieredModel,
      inputTokens: 2000,
      outputTokens: 100
    });
    expect(result.modelName).toBe('Tiered');
    // inputTokens:2000 匹配第二梯度 (inputPrice:5, outputPrice:10)
    // 5 * (2000/1000) + 10 * (100/1000) = 10 + 1 = 11
    expect(result.totalPoints).toBe(11);
  });
});
