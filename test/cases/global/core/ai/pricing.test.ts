import { describe, expect, it } from 'vitest';
import {
  calculateModelPrice,
  getRuntimeResolvedPriceTiers,
  sanitizeModelPriceTiers
} from '@fastgpt/global/core/ai/pricing';

describe('sanitizeModelPriceTiers', () => {
  it('should always push first tier with minInputTokens: 0 and prices', () => {
    const result = sanitizeModelPriceTiers([{ maxInputTokens: 30, inputPrice: 1, outputPrice: 2 }]);
    expect(result).toEqual([{ minInputTokens: 0, inputPrice: 1, outputPrice: 2 }]);
  });

  it('should push first tier even without prices', () => {
    // @ts-ignore
    const result = sanitizeModelPriceTiers([{ maxInputTokens: 10 }]);
    expect(result).toEqual([{ minInputTokens: 0, inputPrice: 0, outputPrice: 0 }]);
  });

  it('should drop incomplete trailing rows without prices', () => {
    const result = sanitizeModelPriceTiers([
      { maxInputTokens: 30.8, inputPrice: 1, outputPrice: 2 },
      {
        maxInputTokens: undefined,
        // @ts-ignore
        inputPrice: undefined,
        // @ts-ignore
        outputPrice: undefined
      }
    ]);
    expect(result).toEqual([{ minInputTokens: 0, inputPrice: 1, outputPrice: 2 }]);
  });

  it('should include open-ended tier with valid prices', () => {
    const result = sanitizeModelPriceTiers([
      { maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
      { maxInputTokens: 20, inputPrice: 2, outputPrice: 2 },
      { inputPrice: 3, outputPrice: 3 }
    ]);
    expect(result).toEqual([
      { minInputTokens: 0, inputPrice: 1, outputPrice: 1 },
      { minInputTokens: 0, maxInputTokens: 20, inputPrice: 2, outputPrice: 2 },
      { minInputTokens: 20, inputPrice: 3, outputPrice: 3 }
    ]);
  });

  it('should floor maxInputTokens for subsequent tiers', () => {
    const result = sanitizeModelPriceTiers([
      { maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
      { maxInputTokens: 20.9, inputPrice: 2, outputPrice: 2 }
    ]);
    expect(result).toEqual([
      { minInputTokens: 0, inputPrice: 1, outputPrice: 1 },
      { minInputTokens: 0, maxInputTokens: 20, inputPrice: 2, outputPrice: 2 }
    ]);
  });

  it('should skip descending maxInputTokens for subsequent tiers', () => {
    const result = sanitizeModelPriceTiers([
      { maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
      { maxInputTokens: 30, inputPrice: 2, outputPrice: 2 },
      { maxInputTokens: 15, inputPrice: 3, outputPrice: 3 },
      { inputPrice: 4, outputPrice: 4 }
    ]);
    // 第三个梯度 maxInputTokens:15 <= 上一个有效梯度 30，被跳过
    expect(result).toEqual([
      { minInputTokens: 0, inputPrice: 1, outputPrice: 1 },
      { minInputTokens: 0, maxInputTokens: 30, inputPrice: 2, outputPrice: 2 },
      { minInputTokens: 30, inputPrice: 4, outputPrice: 4 }
    ]);
  });
});

describe('getRuntimeResolvedPriceTiers', () => {
  it('should resolve ranges from configured tiers', () => {
    const result = getRuntimeResolvedPriceTiers({
      priceTiers: [
        { maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
        { maxInputTokens: 20, inputPrice: 2, outputPrice: 2 },
        { inputPrice: 3, outputPrice: 3 }
      ]
    });
    expect(result).toEqual([
      { minInputTokens: 0, inputPrice: 1, outputPrice: 1 },
      { minInputTokens: 0, maxInputTokens: 20, inputPrice: 2, outputPrice: 2 },
      { minInputTokens: 20, inputPrice: 3, outputPrice: 3 }
    ]);
  });

  it('should return legacy input/output price tier', () => {
    const result = getRuntimeResolvedPriceTiers({
      inputPrice: 1.5,
      outputPrice: 3
    });
    expect(result).toEqual([{ minInputTokens: 1, inputPrice: 1.5, outputPrice: 3 }]);
  });

  it('should return comprehensive price as same input/output price', () => {
    const result = getRuntimeResolvedPriceTiers({
      charsPointsPrice: 2
    });
    expect(result).toEqual([{ minInputTokens: 1, inputPrice: 2, outputPrice: 2 }]);
  });

  it('should prioritize priceTiers over legacy fields', () => {
    const result = getRuntimeResolvedPriceTiers({
      charsPointsPrice: 10,
      inputPrice: 5,
      outputPrice: 6,
      priceTiers: [{ maxInputTokens: 100, inputPrice: 1, outputPrice: 2 }]
    });
    expect(result).toEqual([{ minInputTokens: 0, inputPrice: 1, outputPrice: 2 }]);
  });

  it('should skip invalid descending tiers when resolving ranges', () => {
    const result = getRuntimeResolvedPriceTiers({
      priceTiers: [
        { maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
        { maxInputTokens: 30, inputPrice: 2, outputPrice: 2 },
        { maxInputTokens: 15, inputPrice: 99, outputPrice: 99 },
        { inputPrice: 3, outputPrice: 3 }
      ]
    });
    expect(result).toEqual([
      { minInputTokens: 0, inputPrice: 1, outputPrice: 1 },
      { minInputTokens: 0, maxInputTokens: 30, inputPrice: 2, outputPrice: 2 },
      { minInputTokens: 30, inputPrice: 3, outputPrice: 3 }
    ]);
  });
});

describe('calculateModelPrice', () => {
  it('should calculate legacy comprehensive price', () => {
    const { totalPoints, matchedTier } = calculateModelPrice({
      config: { charsPointsPrice: 2 },
      inputTokens: 1000,
      outputTokens: 500
    });
    expect(totalPoints).toBe(3);
    expect(matchedTier?.inputPrice).toBe(2);
    expect(matchedTier?.outputPrice).toBe(2);
  });

  it('should keep legacy input/output pricing behavior', () => {
    const { totalPoints, matchedTier } = calculateModelPrice({
      config: { charsPointsPrice: 10, inputPrice: 1.5, outputPrice: 3 },
      inputTokens: 1000,
      outputTokens: 500
    });
    expect(totalPoints).toBe(3);
    expect(matchedTier?.inputPrice).toBe(1.5);
    expect(matchedTier?.outputPrice).toBe(3);
  });

  it('should match price tier by input token range', () => {
    const config = {
      priceTiers: [
        { maxInputTokens: 30, inputPrice: 1, outputPrice: 2 },
        { maxInputTokens: 60, inputPrice: 3, outputPrice: 4 },
        { inputPrice: 5, outputPrice: 6 }
      ]
    };

    // [0, 60) → 第二梯度
    expect(calculateModelPrice({ config, inputTokens: 20 }).matchedTier).toMatchObject({
      minInputTokens: 0,
      maxInputTokens: 60,
      inputPrice: 3,
      outputPrice: 4
    });
    expect(calculateModelPrice({ config, inputTokens: 35 }).matchedTier).toMatchObject({
      minInputTokens: 0,
      maxInputTokens: 60,
      inputPrice: 3,
      outputPrice: 4
    });
    // [60, ∞) → 第三梯度
    expect(calculateModelPrice({ config, inputTokens: 90 }).matchedTier).toMatchObject({
      minInputTokens: 60,
      inputPrice: 5,
      outputPrice: 6
    });
  });

  it('should calculate price with matched tier prices', () => {
    const { totalPoints } = calculateModelPrice({
      config: {
        priceTiers: [
          { maxInputTokens: 30, inputPrice: 1, outputPrice: 2 },
          { maxInputTokens: 60, inputPrice: 3, outputPrice: 4 }
        ]
      },
      inputTokens: 50,
      outputTokens: 100
    });
    expect(totalPoints).toBeCloseTo(0.55);
  });

  it('should match exact tier boundaries correctly', () => {
    const config = {
      priceTiers: [
        { maxInputTokens: 30, inputPrice: 1, outputPrice: 2 },
        { maxInputTokens: 60, inputPrice: 3, outputPrice: 4 },
        { inputPrice: 5, outputPrice: 6 }
      ]
    };

    // 59 → [0, 60)
    expect(calculateModelPrice({ config, inputTokens: 59 }).matchedTier).toMatchObject({
      minInputTokens: 0,
      maxInputTokens: 60,
      inputPrice: 3,
      outputPrice: 4
    });
    // 60 → [60, ∞)
    expect(calculateModelPrice({ config, inputTokens: 60 }).matchedTier).toMatchObject({
      minInputTokens: 60,
      inputPrice: 5,
      outputPrice: 6
    });
    expect(calculateModelPrice({ config, inputTokens: 10000 }).matchedTier).toMatchObject({
      minInputTokens: 60,
      inputPrice: 5,
      outputPrice: 6
    });
  });

  it('should fallback to first tier when input tokens are 0', () => {
    const config = {
      priceTiers: [{ maxInputTokens: 30, inputPrice: 1, outputPrice: 2 }]
    };
    // 单梯度时，0 tokens → 第一梯度
    expect(calculateModelPrice({ config, inputTokens: 0 }).matchedTier).toMatchObject({
      minInputTokens: 0,
      inputPrice: 1,
      outputPrice: 2
    });
  });

  it('should prioritize price tiers over legacy fields', () => {
    const { matchedTier, totalPoints } = calculateModelPrice({
      config: {
        charsPointsPrice: 10,
        inputPrice: 5,
        outputPrice: 6,
        priceTiers: [{ maxInputTokens: 100, inputPrice: 1, outputPrice: 2 }]
      },
      inputTokens: 1000,
      outputTokens: 1000
    });
    expect(matchedTier?.inputPrice).toBe(1);
    expect(matchedTier?.outputPrice).toBe(2);
    expect(totalPoints).toBe(3);
  });
});
