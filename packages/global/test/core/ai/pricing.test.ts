import { describe, expect, it } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  AIModelDocumentDataSchema,
  ModelPricingSchema,
  type AIModelDocumentDataType
} from '@fastgpt/global/core/ai/model/schema';
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

describe('new model pricing', () => {
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
  it('normalizes form rows without persisting lower bounds or incomplete trailing rows', () => {
    expect(sanitizeModelPriceTiers()).toEqual([]);
    expect(sanitizeModelPriceTiers([])).toEqual([]);
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
    for (const [inputTokens, inputPrice] of [
      [0, 1000],
      [4099, 1000],
      [4100, 1000],
      [4101, 3000],
      [10001, 3000]
    ]) {
      const result = calculateModelPrice({ config, inputTokens, outputTokens: 1 });
      expect(result.matchedTier?.inputPrice).toBe(inputPrice);
      expect(result.totalPoints).toBe(
        (inputTokens * inputPrice + (result.matchedTier?.outputPrice ?? 0)) / 1000000
      );
    }
    expect(getRuntimeResolvedPriceTiers(config)).toEqual(
      ModelPricingSchema.parse(config.pricing).tiers
    );
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
    expect(AIModelDocumentDataSchema.parse(legacy)).toEqual(model);
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
    expect(getRuntimeResolvedPriceTiers()).toEqual([]);
  });
  it('preserves missing, empty and explicit zero pricing; rounds only saved unit rates', () => {
    expect(normalizeModelPricingForRead(model)).toEqual(model);
    expect(normalizeModelPricingForSave(model).pricing).toEqual({});
    for (const pricing of [{}, { tiers: [] }, { tiers: [{ inputPrice: 0, outputPrice: 0 }] }]) {
      expect(normalizeModelPricingForSave({ ...model, pricing })).toEqual({ ...model, pricing });
      expect(
        calculateModelPrice({ config: { ...model, pricing }, inputTokens: 1000000 }).totalPoints
      ).toBe(0);
    }
    const tiered = {
      ...model,
      pricing: { tiers: [{ maxInputTokens: 0.0041, inputPrice: 1.005, outputPrice: 2.675 }] }
    };
    expect(normalizeModelPricingForRead(tiered)).toEqual(normalizeModelPricingForSave(tiered));
    expect(normalizeModelPricingForSave(tiered).pricing).toEqual({
      tiers: [{ maxInputTokens: 0.0041, inputPrice: 1.01, outputPrice: 2.68 }]
    });
    const stt = {
      ...model,
      type: ModelTypeEnum.stt as const,
      config: {},
      pricing: { unitPrice: 0.125 }
    };
    expect(normalizeModelPricingForRead(stt).pricing).toEqual({ unitPrice: 0.13 });
    expect(calculateModelPrice({ config: stt, inputTokens: 60 }).totalPoints).toBe(0.125);
    expect(normalizeModelPricingForSave(stt).pricing).toEqual({ unitPrice: 0.13 });
    expect(normalizeModelPricingForSave({ ...stt, pricing: undefined }).pricing).toEqual({});
    expect(
      calculateModelPrice({ config: { ...stt, pricing: undefined }, inputTokens: 60 }).totalPoints
    ).toBe(0);
  });
  it.each([
    { unitPrice: -1 },
    { unitPrice: NaN },
    { unitPrice: Infinity },
    { tiers: [{ minInputTokens: 0, inputPrice: 1, outputPrice: 2 }] }
  ])('rejects malformed new pricing: %j', (pricing) =>
    expect(ModelPricingSchema.safeParse(pricing).success).toBe(false)
  );
});
