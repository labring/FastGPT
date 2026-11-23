import z from 'zod';

// 无单位时，含 < 1 的阶梯上限视为 M Tokens（乘以 1000 转为 K），否则仅回填 tierUnit: 'K'。
export const TIER_M_THRESHOLD = 1;

export const TierUnitSchema = z.enum(['K']);
export type MigrationTierUnit = z.infer<typeof TierUnitSchema>;

// 冻结本次迁移的最小阶梯价格契约，避免后续业务 Schema 调整影响历史数据清洗。
const TierSchema = z
  .object({
    maxInputTokens: z.number().finite().min(0).optional(),
    inputPrice: z.number().finite().min(0),
    outputPrice: z.number().finite().min(0)
  })
  .passthrough();

const MigratedTierSchema = TierSchema.extend({
  maxInputTokens: z
    .number()
    .int({ message: 'Expected positive integer K Tokens' })
    .positive({ message: 'Expected positive integer K Tokens' })
    .optional()
});

export const TierListSchema = z.array(TierSchema);
export const MigratedTierListSchema = z.array(MigratedTierSchema);
export const MigratedTierPricingSchema = z
  .object({
    tiers: MigratedTierListSchema,
    tierUnit: z.literal('K').optional()
  })
  .superRefine((value, ctx) => {
    if (value.tiers.length > 0 && value.tierUnit !== 'K') {
      ctx.addIssue({
        code: 'custom',
        message: 'Expected tierUnit to be K for non-empty LLM tiers'
      });
    }
  });
export type MigrationPriceTier = z.infer<typeof TierSchema>;

/**
 * 回填缺失 `tierUnit` 的系统 LLM 阶梯定价：
 * - 已有 `tierUnit: 'K'` 时跳过修改，保证重跑幂等；
 * - 无单位且存在 `< 1` 的上限时视为 M Tokens，全部有限上限乘以 1000 并四舍五入为正整数 K Tokens，写入 `tierUnit: 'K'`；
 * - 无单位且所有有限上限均 `>= 1`（或全开放档）时保留原值，仅回填 `tierUnit: 'K'`。
 */
export const convertTierMaxInputTokensToK = ({
  tiers: rawTiers,
  tierUnit: rawTierUnit
}: {
  tiers: unknown;
  tierUnit?: unknown;
}): { tiers: MigrationPriceTier[]; tierUnit?: MigrationTierUnit; changed: boolean } => {
  const tiers = TierListSchema.parse(rawTiers);
  const tierUnit = rawTierUnit === undefined ? undefined : TierUnitSchema.parse(rawTierUnit);

  if (tiers.length === 0) {
    return { tiers, tierUnit, changed: false };
  }

  if (tierUnit === 'K') {
    MigratedTierListSchema.parse(tiers);
    return { tiers, tierUnit: 'K', changed: false };
  }

  const isMillionUnit = tiers.some(
    (tier) => tier.maxInputTokens !== undefined && tier.maxInputTokens < TIER_M_THRESHOLD
  );

  const nextTiers = isMillionUnit
    ? tiers.map((tier) => {
        if (tier.maxInputTokens === undefined) {
          return tier;
        }
        return {
          ...tier,
          maxInputTokens: Math.max(1, Math.round(tier.maxInputTokens * 1000))
        };
      })
    : tiers;

  MigratedTierListSchema.parse(nextTiers);

  return {
    tiers: nextTiers,
    tierUnit: 'K',
    changed: true
  };
};
