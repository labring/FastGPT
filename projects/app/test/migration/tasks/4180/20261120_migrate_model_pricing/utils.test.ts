import { describe, expect, it } from 'vitest';
import {
  backfillTierMaxInputTokensK,
  MigratedTierListSchema
} from '@/migration/tasks/4180/20261120_migrate_model_pricing/utils';

describe('20261120_migrate_model_pricing utils', () => {
  it('preserves legacy and existing K bounds while filling the remaining finite tiers', () => {
    const inputPrice = 10;
    const outputPrice = 20;
    const tiers = [
      { maxInputTokens: 0.032, maxInputTokensK: 32, inputPrice, outputPrice },
      { maxInputTokens: 0.272, inputPrice, outputPrice, cacheReadPrice: 1 },
      { maxInputTokens: 1, inputPrice, outputPrice },
      { inputPrice, outputPrice }
    ];
    const migrated = backfillTierMaxInputTokensK(tiers);
    expect(migrated).toEqual({
      changed: true,
      tiers: [
        tiers[0],
        { ...tiers[1], maxInputTokensK: 272 },
        { ...tiers[2], maxInputTokensK: 1000 },
        tiers[3]
      ]
    });
    expect(backfillTierMaxInputTokensK(migrated.tiers)).toEqual({
      changed: false,
      tiers: migrated.tiers
    });
  });

  it('copies legacy integer K bounds, clamps zero, and skips open or new-only tiers', () => {
    const finite = { maxInputTokens: 8, inputPrice: 1, outputPrice: 2 };
    const open = { inputPrice: 3, outputPrice: 4 };
    const newOnly = { maxInputTokensK: 4, inputPrice: 1, outputPrice: 2 };
    expect(backfillTierMaxInputTokensK([finite, open])).toEqual({
      changed: true,
      tiers: [{ ...finite, maxInputTokensK: 8 }, open]
    });
    expect(backfillTierMaxInputTokensK([{ ...finite, maxInputTokens: 0 }]).tiers[0]).toEqual({
      ...finite,
      maxInputTokens: 0,
      maxInputTokensK: 1
    });
    expect(backfillTierMaxInputTokensK([newOnly, open])).toEqual({
      changed: false,
      tiers: [newOnly, open]
    });
    expect(backfillTierMaxInputTokensK([])).toEqual({ changed: false, tiers: [] });
  });

  it('rejects invalid bounds and reports any finite legacy tier still missing a K bound', () => {
    const prices = { inputPrice: 1, outputPrice: 2 };
    expect(() => backfillTierMaxInputTokensK([{ ...prices, maxInputTokens: -1 }])).toThrow();
    expect(() => backfillTierMaxInputTokensK([{ ...prices, maxInputTokens: 12.5 }])).toThrow();
    for (const maxInputTokensK of [0, 4.1]) {
      expect(() => backfillTierMaxInputTokensK([{ ...prices, maxInputTokensK }])).toThrow();
    }
    expect(() => MigratedTierListSchema.parse([{ ...prices, maxInputTokens: 5 }])).toThrow();
  });
});
