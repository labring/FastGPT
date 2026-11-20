import { describe, expect, it } from 'vitest';
import {
  convertTierMaxInputTokensToK,
  MigratedTierListSchema
} from '@/migration/tasks/4180/20261120_migrate_model_pricing/utils';

describe('20261120_migrate_model_pricing utils', () => {
  it('converts bounded tiers to rounded positive integer K Tokens while preserving open-ended tiers and >10 skips', () => {
    expect(
      convertTierMaxInputTokensToK([
        { maxInputTokens: 0.272, inputPrice: 1680, outputPrice: 8400 },
        { inputPrice: 3360, outputPrice: 12600 }
      ])
    ).toEqual({
      changed: true,
      tiers: [
        { maxInputTokens: 272, inputPrice: 1680, outputPrice: 8400 },
        { inputPrice: 3360, outputPrice: 12600 }
      ]
    });

    expect(
      convertTierMaxInputTokensToK([
        { maxInputTokens: 0.29, inputPrice: 10, outputPrice: 20 },
        { maxInputTokens: 0.0041, inputPrice: 30, outputPrice: 40 }
      ])
    ).toEqual({
      changed: true,
      tiers: [
        { maxInputTokens: 290, inputPrice: 10, outputPrice: 20 },
        { maxInputTokens: 4, inputPrice: 30, outputPrice: 40 }
      ]
    });

    expect(
      convertTierMaxInputTokensToK([{ maxInputTokens: 0, inputPrice: 1, outputPrice: 2 }])
    ).toEqual({
      changed: true,
      tiers: [{ maxInputTokens: 1, inputPrice: 1, outputPrice: 2 }]
    });

    expect(
      convertTierMaxInputTokensToK([{ maxInputTokens: 10, inputPrice: 1, outputPrice: 2 }])
    ).toEqual({
      changed: true,
      tiers: [{ maxInputTokens: 10000, inputPrice: 1, outputPrice: 2 }]
    });

    // 任一阶梯上限 > 10 时整条跳过迁移，防止将 [8, 32] 误改写为 [8000, 32]。
    expect(
      convertTierMaxInputTokensToK([
        { maxInputTokens: 8, inputPrice: 1, outputPrice: 2 },
        { maxInputTokens: 32, inputPrice: 3, outputPrice: 4 },
        { inputPrice: 5, outputPrice: 6 }
      ])
    ).toEqual({
      changed: false,
      tiers: [
        { maxInputTokens: 8, inputPrice: 1, outputPrice: 2 },
        { maxInputTokens: 32, inputPrice: 3, outputPrice: 4 },
        { inputPrice: 5, outputPrice: 6 }
      ]
    });

    expect(convertTierMaxInputTokensToK([{ inputPrice: 10, outputPrice: 20 }])).toEqual({
      changed: false,
      tiers: [{ inputPrice: 10, outputPrice: 20 }]
    });
    expect(convertTierMaxInputTokensToK([])).toEqual({ changed: false, tiers: [] });
    expect(() =>
      convertTierMaxInputTokensToK([{ maxInputTokens: -1, inputPrice: 1, outputPrice: 2 }])
    ).toThrow();
    expect(() =>
      MigratedTierListSchema.parse([{ maxInputTokens: 0, inputPrice: 1, outputPrice: 2 }])
    ).toThrow();
    expect(() =>
      MigratedTierListSchema.parse([{ maxInputTokens: 4.1, inputPrice: 1, outputPrice: 2 }])
    ).toThrow();
    expect(() =>
      MigratedTierListSchema.parse([{ maxInputTokens: 12.5, inputPrice: 1, outputPrice: 2 }])
    ).not.toThrow();
  });
});
