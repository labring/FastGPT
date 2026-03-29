import { describe, expect, it } from 'vitest';
import {
  calculateModelPrice,
  getRuntimeResolvedPriceTiers,
  sanitizeModelPriceTiers
} from '@fastgpt/global/core/ai/pricing';

describe('sanitizeModelPriceTiers', () => {
  it('should return empty array for non-array input', () => {
    // @ts-ignore
    expect(sanitizeModelPriceTiers(null)).toEqual([]);
    // @ts-ignore
    expect(sanitizeModelPriceTiers(undefined)).toEqual([]);
    // @ts-ignore
    expect(sanitizeModelPriceTiers('invalid')).toEqual([]);
    // @ts-ignore
    expect(sanitizeModelPriceTiers(123)).toEqual([]);
  });

  it('should return empty array for empty array', () => {
    expect(sanitizeModelPriceTiers([])).toEqual([]);
  });

  it('should always push first tier with minInputTokens: 0 and prices', () => {
    const result = sanitizeModelPriceTiers([{ maxInputTokens: 30, inputPrice: 1, outputPrice: 2 }]);
    expect(result).toEqual([
      { minInputTokens: 0, maxInputTokens: 30, inputPrice: 1, outputPrice: 2 }
    ]);
  });

  it('should push first tier even without prices', () => {
    // @ts-ignore
    const result = sanitizeModelPriceTiers([{ maxInputTokens: 10 }]);
    expect(result).toEqual([
      { minInputTokens: 0, maxInputTokens: 10, inputPrice: 0, outputPrice: 0 }
    ]);
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
    expect(result).toEqual([
      { minInputTokens: 0, maxInputTokens: 30.8, inputPrice: 1, outputPrice: 2 }
    ]);
  });

  it('should include open-ended tier with valid prices', () => {
    const result = sanitizeModelPriceTiers([
      { maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
      { maxInputTokens: 20, inputPrice: 2, outputPrice: 2 },
      { inputPrice: 3, outputPrice: 3 }
    ]);
    expect(result).toEqual([
      { minInputTokens: 0, maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
      { minInputTokens: 10, maxInputTokens: 20, inputPrice: 2, outputPrice: 2 },
      { minInputTokens: 20, inputPrice: 3, outputPrice: 3 }
    ]);
  });

  it('should preserve decimal maxInputTokens for subsequent tiers', () => {
    const result = sanitizeModelPriceTiers([
      { maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
      { maxInputTokens: 20.9, inputPrice: 2, outputPrice: 2 }
    ]);
    expect(result).toEqual([
      { minInputTokens: 0, maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
      { minInputTokens: 10, maxInputTokens: 20.9, inputPrice: 2, outputPrice: 2 }
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
      { minInputTokens: 0, maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
      { minInputTokens: 10, maxInputTokens: 30, inputPrice: 2, outputPrice: 2 },
      { minInputTokens: 30, inputPrice: 4, outputPrice: 4 }
    ]);
  });

  it('should handle negative maxInputTokens by converting to 0', () => {
    const result = sanitizeModelPriceTiers([
      { maxInputTokens: -10, inputPrice: 1, outputPrice: 2 }
    ]);
    expect(result).toEqual([
      { minInputTokens: 0, maxInputTokens: 0, inputPrice: 1, outputPrice: 2 }
    ]);
  });

  it('should handle NaN and Infinity in prices', () => {
    const result = sanitizeModelPriceTiers([
      // @ts-ignore
      { maxInputTokens: 10, inputPrice: NaN, outputPrice: Infinity }
    ]);
    expect(result).toEqual([
      { minInputTokens: 0, maxInputTokens: 10, inputPrice: 0, outputPrice: 0 }
    ]);
  });

  it('should handle invalid maxInputTokens types', () => {
    const result = sanitizeModelPriceTiers([
      // @ts-ignore
      { maxInputTokens: 'invalid', inputPrice: 1, outputPrice: 2 },
      { maxInputTokens: 20, inputPrice: 3, outputPrice: 4 }
    ]);
    // 第一个梯度的 maxInputTokens 无效，被视为 undefined，但仍会被添加
    // 第二个梯度也会被添加，minInputTokens 为 0（因为 last.maxInputTokens ?? 0）
    expect(result).toEqual([
      { minInputTokens: 0, maxInputTokens: undefined, inputPrice: 1, outputPrice: 2 },
      { minInputTokens: 0, maxInputTokens: 20, inputPrice: 3, outputPrice: 4 }
    ]);
  });

  it('should handle equal maxInputTokens (skip non-increasing)', () => {
    const result = sanitizeModelPriceTiers([
      { maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
      { maxInputTokens: 10, inputPrice: 2, outputPrice: 2 },
      { maxInputTokens: 20, inputPrice: 3, outputPrice: 3 }
    ]);
    // 第二个梯度 maxInputTokens:10 <= 上一个 10，被跳过
    expect(result).toEqual([
      { minInputTokens: 0, maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
      { minInputTokens: 10, maxInputTokens: 20, inputPrice: 3, outputPrice: 3 }
    ]);
  });

  it('should handle open-ended tier with only inputPrice', () => {
    const result = sanitizeModelPriceTiers([
      { maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
      // @ts-ignore
      { inputPrice: 2 }
    ]);
    expect(result).toEqual([
      { minInputTokens: 0, maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
      { minInputTokens: 10, inputPrice: 2, outputPrice: 0 }
    ]);
  });

  it('should handle open-ended tier with only outputPrice', () => {
    const result = sanitizeModelPriceTiers([
      { maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
      // @ts-ignore
      { outputPrice: 2 }
    ]);
    expect(result).toEqual([
      { minInputTokens: 0, maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
      { minInputTokens: 10, inputPrice: 0, outputPrice: 2 }
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
      { minInputTokens: 0, maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
      { minInputTokens: 10, maxInputTokens: 20, inputPrice: 2, outputPrice: 2 },
      { minInputTokens: 20, inputPrice: 3, outputPrice: 3 }
    ]);
  });

  it('should return legacy input/output price tier', () => {
    const result = getRuntimeResolvedPriceTiers({
      inputPrice: 1.5,
      outputPrice: 3
    });
    expect(result).toEqual([{ minInputTokens: 0, inputPrice: 1.5, outputPrice: 3 }]);
  });

  it('should return comprehensive price as same input/output price', () => {
    const result = getRuntimeResolvedPriceTiers({
      charsPointsPrice: 2
    });
    expect(result).toEqual([{ minInputTokens: 0, inputPrice: 2, outputPrice: 2 }]);
  });

  it('should prioritize priceTiers over legacy fields', () => {
    const result = getRuntimeResolvedPriceTiers({
      charsPointsPrice: 10,
      inputPrice: 5,
      outputPrice: 6,
      priceTiers: [{ maxInputTokens: 100, inputPrice: 1, outputPrice: 2 }]
    });
    expect(result).toEqual([
      { minInputTokens: 0, maxInputTokens: 100, inputPrice: 1, outputPrice: 2 }
    ]);
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
      { minInputTokens: 0, maxInputTokens: 10, inputPrice: 1, outputPrice: 1 },
      { minInputTokens: 10, maxInputTokens: 30, inputPrice: 2, outputPrice: 2 },
      { minInputTokens: 30, inputPrice: 3, outputPrice: 3 }
    ]);
  });

  it('should return default tier for undefined config', () => {
    // undefined config 会走 charsPointsPrice 逻辑，返回默认梯度
    expect(getRuntimeResolvedPriceTiers(undefined)).toEqual([
      { minInputTokens: 0, inputPrice: 0, outputPrice: 0 }
    ]);
  });

  it('should return default tier for empty object config', () => {
    // 空对象 config 会走 charsPointsPrice 逻辑，返回默认梯度
    expect(getRuntimeResolvedPriceTiers({})).toEqual([
      { minInputTokens: 0, inputPrice: 0, outputPrice: 0 }
    ]);
  });

  it('should handle inputPrice of 0 (not use legacy mode)', () => {
    const result = getRuntimeResolvedPriceTiers({
      inputPrice: 0,
      outputPrice: 5
    });
    // inputPrice 为 0，不满足 hasLegacyIOPrice 条件，走 charsPointsPrice 逻辑
    expect(result).toEqual([{ minInputTokens: 0, inputPrice: 0, outputPrice: 0 }]);
  });

  it('should handle charsPointsPrice of 0', () => {
    const result = getRuntimeResolvedPriceTiers({
      charsPointsPrice: 0
    });
    expect(result).toEqual([{ minInputTokens: 0, inputPrice: 0, outputPrice: 0 }]);
  });

  it('should handle invalid price types', () => {
    const result = getRuntimeResolvedPriceTiers({
      // @ts-ignore
      inputPrice: 'invalid',
      // @ts-ignore
      outputPrice: NaN
    });
    expect(result).toEqual([{ minInputTokens: 0, inputPrice: 0, outputPrice: 0 }]);
  });

  it('should handle empty priceTiers array', () => {
    const result = getRuntimeResolvedPriceTiers({
      priceTiers: []
    });
    expect(result).toEqual([]);
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

    // [0, 30K] → 第一梯度（左闭右闭）
    expect(calculateModelPrice({ config, inputTokens: 20000 }).matchedTier).toMatchObject({
      minInputTokens: 0,
      maxInputTokens: 30,
      inputPrice: 1,
      outputPrice: 2
    });
    expect(calculateModelPrice({ config, inputTokens: 30000 }).matchedTier).toMatchObject({
      minInputTokens: 0,
      maxInputTokens: 30,
      inputPrice: 1,
      outputPrice: 2
    });
    // (30K, 60K] → 第二梯度（左开右闭）
    expect(calculateModelPrice({ config, inputTokens: 30001 }).matchedTier).toMatchObject({
      minInputTokens: 30,
      maxInputTokens: 60,
      inputPrice: 3,
      outputPrice: 4
    });
    expect(calculateModelPrice({ config, inputTokens: 60000 }).matchedTier).toMatchObject({
      minInputTokens: 30,
      maxInputTokens: 60,
      inputPrice: 3,
      outputPrice: 4
    });
    // (60K, ∞) → 第三梯度（左开右开）
    expect(calculateModelPrice({ config, inputTokens: 60001 }).matchedTier).toMatchObject({
      minInputTokens: 60,
      inputPrice: 5,
      outputPrice: 6
    });
    expect(calculateModelPrice({ config, inputTokens: 90000 }).matchedTier).toMatchObject({
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
      inputTokens: 50000,
      outputTokens: 100000
    });
    // 50K tokens 匹配第二梯度 (30K, 60K]: 50 * 3 + 100 * 4 = 150 + 400 = 550
    expect(totalPoints).toBeCloseTo(550);
  });

  it('should match exact tier boundaries correctly', () => {
    const config = {
      priceTiers: [
        { maxInputTokens: 30, inputPrice: 1, outputPrice: 2 },
        { maxInputTokens: 60, inputPrice: 3, outputPrice: 4 },
        { inputPrice: 5, outputPrice: 6 }
      ]
    };

    // 29.999K → [0, 30K]
    expect(calculateModelPrice({ config, inputTokens: 29999 }).matchedTier).toMatchObject({
      minInputTokens: 0,
      maxInputTokens: 30,
      inputPrice: 1,
      outputPrice: 2
    });
    // 30K → [0, 30K] (右闭)
    expect(calculateModelPrice({ config, inputTokens: 30000 }).matchedTier).toMatchObject({
      minInputTokens: 0,
      maxInputTokens: 30,
      inputPrice: 1,
      outputPrice: 2
    });
    // 30.001K → (30K, 60K]
    expect(calculateModelPrice({ config, inputTokens: 30001 }).matchedTier).toMatchObject({
      minInputTokens: 30,
      maxInputTokens: 60,
      inputPrice: 3,
      outputPrice: 4
    });
    // 60K → (30K, 60K] (右闭)
    expect(calculateModelPrice({ config, inputTokens: 60000 }).matchedTier).toMatchObject({
      minInputTokens: 30,
      maxInputTokens: 60,
      inputPrice: 3,
      outputPrice: 4
    });
    // 60.001K → (60K, ∞)
    expect(calculateModelPrice({ config, inputTokens: 60001 }).matchedTier).toMatchObject({
      minInputTokens: 60,
      inputPrice: 5,
      outputPrice: 6
    });
    expect(calculateModelPrice({ config, inputTokens: 10000000 }).matchedTier).toMatchObject({
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
      maxInputTokens: 30,
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

  it('should handle custom multiple parameter', () => {
    const { totalPoints } = calculateModelPrice({
      config: {
        priceTiers: [{ maxInputTokens: 10, inputPrice: 2, outputPrice: 3 }]
      },
      inputTokens: 5000,
      outputTokens: 2000,
      multiple: 100
    });
    // 5000/100 = 50, 2000/100 = 20
    // 50 * 2 + 20 * 3 = 100 + 60 = 160
    expect(totalPoints).toBe(160);
  });

  it('should handle zero tokens', () => {
    const { totalPoints, matchedTier } = calculateModelPrice({
      config: {
        priceTiers: [{ maxInputTokens: 100, inputPrice: 1, outputPrice: 2 }]
      },
      inputTokens: 0,
      outputTokens: 0
    });
    expect(totalPoints).toBe(0);
    expect(matchedTier).toBeDefined();
  });

  it('should handle undefined config', () => {
    const { totalPoints, matchedTier, tiers } = calculateModelPrice({
      config: undefined,
      inputTokens: 1000,
      outputTokens: 500
    });
    // undefined config 会返回默认梯度
    expect(totalPoints).toBe(0);
    expect(matchedTier).toEqual({ minInputTokens: 0, inputPrice: 0, outputPrice: 0 });
    expect(tiers).toEqual([{ minInputTokens: 0, inputPrice: 0, outputPrice: 0 }]);
  });

  it('should handle empty config', () => {
    const { totalPoints, matchedTier, tiers } = calculateModelPrice({
      config: {},
      inputTokens: 1000,
      outputTokens: 500
    });
    expect(totalPoints).toBe(0);
    expect(matchedTier).toBeDefined();
    expect(tiers.length).toBeGreaterThan(0);
  });

  it('should handle negative tokens gracefully', () => {
    const { totalPoints } = calculateModelPrice({
      config: {
        priceTiers: [{ maxInputTokens: 100, inputPrice: 1, outputPrice: 2 }]
      },
      inputTokens: -1000,
      outputTokens: -500
    });
    // 负数 tokens 会导致负价格
    expect(totalPoints).toBeLessThan(0);
  });

  it('should handle very large token numbers', () => {
    const { totalPoints, matchedTier } = calculateModelPrice({
      config: {
        priceTiers: [
          { maxInputTokens: 100, inputPrice: 1, outputPrice: 2 },
          { inputPrice: 0.5, outputPrice: 1 }
        ]
      },
      inputTokens: 10000000,
      outputTokens: 5000000
    });
    // 10M tokens 匹配第二梯度
    expect(matchedTier?.minInputTokens).toBe(100);
    expect(totalPoints).toBeGreaterThan(0);
  });
});
