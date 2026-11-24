import z from 'zod';

/**
 * @deprecated 历史阶梯 BSON 的冻结 Schema，仅供回填。保留旧字段供 4.17.5 回退读取，业务 Schema 使用固定单位的 maxInputTokensK。
 */
const LegacyTierListSchema = z
  .array(
    z
      .object({
        maxInputTokens: z.number().finite().min(0).optional().meta({
          deprecated: true,
          description:
            '旧版阶梯上限。原字段保留供 4.17.5 按 M Tokens 读取，新版使用 maxInputTokensK。'
        }),
        maxInputTokensK: z.number().int().positive().optional(),
        inputPrice: z.number().finite().min(0),
        outputPrice: z.number().finite().min(0)
      })
      .passthrough()
  )
  .meta({ deprecated: true });

/** 校验回填后的历史记录，确保每个有限旧上限都具备对应的 K 上限。 */
export const MigratedTierListSchema = LegacyTierListSchema.refine(
  (tiers) =>
    tiers.every((tier) => tier.maxInputTokens === undefined || tier.maxInputTokensK !== undefined),
  { message: 'Expected K Tokens for legacy finite tier limits' }
);

/** @deprecated 仅用于迁移读写历史 BSON 并保留回退数据，业务代码使用 ModelPriceTierType。 */
export type MigrationPriceTier = z.infer<typeof LegacyTierListSchema>[number];

/** 只回填缺失的有限上限。任一旧上限小于 1 时，整组旧上限按 M Tokens 解释。 */
export const backfillTierMaxInputTokensK = (
  rawTiers: unknown
): { tiers: MigrationPriceTier[]; changed: boolean } => {
  const tiers = LegacyTierListSchema.parse(rawTiers);
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
