import z from 'zod';

// 冻结迁移的价格契约，并保留旧上限和其他现存字段供回退使用。
const TierListSchema = z.array(
  z
    .object({
      maxInputTokens: z.number().finite().min(0).optional(),
      maxInputTokensK: z.number().int().positive().optional(),
      inputPrice: z.number().finite().min(0),
      outputPrice: z.number().finite().min(0)
    })
    .passthrough()
);

export const MigratedTierListSchema = TierListSchema.refine(
  (tiers) =>
    tiers.every((tier) => tier.maxInputTokens === undefined || tier.maxInputTokensK !== undefined),
  { message: 'Expected K Tokens for legacy finite tier limits' }
);

export type MigrationPriceTier = z.infer<typeof TierListSchema>[number];

/** 只回填缺失的有限上限。任一旧上限小于 1 时，整组旧上限按 M Tokens 解释。 */
export const backfillTierMaxInputTokensK = (
  rawTiers: unknown
): { tiers: MigrationPriceTier[]; changed: boolean } => {
  const tiers = TierListSchema.parse(rawTiers);
  const isMillionUnit = tiers.some(
    ({ maxInputTokens }) => maxInputTokens !== undefined && maxInputTokens < 1
  );

  let changed = false;
  const nextTiers = tiers.map((tier) => {
    const { maxInputTokens, maxInputTokensK } = tier;
    if (maxInputTokens === undefined || maxInputTokensK !== undefined) return tier;

    changed = true;
    return {
      ...tier,
      maxInputTokensK: isMillionUnit
        ? Math.max(1, Math.round(maxInputTokens * 1000))
        : maxInputTokens
    };
  });

  return { tiers: MigratedTierListSchema.parse(nextTiers), changed };
};
