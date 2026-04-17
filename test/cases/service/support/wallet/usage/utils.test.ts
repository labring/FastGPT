import { describe, expect, it, vi } from 'vitest';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';

// mock findAIModel，避免依赖全局 model map
const mockModels: Record<string, any> = {
  'gpt-4': {
    name: 'GPT-4',
    model: 'gpt-4',
    charsPointsPrice: 0,
    inputPrice: 3,
    outputPrice: 6
  },
  'gpt-3.5': {
    name: 'GPT-3.5',
    model: 'gpt-3.5',
    charsPointsPrice: 2
  },
  'tiered-model': {
    name: 'Tiered',
    model: 'tiered-model',
    priceTiers: [
      { maxInputTokens: 1, inputPrice: 1, outputPrice: 2 },
      { inputPrice: 5, outputPrice: 10 }
    ]
  }
};

vi.mock('@fastgpt/service/core/ai/model', () => ({
  findAIModel: (model: string) => mockModels[model]
}));

describe('formatModelChars2Points', () => {
  it('should return 0 points and empty name when model not found', () => {
    const result = formatModelChars2Points({ model: 'non-existent' });
    expect(result).toEqual({ totalPoints: 0, modelName: '' });
  });

  it('should return 0 points and empty name when model is empty string', () => {
    const result = formatModelChars2Points({ model: '' });
    expect(result).toEqual({ totalPoints: 0, modelName: '' });
  });

  it('should calculate points with legacy input/output pricing', () => {
    const result = formatModelChars2Points({
      model: 'gpt-4',
      inputTokens: 1000,
      outputTokens: 500
    });
    expect(result.modelName).toBe('GPT-4');
    // inputPrice:3 * (1000/1000) + outputPrice:6 * (500/1000) = 3 + 3 = 6
    expect(result.totalPoints).toBe(6);
  });

  it('should calculate points with comprehensive price', () => {
    const result = formatModelChars2Points({
      model: 'gpt-3.5',
      inputTokens: 2000,
      outputTokens: 1000
    });
    expect(result.modelName).toBe('GPT-3.5');
    // charsPointsPrice:2 → inputPrice=outputPrice=2
    // 2 * (2000/1000) + 2 * (1000/1000) = 4 + 2 = 6
    expect(result.totalPoints).toBe(6);
  });

  it('should use default 0 tokens when not provided', () => {
    const result = formatModelChars2Points({ model: 'gpt-4' });
    expect(result.modelName).toBe('GPT-4');
    expect(result.totalPoints).toBe(0);
  });

  it('should support custom multiple parameter', () => {
    const result = formatModelChars2Points({
      model: 'gpt-4',
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
      model: 'tiered-model',
      inputTokens: 2000,
      outputTokens: 100
    });
    expect(result.modelName).toBe('Tiered');
    // inputTokens:200 匹配第二梯度 (inputPrice:5, outputPrice:10)
    // 5 * (2000/1000) + 10 * (100/1000) = 10 + 1 = 11
    expect(result.totalPoints).toBe(11);
  });
});
