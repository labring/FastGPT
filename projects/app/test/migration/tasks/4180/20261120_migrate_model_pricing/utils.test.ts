import { describe, expect, it } from 'vitest';
import {
  convertTierMaxInputTokensToK,
  MigratedTierListSchema,
  MigratedTierPricingSchema
} from '@/migration/tasks/4180/20261120_migrate_model_pricing/utils';

describe('20261120_migrate_model_pricing utils', () => {
  it('scales unmarked tiers below 1 from M to K, backfills tierUnit K for >= 1 or open tiers, and skips explicit K', () => {
    expect(
      convertTierMaxInputTokensToK({
        tiers: [
          { maxInputTokens: 0.272, inputPrice: 1680, outputPrice: 8400 },
          { inputPrice: 3360, outputPrice: 12600 }
        ]
      })
    ).toEqual({
      changed: true,
      tierUnit: 'K',
      tiers: [
        { maxInputTokens: 272, inputPrice: 1680, outputPrice: 8400 },
        { inputPrice: 3360, outputPrice: 12600 }
      ]
    });

    expect(
      convertTierMaxInputTokensToK({
        tiers: [
          { maxInputTokens: 0.272, inputPrice: 10, outputPrice: 20 },
          { maxInputTokens: 1, inputPrice: 30, outputPrice: 40 }
        ]
      })
    ).toEqual({
      changed: true,
      tierUnit: 'K',
      tiers: [
        { maxInputTokens: 272, inputPrice: 10, outputPrice: 20 },
        { maxInputTokens: 1000, inputPrice: 30, outputPrice: 40 }
      ]
    });

    expect(
      convertTierMaxInputTokensToK({
        tiers: [{ maxInputTokens: 0, inputPrice: 1, outputPrice: 2 }]
      })
    ).toEqual({
      changed: true,
      tierUnit: 'K',
      tiers: [{ maxInputTokens: 1, inputPrice: 1, outputPrice: 2 }]
    });

    // 无单位且全部有限上限 >= 1 时仅回填 tierUnit: 'K'，不放大数值。
    expect(
      convertTierMaxInputTokensToK({
        tiers: [{ maxInputTokens: 1, inputPrice: 1, outputPrice: 2 }]
      })
    ).toEqual({
      changed: true,
      tierUnit: 'K',
      tiers: [{ maxInputTokens: 1, inputPrice: 1, outputPrice: 2 }]
    });

    // 已显式标记为 K 时严格跳过缩放。
    expect(
      convertTierMaxInputTokensToK({
        tierUnit: 'K',
        tiers: [{ maxInputTokens: 5, inputPrice: 1, outputPrice: 2 }]
      })
    ).toEqual({
      changed: false,
      tierUnit: 'K',
      tiers: [{ maxInputTokens: 5, inputPrice: 1, outputPrice: 2 }]
    });

    // 无单位且上限均 >= 1 时保留原数值，仅补写 tierUnit: 'K'。
    expect(
      convertTierMaxInputTokensToK({
        tiers: [
          { maxInputTokens: 8, inputPrice: 1, outputPrice: 2 },
          { maxInputTokens: 32, inputPrice: 3, outputPrice: 4 },
          { inputPrice: 5, outputPrice: 6 }
        ]
      })
    ).toEqual({
      changed: true,
      tierUnit: 'K',
      tiers: [
        { maxInputTokens: 8, inputPrice: 1, outputPrice: 2 },
        { maxInputTokens: 32, inputPrice: 3, outputPrice: 4 },
        { inputPrice: 5, outputPrice: 6 }
      ]
    });

    expect(convertTierMaxInputTokensToK({ tiers: [{ inputPrice: 10, outputPrice: 20 }] })).toEqual({
      changed: true,
      tierUnit: 'K',
      tiers: [{ inputPrice: 10, outputPrice: 20 }]
    });
    expect(convertTierMaxInputTokensToK({ tiers: [] })).toEqual({ changed: false, tiers: [] });
    expect(() =>
      convertTierMaxInputTokensToK({
        tiers: [{ maxInputTokens: -1, inputPrice: 1, outputPrice: 2 }]
      })
    ).toThrow();
    expect(() =>
      convertTierMaxInputTokensToK({
        tierUnit: 'M',
        tiers: [{ maxInputTokens: 5, inputPrice: 1, outputPrice: 2 }]
      })
    ).toThrow();
    expect(() =>
      MigratedTierListSchema.parse([{ maxInputTokens: 0, inputPrice: 1, outputPrice: 2 }])
    ).toThrow();
    expect(() =>
      MigratedTierListSchema.parse([{ maxInputTokens: 4.1, inputPrice: 1, outputPrice: 2 }])
    ).toThrow();
    expect(() =>
      MigratedTierListSchema.parse([{ maxInputTokens: 12.5, inputPrice: 1, outputPrice: 2 }])
    ).toThrow();
    expect(() =>
      MigratedTierPricingSchema.parse({
        tiers: [{ maxInputTokens: 5, inputPrice: 1, outputPrice: 2 }]
      })
    ).toThrow();
    expect(() =>
      MigratedTierPricingSchema.parse({
        tierUnit: 'K',
        tiers: [{ maxInputTokens: 5, inputPrice: 1, outputPrice: 2 }]
      })
    ).not.toThrow();
  });
});
