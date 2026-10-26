import type { ModelPriceTierType, PriceType, AIModelDocumentDataType } from './schema';
import { ModelTypeEnum } from '../constants';
import { round } from 'lodash-es';

export const MAX_MODEL_PRICE_TIERS = 5;

/** 模型单价统一最多两位小数，undefined 按 0 处理；不用于舍入每次调用的最终费用。 */
export const roundModelPrice = (price = 0) => (Number.isInteger(price) ? price : round(price, 2));

/** 表单、导入及迁移统一约束所有单价精度，不舍入区间边界。 */
export const roundModelPricing = <T extends PriceType>(pricing: T): T => ({
  ...pricing,
  ...(pricing.inputPrice !== undefined ? { inputPrice: roundModelPrice(pricing.inputPrice) } : {}),
  ...(pricing.outputPrice !== undefined
    ? { outputPrice: roundModelPrice(pricing.outputPrice) }
    : {}),
  ...(pricing.charsPointsPrice !== undefined
    ? { charsPointsPrice: roundModelPrice(pricing.charsPointsPrice) }
    : {}),
  ...(pricing.priceTiers
    ? {
        priceTiers: pricing.priceTiers.map((tier) => ({
          ...tier,
          inputPrice: roundModelPrice(tier.inputPrice),
          outputPrice: roundModelPrice(tier.outputPrice)
        }))
      }
    : {})
});

const isValidNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const getSafePrice = (value: unknown) => (isValidNumber(value) ? value : 0);

/*
  格式化 tiers：最多保留五档，跳过降序梯度、支持末尾开放梯度
  1. 只有一个梯度，不管有没有价格，都推送进去
  2. 多个梯度，遇到没有 maxToken 就认为是最后的梯度。
    2.1 如果有价格，则推送，认为是无限大梯度
    2.2 如果没有价格，认为是空行，跳过
*/
export const sanitizeModelPriceTiers = (tiers?: ModelPriceTierType[]): ModelPriceTierType[] => {
  if (!Array.isArray(tiers)) return [];

  const result: ModelPriceTierType[] = [];

  for (const tier of tiers) {
    if (result.length >= MAX_MODEL_PRICE_TIERS) break;

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
    if (
      last.maxInputTokens !== null &&
      last.maxInputTokens !== undefined &&
      maxInputTokens <= last.maxInputTokens
    ) {
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

/** 解析固定百万单位价格；LLM 显式空阶梯表示免费，不回退综合价。 */
export const getRuntimeResolvedPriceTiers = (
  config?: PriceType & { type?: ModelTypeEnum }
): ModelPriceTierType[] => {
  /** 最终只剩一档双零价格时视为空计费，保存与运行时加载共用该语义。 */
  const removeEmptySingleTier = (tiers: ModelPriceTierType[]) => {
    const [onlyTier] = tiers;
    return tiers.length === 1 && onlyTier.inputPrice === 0 && onlyTier.outputPrice === 0
      ? []
      : tiers;
  };

  // LLM 显式阶梯是权威配置；其他模型仍使用综合价格。
  if (Array.isArray(config?.priceTiers)) {
    const priceTiers = removeEmptySingleTier(sanitizeModelPriceTiers(config.priceTiers));
    if (config.type === ModelTypeEnum.llm) return priceTiers;
    if (priceTiers.length > 0) return priceTiers;
  }

  // 旧版的价格计费字段
  const hasLegacyIOPrice = isValidNumber(config?.inputPrice) || isValidNumber(config?.outputPrice);

  if (hasLegacyIOPrice) {
    const legacyPriceTiers = removeEmptySingleTier(
      sanitizeModelPriceTiers([
        {
          minInputTokens: 0,
          inputPrice: getSafePrice(config?.inputPrice),
          outputPrice: getSafePrice(config?.outputPrice)
        }
      ])
    );
    if (legacyPriceTiers.length > 0) return legacyPriceTiers;
  }

  if (isValidNumber(config?.charsPointsPrice)) {
    const comprehensivePrice = getSafePrice(config?.charsPointsPrice);

    const comprehensivePriceTiers = removeEmptySingleTier(
      sanitizeModelPriceTiers([
        {
          minInputTokens: 0,
          inputPrice: comprehensivePrice,
          outputPrice: comprehensivePrice
        }
      ])
    );
    if (comprehensivePriceTiers.length > 0) return comprehensivePriceTiers;
  }

  return [];
};

/**
 * 将原始模型价格规范为固定百万单位的字段结构与精度，供编辑读取、API 写入和 JSON 导入共用。
 * 写库前必须早于 MongoDB 的空阶梯默认值执行，避免把省略阶梯的非零价格误当成显式免费。
 */
export const normalizeModelPricingForRead = (
  modelData: AIModelDocumentDataType
): AIModelDocumentDataType => {
  const source =
    modelData.type === ModelTypeEnum.llm
      ? { ...modelData, priceTiers: getRuntimeResolvedPriceTiers(modelData) }
      : modelData;
  const pricing = roundModelPricing(source);
  if (pricing.type !== ModelTypeEnum.llm) return pricing;
  const { inputPrice: _input, outputPrice: _output, charsPointsPrice: _chars, ...data } = pricing;
  return { ...data, priceTiers: getRuntimeResolvedPriceTiers(pricing) };
};

/** 保存固定百万单位单价；只认编辑后的新阶梯，免费配置不能回退旧字段。 */
export const normalizeModelPricingForSave = (
  modelData: AIModelDocumentDataType
): AIModelDocumentDataType => {
  const pricing = roundModelPricing(modelData);
  if (pricing.type !== ModelTypeEnum.llm) return pricing;
  const { inputPrice: _input, outputPrice: _output, charsPointsPrice: _chars, ...data } = pricing;
  return { ...data, priceTiers: getRuntimeResolvedPriceTiers({ priceTiers: data.priceTiers }) };
};

/** 按总输入选择档位并计算费用；Token/TTS 固定百万单位，STT 由调用方传入 60 秒。 */
export const calculateModelPrice = ({
  config,
  inputTokens = 0,
  outputTokens = 0,
  multiple = 1000000
}: {
  config?: PriceType & { type?: ModelTypeEnum };
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
      if (maxInputTokens === null || maxInputTokens === undefined) {
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
    ((matchedTier?.inputPrice ?? 0) * inputTokens +
      (matchedTier?.outputPrice ?? 0) * outputTokens) /
    multiple;

  return {
    totalPoints,
    matchedTier,
    tiers
  };
};
