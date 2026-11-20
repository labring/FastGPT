import { isEqual } from 'lodash-es';
import z from 'zod';

// 若模型任一阶梯上限大于 10，大概率管理员原本已按 K Tokens 填写，整条跳过迁移。
export const TIER_K_SKIP_THRESHOLD = 10;

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
    .refine((val) => val > TIER_K_SKIP_THRESHOLD || (Number.isInteger(val) && val > 0), {
      message: 'Expected positive integer K Tokens or skipped value > 10'
    })
    .optional()
});

export const TierListSchema = z.array(TierSchema);
export const MigratedTierListSchema = z.array(MigratedTierSchema);
export type MigrationPriceTier = z.infer<typeof TierSchema>;

/**
 * 将以 M Tokens 存储的阶梯上限乘以 1000 并四舍五入为 K Tokens 正整数，保留单价与开放末端档；
 * 若模型任一有限上限已大于 10（大概率原为 K Tokens 配置），则整条跳过以保持档位单调递增。
 */
export const convertTierMaxInputTokensToK = (
  rawTiers: unknown
): { tiers: MigrationPriceTier[]; changed: boolean } => {
  const tiers = TierListSchema.parse(rawTiers);
  if (
    tiers.some(
      (tier) => tier.maxInputTokens !== undefined && tier.maxInputTokens > TIER_K_SKIP_THRESHOLD
    )
  ) {
    return { tiers, changed: false };
  }

  const nextTiers = tiers.map((tier) => {
    if (tier.maxInputTokens === undefined) {
      return tier;
    }
    return {
      ...tier,
      maxInputTokens: Math.max(1, Math.round(tier.maxInputTokens * 1000))
    };
  });

  return { tiers: nextTiers, changed: !isEqual(nextTiers, tiers) };
};
