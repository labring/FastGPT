import { describe, expect, it } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { LLMModelPricingSchema } from '@fastgpt/global/core/ai/model/schema';
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
const model = {
  type: ModelTypeEnum.llm,
  scope: ModelScopeEnum.system,
  provider: 'test',
  model: 'test',
  name: 'Test',
  config: { maxContext: 100, maxResponse: 50, quoteMaxToken: 50 }
} satisfies AIModelDocumentDataType;

describe('roundModelPrice', () => {
  it.each([
    [undefined, 0],
    [0, 0],
    [2, 2],
    [0.125, 0.13],
    [1.234, 1.23],
    [9.999, 10],
    [1.005, 1.01],
    [2.675, 2.68],
    [Number.MAX_VALUE, Number.MAX_VALUE]
  ])('rounds %s to %s without changing per-call fees', (value, expected) =>
    expect(roundModelPrice(value)).toBe(expected)
  );
});

describe('sanitizeModelPriceTiers', () => {
  it('keeps increasing finite bounds, ends at an open or blank row and caps the tier count', () => {
    expect(sanitizeModelPriceTiers()).toEqual([]);
    expect(
      sanitizeModelPriceTiers([
        { maxInputTokens: -1, inputPrice: NaN, outputPrice: Infinity },
        { maxInputTokens: 0.0041, inputPrice: 1, outputPrice: 2 },
        { maxInputTokens: 0.0041, inputPrice: 5, outputPrice: 5 },
        { inputPrice: undefined, outputPrice: undefined } as never
      ])
    ).toEqual([
      { maxInputTokens: 0, inputPrice: 0, outputPrice: 0 },
      { maxInputTokens: 0.0041, inputPrice: 1, outputPrice: 2 }
    ]);
    expect(
      sanitizeModelPriceTiers([
        { inputPrice: 0, outputPrice: 2 },
        { maxInputTokens: 4, inputPrice: 8, outputPrice: 8 }
      ])
    ).toEqual([{ inputPrice: 0, outputPrice: 2 }]);
    expect(
      sanitizeModelPriceTiers(
        Array.from({ length: 6 }, (_, i) => ({
          maxInputTokens: i + 1,
          inputPrice: 1,
          outputPrice: 2
        }))
      )
    ).toHaveLength(MAX_MODEL_PRICE_TIERS);
    expect(
      sanitizeModelPriceTiers([
        { maxInputTokens: 1, inputPrice: undefined, outputPrice: 2 } as never
      ])
    ).toEqual([{ maxInputTokens: 1, inputPrice: 0, outputPrice: 2 }]);
  });
});

describe('getRuntimeResolvedPriceTiers', () => {
  it('reads only new pricing and supports missing configuration', () => {
    const tiers = [{ inputPrice: 1, outputPrice: 2 }];
    expect(getRuntimeResolvedPriceTiers({ pricing: { tiers } })).toEqual(tiers);
    expect(getRuntimeResolvedPriceTiers()).toEqual([]);
  });
});

describe('calculateModelPrice', () => {
  it.each([
    { cache: {}, expected: 28 },
    { cache: { cacheReadPrice: 0.2, cacheCreationPrice: 2.5 }, expected: 17.7 },
    { cache: { cacheReadPrice: 0 }, expected: 16 },
    { cache: { cacheCreationPrice: 0 }, expected: 26 },
    { cache: { cacheReadPrice: 0, cacheCreationPrice: 0 }, expected: 14 }
  ])('splits total input into ordinary and cached tokens: $cache', ({ cache, expected }) => {
    const config = {
      ...model,
      pricing: { tiers: [{ inputPrice: 2, outputPrice: 4, ...cache }] }
    };
    expect(
      calculateModelPrice({
        config,
        inputTokens: 10000000,
        outputTokens: 2000000,
        cacheReadTokens: 6000000,
        cacheCreationTokens: 1000000
      }).totalPoints
    ).toBeCloseTo(expected);
  });

  it.each([
    { read: 200, write: 200, expected: 0.00002 },
    { read: -5, write: -5, expected: 0.0002 },
    { read: NaN, write: Infinity, expected: 0.0002 },
    { read: 60, write: 100, expected: 0.000112 }
  ])('bounds cache counts by total input: $read / $write', ({ read, write, expected }) => {
    const config = {
      ...model,
      pricing: {
        tiers: [{ inputPrice: 2, outputPrice: 4, cacheReadPrice: 0.2, cacheCreationPrice: 2.5 }]
      }
    };
    expect(
      calculateModelPrice({
        config,
        inputTokens: 100,
        cacheReadTokens: read,
        cacheCreationTokens: write
      }).totalPoints
    ).toBeCloseTo(expected, 10);
  });

  it('selects a tier by total input, including caches, and keeps team models free', () => {
    const config = {
      ...model,
      pricing: {
        tiers: [
          { maxInputTokens: 0.005, inputPrice: 1000, outputPrice: 1000, cacheReadPrice: 0 },
          { inputPrice: 2000, outputPrice: 4000, cacheReadPrice: 200, cacheCreationPrice: 2500 }
        ]
      }
    };
    const usage = {
      inputTokens: 10000,
      outputTokens: 2000,
      cacheReadTokens: 6000,
      cacheCreationTokens: 1000
    };
    expect(calculateModelPrice({ config, ...usage }).totalPoints).toBeCloseTo(17.7);
    expect(
      calculateModelPrice({ config: { ...config, scope: ModelScopeEnum.team }, ...usage })
        .totalPoints
    ).toBe(0);
    expect(calculateModelPrice({ config, inputTokens: NaN, outputTokens: -1 }).totalPoints).toBe(0);
  });
  it('uses right-closed input tiers, deriving lower bounds and falling back to the last finite tier', () => {
    const config = {
      ...model,
      pricing: {
        tiers: [
          { maxInputTokens: 0.0041, inputPrice: 1000, outputPrice: 2000 },
          { maxInputTokens: 0.01, inputPrice: 3000, outputPrice: 4000 }
        ]
      }
    };
    for (const [inputTokens, totalPoints, tierIndex] of [
      [0, 0.002, 0],
      [4099, 4.101, 0],
      [4100, 4.102, 0],
      [4101, 12.307, 1],
      [10001, 30.007, 1]
    ]) {
      const result = calculateModelPrice({ config, inputTokens, outputTokens: 1 });
      expect(result.matchedTier).toEqual(config.pricing.tiers[tierIndex]);
      expect(result.totalPoints).toBe(totalPoints);
    }
    expect(
      calculateModelPrice({
        config: {
          ...model,
          pricing: {
            tiers: [
              { maxInputTokens: 0, inputPrice: 1, outputPrice: 1 },
              { inputPrice: 2, outputPrice: 3 }
            ]
          }
        },
        inputTokens: 1
      }).totalPoints
    ).toBe(0.000002);
  });
  it.each([ModelTypeEnum.embedding, ModelTypeEnum.rerank, ModelTypeEnum.tts, ModelTypeEnum.stt])(
    'fixes %s denominator by type and preserves per-call precision',
    (type) => {
      const inputTokens = type === ModelTypeEnum.stt ? 60 : 1000000;
      const config = { type, scope: ModelScopeEnum.system, pricing: { unitPrice: 2 } };
      expect(calculateModelPrice({ config, inputTokens }).totalPoints).toBe(2);
      expect(calculateModelPrice({ config, inputTokens: 1 }).totalPoints).toBe(2 / inputTokens);
      expect(
        calculateModelPrice({ config: { ...config, scope: ModelScopeEnum.team }, inputTokens })
          .totalPoints
      ).toBe(0);
    }
  );
  it('ignores deprecated root prices and charges neither team nor unmigrated models', () => {
    const legacy = {
      ...model,
      inputPrice: 50,
      outputPrice: 100,
      charsPointsPrice: 100,
      priceTiers: [{ inputPrice: 10, outputPrice: 20 }]
    };
    expect(calculateModelPrice({ config: legacy, inputTokens: 1000000 }).totalPoints).toBe(0);
    expect(
      calculateModelPrice({
        config: {
          ...model,
          scope: ModelScopeEnum.team,
          pricing: { tiers: [{ inputPrice: 50, outputPrice: 100 }] }
        },
        inputTokens: 1000000
      }).totalPoints
    ).toBe(0);
    expect(calculateModelPrice({})).toMatchObject({ totalPoints: 0, tiers: [] });
    expect(calculateModelPrice({ config: {}, inputTokens: 1 }).totalPoints).toBe(0);
    expect(
      calculateModelPrice({
        config: { type: ModelTypeEnum.stt, scope: ModelScopeEnum.system },
        inputTokens: 60
      }).totalPoints
    ).toBe(0);
  });
});

const tieredModel = {
  ...model,
  pricing: { tiers: [{ maxInputTokens: 0.0041, inputPrice: 1.005, outputPrice: 2.675 }] }
};
const roundedTiers = [{ maxInputTokens: 0.0041, inputPrice: 1.01, outputPrice: 2.68 }];
const sttModel = {
  ...model,
  type: ModelTypeEnum.stt as const,
  config: {},
  pricing: { unitPrice: 0.125 }
};

describe('normalizeModelPricingForRead', () => {
  it('rounds editing values without changing missing pricing, source rates or precise bounds', () => {
    expect(normalizeModelPricingForRead(model)).toBe(model);
    expect(normalizeModelPricingForRead(tieredModel).pricing).toEqual({ tiers: roundedTiers });
    expect(normalizeModelPricingForRead(sttModel).pricing).toEqual({ unitPrice: 0.13 });
    expect(tieredModel.pricing.tiers[0].inputPrice).toBe(1.005);
    expect(sttModel.pricing.unitPrice).toBe(0.125);
    expect(calculateModelPrice({ config: sttModel, inputTokens: 60 }).totalPoints).toBe(0.125);
  });
});

describe('normalizeModelPricingForSave', () => {
  it('rounds optional cache rates without turning omissions into free prices', () => {
    const pricing = normalizeModelPricingForSave({
      ...model,
      pricing: {
        tiers: [{ inputPrice: 2, outputPrice: 4, cacheReadPrice: 0, cacheCreationPrice: 1.005 }]
      }
    }).pricing;
    expect(LLMModelPricingSchema.parse(pricing).tiers?.[0]).toEqual({
      inputPrice: 2,
      outputPrice: 4,
      cacheReadPrice: 0,
      cacheCreationPrice: 1.01
    });
    expect(
      LLMModelPricingSchema.parse(normalizeModelPricingForSave(tieredModel).pricing).tiers?.[0]
    ).not.toHaveProperty('cacheReadPrice');
    expect(
      sanitizeModelPriceTiers([
        { inputPrice: 2, outputPrice: 4, cacheReadPrice: NaN, cacheCreationPrice: -1 }
      ])
    ).toEqual([{ inputPrice: 2, outputPrice: 4 }]);
  });
  it('marks missing prices as configured and preserves empty or explicit free prices', () => {
    expect(normalizeModelPricingForSave(model).pricing).toEqual({});
    for (const pricing of [{}, { tiers: [] }, { tiers: [{ inputPrice: 0, outputPrice: 0 }] }]) {
      expect(normalizeModelPricingForSave({ ...model, pricing })).toEqual({ ...model, pricing });
    }
    expect(normalizeModelPricingForSave({ ...sttModel, pricing: undefined }).pricing).toEqual({});
    expect(
      normalizeModelPricingForSave({ ...sttModel, pricing: { unitPrice: 0 } }).pricing
    ).toEqual({
      unitPrice: 0
    });
    expect(normalizeModelPricingForSave(tieredModel).pricing).toEqual({ tiers: roundedTiers });
    expect(normalizeModelPricingForSave(sttModel).pricing).toEqual({ unitPrice: 0.13 });
  });
});
