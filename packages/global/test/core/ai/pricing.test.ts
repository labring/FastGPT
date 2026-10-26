import { describe, expect, it } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import {
  calculateModelPrice,
  roundModelPrice,
  getRuntimeResolvedPriceTiers,
  MAX_MODEL_PRICE_TIERS,
  normalizeModelPricingForRead,
  normalizeModelPricingForSave,
  sanitizeModelPriceTiers
} from '@fastgpt/global/core/ai/model/pricing';

const modelData = {
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'test-model',
  name: 'Test Model',
  scope: ModelScopeEnum.system,
  isActive: false,
  config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
} satisfies AIModelDocumentDataType;

describe('roundModelPrice', () => {
  it.each([
    [0, 0],
    [2, 2],
    [0.125, 0.13],
    [1.234, 1.23],
    [9.999, 10],
    [1.005, 1.01],
    [2.675, 2.68],
    [Number.MAX_VALUE, Number.MAX_VALUE]
  ])('rounds %s to at most two decimals: %s', (value, expected) => {
    expect(roundModelPrice(value)).toBe(expected);
  });
});

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

  it('should cap the number of price tiers', () => {
    const result = sanitizeModelPriceTiers(
      Array.from({ length: MAX_MODEL_PRICE_TIERS + 1 }, (_, index) => ({
        maxInputTokens: (index + 1) * 10,
        inputPrice: index + 1,
        outputPrice: index + 1
      }))
    );

    expect(result).toHaveLength(MAX_MODEL_PRICE_TIERS);
    expect(result.at(-1)?.maxInputTokens).toBe(MAX_MODEL_PRICE_TIERS * 10);
  });

  it('should always push first tier with minInputTokens: 0 and prices', () => {
    const result = sanitizeModelPriceTiers([{ maxInputTokens: 30, inputPrice: 1, outputPrice: 2 }]);
    expect(result).toEqual([
      { minInputTokens: 0, maxInputTokens: 30, inputPrice: 1, outputPrice: 2 }
    ]);
  });

  it('should normalize a single tier without prices', () => {
    // @ts-ignore
    const result = sanitizeModelPriceTiers([{ maxInputTokens: 10 }]);
    expect(result).toEqual([
      { minInputTokens: 0, maxInputTokens: 10, inputPrice: 0, outputPrice: 0 }
    ]);
  });

  it('should normalize a single tier when both prices are zero', () => {
    const result = sanitizeModelPriceTiers([{ maxInputTokens: 10, inputPrice: 0, outputPrice: 0 }]);
    expect(result).toEqual([
      { minInputTokens: 0, maxInputTokens: 10, inputPrice: 0, outputPrice: 0 }
    ]);
  });

  it('should preserve a single tier when either price is non-zero', () => {
    const result = sanitizeModelPriceTiers([{ inputPrice: 0, outputPrice: 2 }]);
    expect(result).toEqual([
      { minInputTokens: 0, maxInputTokens: undefined, inputPrice: 0, outputPrice: 2 }
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
  it('should return no tier for a single configured tier with zero prices', () => {
    const result = getRuntimeResolvedPriceTiers({
      priceTiers: [{ maxInputTokens: 10, inputPrice: 0, outputPrice: 0 }]
    });
    expect(result).toEqual([]);
  });

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

  it('should progressively fall back from empty tiers and zero legacy IO to comprehensive price', () => {
    const result = getRuntimeResolvedPriceTiers({
      priceTiers: [{ inputPrice: 0, outputPrice: 0 }],
      inputPrice: 0,
      outputPrice: 0,
      charsPointsPrice: 2
    });

    expect(result).toEqual([{ minInputTokens: 0, inputPrice: 2, outputPrice: 2 }]);
  });

  it('should progressively fall back when the configured tiers array is empty', () => {
    const result = getRuntimeResolvedPriceTiers({
      priceTiers: [],
      inputPrice: 1,
      outputPrice: 3,
      charsPointsPrice: 9
    });

    expect(result).toEqual([{ minInputTokens: 0, inputPrice: 1, outputPrice: 3 }]);
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

  it('should return no tier for undefined config', () => {
    expect(getRuntimeResolvedPriceTiers(undefined)).toEqual([]);
  });

  it('should return no tier for empty object config', () => {
    expect(getRuntimeResolvedPriceTiers({})).toEqual([]);
  });

  it('should preserve legacy pricing when only outputPrice is non-zero', () => {
    const result = getRuntimeResolvedPriceTiers({
      inputPrice: 0,
      outputPrice: 5
    });
    expect(result).toEqual([{ minInputTokens: 0, inputPrice: 0, outputPrice: 5 }]);
  });

  it('should drop charsPointsPrice of 0', () => {
    const result = getRuntimeResolvedPriceTiers({
      charsPointsPrice: 0
    });
    expect(result).toEqual([]);
  });

  it('should handle invalid price types', () => {
    const result = getRuntimeResolvedPriceTiers({
      // @ts-ignore
      inputPrice: 'invalid',
      // @ts-ignore
      outputPrice: NaN
    });
    expect(result).toEqual([]);
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
      inputTokens: 1000000,
      outputTokens: 500000
    });
    expect(totalPoints).toBe(3);
    expect(matchedTier?.inputPrice).toBe(2);
    expect(matchedTier?.outputPrice).toBe(2);
  });

  it('should keep legacy input/output pricing behavior', () => {
    const { totalPoints, matchedTier } = calculateModelPrice({
      config: { charsPointsPrice: 10, inputPrice: 1.5, outputPrice: 3 },
      inputTokens: 1000000,
      outputTokens: 500000
    });
    expect(totalPoints).toBe(3);
    expect(matchedTier?.inputPrice).toBe(1.5);
    expect(matchedTier?.outputPrice).toBe(3);
  });

  it('charges the matched tier and falls back to the last finite tier above its limit', () => {
    const config = {
      priceTiers: [
        { maxInputTokens: 30, inputPrice: 1, outputPrice: 2 },
        { maxInputTokens: 60, inputPrice: 3, outputPrice: 4 }
      ]
    };
    for (const [inputTokens, totalPoints] of [
      [50000000, 550],
      [100000000, 700]
    ]) {
      expect(
        calculateModelPrice({ config, inputTokens, outputTokens: 100000000 }).totalPoints
      ).toBe(totalPoints);
    }
  });

  it('selects right-closed tiers, zero input and the open final range', () => {
    const config = {
      priceTiers: [
        { maxInputTokens: 30, inputPrice: 1, outputPrice: 2 },
        { maxInputTokens: 60, inputPrice: 3, outputPrice: 4 },
        { inputPrice: 5, outputPrice: 6 }
      ]
    };
    for (const [inputTokens, inputPrice] of [
      [0, 1],
      [29999999, 1],
      [30000000, 1],
      [30000001, 3],
      [60000000, 3],
      [60000001, 5],
      [10000000000, 5]
    ]) {
      const result = calculateModelPrice({ config, inputTokens });
      expect(result.matchedTier?.inputPrice).toBe(inputPrice);
      expect(result.totalPoints).toBe((inputTokens * inputPrice) / 1000000);
    }
  });

  it('should not treat a zero maxInputTokens tier as open-ended', () => {
    // sanitizeModelPriceTiers clamps a negative maxInputTokens to 0, so a zero
    // maxInputTokens tier is reachable. It must only match input <= 0 and must
    // not be mistaken for the open-ended (no-upper-bound) tier.
    const config = {
      priceTiers: [
        { maxInputTokens: 0, inputPrice: 1, outputPrice: 1 },
        { maxInputTokens: 100, inputPrice: 2, outputPrice: 2 }
      ]
    };
    // 50M input tokens must land in the second tier, not the zero-max first tier.
    expect(calculateModelPrice({ config, inputTokens: 50000000 }).matchedTier).toMatchObject({
      maxInputTokens: 100,
      inputPrice: 2,
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
      inputTokens: 1000000,
      outputTokens: 1000000
    });
    expect(matchedTier?.inputPrice).toBe(1);
    expect(matchedTier?.outputPrice).toBe(2);
    expect(totalPoints).toBe(3);
  });

  it('supports STT duration prices per sixty seconds', () => {
    expect(
      calculateModelPrice({
        config: { type: ModelTypeEnum.stt, charsPointsPrice: 2 },
        inputTokens: 60,
        multiple: 60
      }).totalPoints
    ).toBe(2);
  });

  it('should handle undefined config', () => {
    const { totalPoints, matchedTier, tiers } = calculateModelPrice({
      config: undefined,
      inputTokens: 1000000,
      outputTokens: 500000
    });
    expect(totalPoints).toBe(0);
    expect(matchedTier).toBeUndefined();
    expect(tiers).toEqual([]);
  });

  it('should handle empty config', () => {
    const { totalPoints, matchedTier, tiers } = calculateModelPrice({
      config: {},
      inputTokens: 1000000,
      outputTokens: 500000
    });
    expect(totalPoints).toBe(0);
    expect(matchedTier).toBeUndefined();
    expect(tiers).toEqual([]);
  });

  it('should handle negative tokens gracefully', () => {
    const { totalPoints } = calculateModelPrice({
      config: {
        priceTiers: [{ maxInputTokens: 100, inputPrice: 1, outputPrice: 2 }]
      },
      inputTokens: -1000000,
      outputTokens: -500000
    });
    // 保持既有计费入参语义，本次只调整价格单位。
    expect(totalPoints).toBeLessThan(0);
  });
});

describe('normalizeModelPricingForRead', () => {
  it.each([
    { inputPrice: 1, outputPrice: 3 },
    { inputPrice: 0, outputPrice: 3 },
    { charsPointsPrice: 2 }
  ])('normalizes LLM fields without rescaling million-unit prices: %j', (pricing) => {
    const original = { ...modelData, ...pricing };
    const result = normalizeModelPricingForRead(original);
    expect(result.priceTiers).toEqual([
      {
        minInputTokens: 0,
        inputPrice: 'charsPointsPrice' in pricing ? pricing.charsPointsPrice : pricing.inputPrice,
        outputPrice: 'charsPointsPrice' in pricing ? pricing.charsPointsPrice : pricing.outputPrice
      }
    ]);
    for (const key of ['inputPrice', 'outputPrice', 'charsPointsPrice']) {
      expect(result).not.toHaveProperty(key);
    }
  });

  it('keeps current tiers ahead of legacy fields', () => {
    const priceTiers = [{ minInputTokens: 0, inputPrice: 2, outputPrice: 4 }];
    expect(
      normalizeModelPricingForRead({ ...modelData, priceTiers, inputPrice: 10, outputPrice: 20 })
        .priceTiers
    ).toEqual([{ minInputTokens: 0, inputPrice: 2, outputPrice: 4 }]);
  });
});

describe('normalizeModelPricingForSave', () => {
  it('persists a free edit without falling back to the legacy prices', () => {
    const form = normalizeModelPricingForRead({ ...modelData, inputPrice: 1, outputPrice: 3 });
    form.priceTiers = [{ minInputTokens: 0, inputPrice: 0, outputPrice: 0 }];
    const saved = normalizeModelPricingForSave(form);
    expect(saved.priceTiers).toEqual([]);
    expect(saved).not.toHaveProperty('inputPrice');
    expect(saved).not.toHaveProperty('outputPrice');
  });

  it('ignores stale legacy fields even if caller still includes them in save input', () => {
    const result = normalizeModelPricingForSave({
      ...modelData,
      charsPointsPrice: 9,
      inputPrice: 1,
      outputPrice: 3,
      priceTiers: []
    });
    expect(result).toEqual({ ...modelData, priceTiers: [] });
  });

  it('rounds TTS prices in million-character units', () => {
    const model = {
      ...modelData,
      type: ModelTypeEnum.tts as const,
      charsPointsPrice: 125.125,
      config: { voices: [] }
    };
    const form = normalizeModelPricingForRead(model);
    expect(form).toMatchObject({ charsPointsPrice: 125.13 });
    expect(normalizeModelPricingForRead(form)).toEqual(form);
    expect(normalizeModelPricingForSave(form)).toEqual({ ...form });
  });
});
