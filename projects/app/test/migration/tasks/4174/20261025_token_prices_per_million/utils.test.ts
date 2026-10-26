import { describe, expect, it } from 'vitest';
import { convertModelPricingToMillion } from '@/migration/tasks/4174/20261025_token_prices_per_million/utils';

describe('convertModelPricingToMillion', () => {
  it.each([
    [4.1001, 0.0041001],
    [1e-7, 1e-10],
    [1.234567890123456e21, 1.234567890123456e18]
  ])('preserves decimal and exponential boundary precision: %s -> %s', (source, target) => {
    const result = convertModelPricingToMillion({
      priceTiers: [
        { maxInputTokens: source, inputPrice: 1, outputPrice: 0 },
        { minInputTokens: source, inputPrice: 3, outputPrice: 0 }
      ]
    });
    expect(result.priceTiers[0].maxInputTokens).toBe(target);
    expect(result.priceTiers[1].minInputTokens).toBe(target);
  });

  it('converts source prices and boundaries without mutation or filling omitted prices', () => {
    const source = {
      inputPrice: 0.000125,
      outputPrice: 0,
      charsPointsPrice: 0.5,
      priceTiers: [
        { minInputTokens: 0, maxInputTokens: 32, inputPrice: 2, outputPrice: 6 },
        {
          minInputTokens: 32,
          maxInputTokens: null,
          inputPrice: 4,
          outputPrice: 8
        }
      ]
    };
    const result = convertModelPricingToMillion(source);
    expect(result).toMatchObject({
      inputPrice: 0.125,
      outputPrice: 0,
      charsPointsPrice: 500,
      priceTiers: [
        {
          minInputTokens: 0,
          maxInputTokens: 0.032,
          inputPrice: 2000,
          outputPrice: 6000
        },
        {
          minInputTokens: 0.032,
          maxInputTokens: null,
          inputPrice: 4000,
          outputPrice: 8000
        }
      ]
    });
    expect(source.priceTiers[0].maxInputTokens).toBe(32);
    expect(convertModelPricingToMillion({})).toEqual({});
    expect(
      convertModelPricingToMillion({ priceTiers: [{ inputPrice: 1, outputPrice: 2 }] }).priceTiers
    ).toEqual([{ inputPrice: 1000, outputPrice: 2000 }]);
  });
});
