import type { ModelPriceTierType, PriceType } from './model.schema';

export type ResolvedModelPriceTierType = {
  startInputTokens: number;
  maxInputTokens?: number;
  inputPrice: number;
  outputPrice: number;
};

const isValidNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const getSafePrice = (value: unknown) => (isValidNumber(value) ? value : 0);

export const sanitizeModelPriceTiers = (tiers?: ModelPriceTierType[]): ModelPriceTierType[] => {
  if (!Array.isArray(tiers)) return [];

  const result: ModelPriceTierType[] = [];

  for (const tier of tiers) {
    const hasPrice = isValidNumber(tier?.inputPrice) || isValidNumber(tier?.outputPrice);
    const hasMaxInputTokens = isValidNumber(tier?.maxInputTokens);

    // 这个梯度没有填 Token 的上限值 而且 没有填输入/输出价格，就算不合法
    if (!hasPrice && !hasMaxInputTokens) {
      continue;
    }

    const normalizedTier = {
      maxInputTokens: hasMaxInputTokens ? Math.max(1, Math.floor(tier.maxInputTokens!)) : undefined,
      inputPrice: hasPrice ? getSafePrice(tier?.inputPrice) : undefined,
      outputPrice: hasPrice ? getSafePrice(tier?.outputPrice) : undefined
    };

    result.push(normalizedTier);

    if (normalizedTier.maxInputTokens === undefined) {
      break;
    }
  }

  return result;
};

/**
 * 有梯度就优先按梯度的计费规则算
 * 没有梯度的就优先按旧版的输入输出计费规则计算
 * 最后按综合价格去计算
 *
 * @returns 无论是哪种计费规则都规整成 tiers 的形式来返回
 */
export const getResolvedModelPriceTiers = (config?: PriceType): ResolvedModelPriceTierType[] => {
  const tiers = sanitizeModelPriceTiers(config?.priceTiers);

  if (tiers.length > 0) {
    let startInputTokens = 1;

    return tiers.reduce<ResolvedModelPriceTierType[]>((acc, tier) => {
      const maxInputTokens = tier.maxInputTokens;
      const isInvalidTier = typeof maxInputTokens === 'number' && maxInputTokens < startInputTokens;

      if (isInvalidTier) {
        return acc;
      }

      acc.push({
        startInputTokens,
        maxInputTokens,
        inputPrice: getSafePrice(tier.inputPrice),
        outputPrice: getSafePrice(tier.outputPrice)
      });

      if (typeof maxInputTokens === 'number') {
        // 下一个梯度的下限是上一个梯度的上限+1就行
        startInputTokens = maxInputTokens + 1;
      }

      return acc;
    }, []);
  }

  // 旧版输入/输出价格
  const hasLegacyIOPrice = isValidNumber(config?.inputPrice) && config.inputPrice > 0;

  if (hasLegacyIOPrice) {
    return [
      {
        startInputTokens: 1,
        inputPrice: getSafePrice(config?.inputPrice),
        outputPrice: getSafePrice(config?.outputPrice)
      }
    ];
  }

  if (
    isValidNumber(config?.charsPointsPrice) ||
    config?.charsPointsPrice === 0 ||
    config?.charsPointsPrice === undefined
  ) {
    // 综合价格
    const comprehensivePrice = getSafePrice(config?.charsPointsPrice);

    return [
      {
        startInputTokens: 1,
        inputPrice: comprehensivePrice,
        outputPrice: comprehensivePrice
      }
    ];
  }

  return [];
};

export const getModelPriceTiersForForm = (config?: PriceType): ModelPriceTierType[] => {
  const tiers = sanitizeModelPriceTiers(config?.priceTiers);

  // 本来就配好了价格梯度的话就直接返回就行
  if (tiers.length > 0) {
    return tiers;
  }

  const hasLegacyIOPrice = typeof config?.inputPrice === 'number' && config.inputPrice > 0;
  const hasLegacyComprehensivePrice =
    typeof config?.charsPointsPrice === 'number' && config.charsPointsPrice > 0;

  if (!hasLegacyIOPrice && !hasLegacyComprehensivePrice) {
    return [
      {
        maxInputTokens: undefined,
        inputPrice: undefined,
        outputPrice: undefined
      }
    ];
  }

  // 不然就把配置转换成梯度
  const resolvedTiers = getResolvedModelPriceTiers(config);
  const firstTier = resolvedTiers[0];

  if (!firstTier) {
    return [
      {
        maxInputTokens: undefined,
        inputPrice: undefined,
        outputPrice: undefined
      }
    ];
  }

  return [
    {
      maxInputTokens: firstTier.maxInputTokens,
      inputPrice: firstTier.inputPrice,
      outputPrice: firstTier.outputPrice
    }
  ];
};

/**
 * 根据输入的 Token 数量，返回对应的梯度
 */
export const getMatchingModelPriceTier = ({
  config,
  inputTokens = 0
}: {
  config?: PriceType;
  inputTokens?: number;
}): ResolvedModelPriceTierType | undefined => {
  const tiers = getResolvedModelPriceTiers(config);

  if (tiers.length === 0) return undefined;

  const safeInputTokens = Math.max(0, inputTokens);
  const matchedTier = tiers.find(
    (tier) =>
      safeInputTokens >= tier.startInputTokens &&
      (typeof tier.maxInputTokens !== 'number' || safeInputTokens <= tier.maxInputTokens)
  );

  return matchedTier || tiers[tiers.length - 1];
};

export const calculateModelPrice = ({
  config,
  inputTokens = 0,
  outputTokens = 0,
  multiple = 1000
}: {
  config?: PriceType;
  inputTokens?: number;
  outputTokens?: number;
  multiple?: number;
}) => {
  const matchedTier = getMatchingModelPriceTier({
    config,
    inputTokens
  });

  const totalPoints =
    getSafePrice(matchedTier?.inputPrice) * (inputTokens / multiple) +
    getSafePrice(matchedTier?.outputPrice) * (outputTokens / multiple);

  return {
    totalPoints,
    matchedTier,
    tiers: getResolvedModelPriceTiers(config)
  };
};
