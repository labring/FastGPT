import type { ModelPriceTierType, PriceType } from './model.schema';

const isValidNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const getSafePrice = (value: unknown) => (isValidNumber(value) ? value : 0);

// 格式化 tiers，过滤无效的数组, 并且确保最小值等于上一个的最大值
export const sanitizeModelPriceTiers = (tiers?: ModelPriceTierType[]): ModelPriceTierType[] => {
  if (!Array.isArray(tiers)) return [];

  const result: ModelPriceTierType[] = [];

  for (const tier of tiers) {
    const hasMaxInputTokens = isValidNumber(tier?.maxInputTokens);
    // 这个梯度没有填 Token 的上限值 而且 没有填输入/输出价格，就算不合法
    if (!hasMaxInputTokens) {
      break;
    }

    const last = result[result.length - 1];
    const normalizedTier = {
      minInputTokens: last?.maxInputTokens || 0,
      maxInputTokens: tier.maxInputTokens,
      inputPrice: getSafePrice(tier?.inputPrice),
      outputPrice: getSafePrice(tier?.outputPrice)
    };

    result.push(normalizedTier);
  }

  return result;
};

// 计算模型价格梯度
export const getRuntimeResolvedPriceTiers = (config?: PriceType): ModelPriceTierType[] => {
  // 格式化梯度
  if (Array.isArray(config?.priceTiers)) {
    return sanitizeModelPriceTiers(config.priceTiers);
  }

  // 旧版的价格计费字段
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
