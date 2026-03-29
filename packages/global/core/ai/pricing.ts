import type { ModelPriceTierType, PriceType } from './model.schema';

const isValidNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const getSafePrice = (value: unknown) => (isValidNumber(value) ? value : 0);

/*
  格式化 tiers：跳过降序梯度、支持末尾开放梯度
  1. 只有一个梯度，不管有没有价格，都推送进去
  2. 多个梯度，遇到没有 maxToken 就认为是最后的梯度。
    2.1 如果有价格，则推送，认为是无限大梯度
    2.2 如果没有价格，认为是空行，跳过
*/
export const sanitizeModelPriceTiers = (tiers?: ModelPriceTierType[]): ModelPriceTierType[] => {
  if (!Array.isArray(tiers)) return [];

  const result: ModelPriceTierType[] = [];

  for (const tier of tiers) {
    if (result.length === 0) {
      result.push({
        minInputTokens: 0,
        maxInputTokens: isValidNumber(tier?.maxInputTokens)
          ? Math.max(0, tier.maxInputTokens)
          : undefined,
        inputPrice: getSafePrice(tier?.inputPrice),
        outputPrice: getSafePrice(tier?.outputPrice)
      });
      continue;
    }

    const hasMaxInputTokens = isValidNumber(tier?.maxInputTokens);
    const last = result[result.length - 1];
    const minInputTokens = last.maxInputTokens ?? 0;

    if (!hasMaxInputTokens) {
      // 无上限梯度（开放末端）：有价格才算有效
      const hasPrice = isValidNumber(tier?.inputPrice) || isValidNumber(tier?.outputPrice);
      if (hasPrice) {
        result.push({
          minInputTokens,
          inputPrice: getSafePrice(tier?.inputPrice),
          outputPrice: getSafePrice(tier?.outputPrice)
        });
      }
      break;
    }

    const maxInputTokens = Math.max(0, tier.maxInputTokens!);

    // 跳过降序梯度（maxInputTokens 必须严格递增）
    if (last?.maxInputTokens != null && maxInputTokens <= last.maxInputTokens) {
      continue;
    }

    result.push({
      minInputTokens,
      maxInputTokens,
      inputPrice: getSafePrice(tier?.inputPrice),
      outputPrice: getSafePrice(tier?.outputPrice)
    });
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
        minInputTokens: 0,
        inputPrice: getSafePrice(config?.inputPrice),
        outputPrice: getSafePrice(config?.outputPrice)
      }
    ];
  }

  if (isValidNumber(config?.charsPointsPrice) || config?.charsPointsPrice === undefined) {
    const comprehensivePrice = getSafePrice(config?.charsPointsPrice);

    return [
      {
        minInputTokens: 0,
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
  // 匹配梯度区间，左开右闭 (prevMax, maxInputTokens]
  // 第一个梯度特殊处理为左闭右闭 [0, maxInputTokens]
  const getMatchingResolvedTier = (
    resolvedTiers: ModelPriceTierType[],
    currentInputTokens = 0
  ): ModelPriceTierType | undefined => {
    if (resolvedTiers.length === 0) return undefined;

    for (let i = 0; i < resolvedTiers.length; i++) {
      const tier = resolvedTiers[i];
      const maxInputTokens = tier.maxInputTokens;

      // 开放末端梯度（无 maxInputTokens）
      if (!maxInputTokens) {
        return tier;
      }

      // 检查是否在当前梯度范围内
      if (currentInputTokens <= maxInputTokens) {
        return tier;
      }
    }

    // 如果都不匹配，返回最后一个梯度
    return resolvedTiers[resolvedTiers.length - 1];
  };
  const matchedTier = getMatchingResolvedTier(tiers, inputTokens / multiple);

  const totalPoints =
    (matchedTier?.inputPrice ?? 0) * (inputTokens / multiple) +
    (matchedTier?.outputPrice ?? 0) * (outputTokens / multiple);

  return {
    totalPoints,
    matchedTier,
    tiers
  };
};
