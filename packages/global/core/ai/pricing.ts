import type { ModelPriceTierType, PriceType, ResolvedModelPriceTierType } from './model.schema';

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

const resolveRawModelPriceTiers = (config?: PriceType): ResolvedModelPriceTierType[] => {
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
        startInputTokens = maxInputTokens + 1;
      }

      return acc;
    }, []);
  }

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

const getRuntimeResolvedPriceTiers = (config?: PriceType): ResolvedModelPriceTierType[] => {
  if (Array.isArray(config?.resolvedPriceTiers)) {
    return config.resolvedPriceTiers;
  }

  return resolveRawModelPriceTiers(config);
};

export const preprocessModelPriceConfig = <T extends PriceType | undefined>(config: T): T => {
  if (!config) return config;

  config.priceTiers = sanitizeModelPriceTiers(config.priceTiers);
  config.resolvedPriceTiers = resolveRawModelPriceTiers(config);

  return config;
};

/**
 * 有梯度就优先按梯度的计费规则算
 * 没有梯度的就优先按旧版的输入输出计费规则计算
 * 最后按综合价格去计算
 *
 * @returns 无论是哪种计费规则都规整成 tiers 的形式来返回
 */
export const getResolvedModelPriceTiers = (config?: PriceType): ResolvedModelPriceTierType[] => {
  return getRuntimeResolvedPriceTiers(config);
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
  const tiers = getRuntimeResolvedPriceTiers(config);
  const getMatchingResolvedTier = (
    resolvedTiers: ResolvedModelPriceTierType[],
    currentInputTokens = 0
  ): ResolvedModelPriceTierType | undefined => {
    if (resolvedTiers.length === 0) return undefined;

    const safeInputTokens = Math.max(0, currentInputTokens);
    for (let i = resolvedTiers.length - 1; i >= 0; i--) {
      const tier = resolvedTiers[i];
      if (safeInputTokens >= tier.startInputTokens) {
        return tier;
      }
    }

    return resolvedTiers[0];
  };
  const matchedTier = getMatchingResolvedTier(tiers, inputTokens);

  const totalPoints =
    (matchedTier?.inputPrice ?? 0) * (inputTokens / multiple) +
    (matchedTier?.outputPrice ?? 0) * (outputTokens / multiple);

  return {
    totalPoints,
    matchedTier,
    tiers
  };
};
