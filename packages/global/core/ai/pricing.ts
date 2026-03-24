import type { ModelPriceTierType, PriceType } from './model.schema';

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

const isResolvedPriceTier = (
  tier?: ModelPriceTierType
): tier is ModelPriceTierType &
  Required<Pick<ModelPriceTierType, 'minInputTokens' | 'inputPrice' | 'outputPrice'>> => {
  return (
    isValidNumber(tier?.minInputTokens) &&
    isValidNumber(tier?.inputPrice) &&
    isValidNumber(tier?.outputPrice)
  );
};

const resolveRawModelPriceTiers = (config?: PriceType): ModelPriceTierType[] => {
  const tiers = sanitizeModelPriceTiers(config?.priceTiers);

  if (tiers.length > 0) {
    let minInputTokens = 1;

    return tiers.reduce<ModelPriceTierType[]>((acc, tier) => {
      const maxInputTokens = tier.maxInputTokens;
      const isInvalidTier = typeof maxInputTokens === 'number' && maxInputTokens < minInputTokens;

      if (isInvalidTier) {
        return acc;
      }

      acc.push({
        minInputTokens,
        maxInputTokens,
        inputPrice: getSafePrice(tier.inputPrice),
        outputPrice: getSafePrice(tier.outputPrice)
      });

      if (typeof maxInputTokens === 'number') {
        minInputTokens = maxInputTokens + 1;
      }

      return acc;
    }, []);
  }

  const hasLegacyIOPrice = isValidNumber(config?.inputPrice) && config.inputPrice > 0;

  if (hasLegacyIOPrice) {
    return [
      {
        minInputTokens: 1,
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
        minInputTokens: 1,
        inputPrice: comprehensivePrice,
        outputPrice: comprehensivePrice
      }
    ];
  }

  return [];
};

export const getRuntimeResolvedPriceTiers = (config?: PriceType): ModelPriceTierType[] => {
  if (Array.isArray(config?.priceTiers) && config.priceTiers.every(isResolvedPriceTier)) {
    return config.priceTiers;
  }

  return resolveRawModelPriceTiers(config);
};

export const preprocessModelPriceConfig = <T extends PriceType | undefined>(config: T): T => {
  if (!config) return config;

  config.priceTiers = getRuntimeResolvedPriceTiers(config);

  return config;
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
  const resolvedTiers = getRuntimeResolvedPriceTiers(config);
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
    resolvedTiers: ModelPriceTierType[],
    currentInputTokens = 0
  ): ModelPriceTierType | undefined => {
    if (resolvedTiers.length === 0) return undefined;

    const safeInputTokens = Math.max(0, currentInputTokens);
    for (let i = resolvedTiers.length - 1; i >= 0; i--) {
      const tier = resolvedTiers[i];
      if (safeInputTokens >= (tier.minInputTokens ?? 1)) {
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
