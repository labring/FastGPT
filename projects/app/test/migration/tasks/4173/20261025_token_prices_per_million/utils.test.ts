import { describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { convertLegacyModelPricing } from '@/migration/tasks/4173/20261025_token_prices_per_million/utils';

describe('legacy pricing conversion', () => {
  it.each([
    [4.1001, 0.0041001],
    [1e-7, 1e-10],
    [1.234567890123456e21, 1.234567890123456e18]
  ])('preserves boundary %s -> %s', (source, target) => {
    const legacy = {
      priceTiers: [
        { minInputTokens: 0, maxInputTokens: source, inputPrice: 0.000035, outputPrice: 0.000065 },
        { minInputTokens: source, inputPrice: 1, outputPrice: 2 }
      ]
    };
    expect(convertLegacyModelPricing(legacy, ModelTypeEnum.llm)).toEqual({
      tiers: [
        { maxInputTokens: target, inputPrice: 0.04, outputPrice: 0.07 },
        { inputPrice: 1000, outputPrice: 2000 }
      ]
    });
    expect(legacy.priceTiers[0].maxInputTokens).toBe(source);
  });
  it('marks price-less models as migrated without inventing a unit rate', () => {
    expect(convertLegacyModelPricing({}, ModelTypeEnum.llm)).toEqual({ tiers: [] });
    expect(convertLegacyModelPricing({}, ModelTypeEnum.tts)).toEqual({});
    expect(convertLegacyModelPricing({ outputPrice: 2 }, ModelTypeEnum.llm)).toEqual({
      tiers: [{ inputPrice: 0, outputPrice: 2000 }]
    });
    expect(
      convertLegacyModelPricing({ inputPrice: 0, charsPointsPrice: 4 }, ModelTypeEnum.llm)
    ).toEqual({ tiers: [{ inputPrice: 0, outputPrice: 0 }] });
  });
});
