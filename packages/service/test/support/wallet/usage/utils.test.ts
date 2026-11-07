import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import { describe, expect, it } from 'vitest';

const model: LLMModelDataType = {
  modelId: '507f1f77bcf86cd799439021',
  name: 'Test',
  model: 'test',
  type: ModelTypeEnum.llm,
  provider: 'test',
  scope: ModelScopeEnum.system,
  isActive: true,
  config: { maxContext: 1000, maxResponse: 100, quoteMaxToken: 500 },
  pricing: { tiers: [{ inputPrice: 3, outputPrice: 6 }] }
};

describe('formatModelChars2Points', () => {
  it('forwards both usage counts to pricing and returns the model ID', () => {
    expect(formatModelChars2Points({ model, inputTokens: 1000000, outputTokens: 500000 })).toEqual({
      modelId: model.modelId,
      totalPoints: 6
    });
  });

  it('defaults omitted usage counts to zero', () => {
    expect(formatModelChars2Points({ model })).toEqual({
      modelId: model.modelId,
      totalPoints: 0
    });
  });
});
