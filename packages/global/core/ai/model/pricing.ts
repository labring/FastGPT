import { round } from 'lodash-es';
import { ModelScopeEnum, ModelTypeEnum } from '../constants';
import {
  LLMModelPricingSchema,
  UnitModelPricingSchema,
  type ModelPriceTierType,
  type ModelPricingType,
  type PriceType,
  type AIModelDocumentDataType
} from './schema';

export const MAX_MODEL_PRICE_TIERS = 5;

/** 模型单价最多两位小数，undefined 按 0 处理；不舍入每次调用的最终费用。 */
export const roundModelPrice = (price = 0) => (Number.isInteger(price) ? price : round(price, 2));

/** 表单空行不落库；保留有效递增上限，遇到无限档结束，不保存可推导的下限。 */
export const sanitizeModelPriceTiers = (tiers?: ModelPriceTierType[]): ModelPriceTierType[] => {
  const result: ModelPriceTierType[] = [];
  for (const tier of tiers ?? []) {
    if (result.length >= MAX_MODEL_PRICE_TIERS) break;
    const hasInput = typeof tier.inputPrice === 'number' && Number.isFinite(tier.inputPrice);
    const hasOutput = typeof tier.outputPrice === 'number' && Number.isFinite(tier.outputPrice);
    const max =
      typeof tier.maxInputTokens === 'number' && Number.isFinite(tier.maxInputTokens)
        ? Math.max(0, tier.maxInputTokens)
        : undefined;
    if (!hasInput && !hasOutput && max === undefined) break;
    const previous = result.at(-1)?.maxInputTokens;
    if (max !== undefined && previous !== undefined && max <= previous) continue;
    result.push({
      ...(max === undefined ? {} : { maxInputTokens: max }),
      inputPrice: hasInput ? tier.inputPrice : 0,
      outputPrice: hasOutput ? tier.outputPrice : 0
    });
    if (max === undefined) break;
  }
  return result;
};

/** 只解析新计价字段，绝不回退根级历史价格。 */
export const getRuntimeResolvedPriceTiers = (config?: PriceType): ModelPriceTierType[] =>
  sanitizeModelPriceTiers(config?.pricing?.tiers);

/** 统一单价精度，不改变阶梯边界或未配置状态。 */
export const roundModelPricing = (pricing: ModelPricingType): ModelPricingType => ({
  ...(pricing.unitPrice === undefined ? {} : { unitPrice: roundModelPrice(pricing.unitPrice) }),
  ...(pricing.tiers === undefined
    ? {}
    : {
        tiers: sanitizeModelPriceTiers(pricing.tiers).map((tier) => ({
          ...tier,
          inputPrice: roundModelPrice(tier.inputPrice),
          outputPrice: roundModelPrice(tier.outputPrice)
        }))
      })
});

/** 编辑读取时统一单价显示精度；不写库，运行期费用仍读取数据库原值。 */
export const normalizeModelPricingForRead = (
  model: AIModelDocumentDataType
): AIModelDocumentDataType => {
  if (model.pricing === undefined) return model;
  const schema = model.type === ModelTypeEnum.llm ? LLMModelPricingSchema : UnitModelPricingSchema;
  return {
    ...model,
    pricing: schema.parse(roundModelPricing(model.pricing))
  } as AIModelDocumentDataType;
};

/** 保存仅规范新 pricing；空配置和显式零价均保留，不读取历史根字段。 */
export const normalizeModelPricingForSave = (
  model: AIModelDocumentDataType
): AIModelDocumentDataType => {
  // 新版保存即使清空价格也持久化空对象，后台迁移不能再用历史价格覆盖此编辑。
  if (model.type === ModelTypeEnum.llm)
    return {
      ...model,
      pricing: LLMModelPricingSchema.parse(roundModelPricing(model.pricing ?? {}))
    };
  return {
    ...model,
    pricing: UnitModelPricingSchema.parse(roundModelPricing(model.pricing ?? {}))
  };
};

/** 仅系统模型计费；新 pricing 缺失与团队模型均免费，分母只由模型类型决定。 */
export const calculateModelPrice = ({
  config,
  inputTokens = 0,
  outputTokens = 0
}: {
  config?: PriceType & { type?: ModelTypeEnum; scope?: ModelScopeEnum };
  inputTokens?: number;
  outputTokens?: number;
}) => {
  const tiers = getRuntimeResolvedPriceTiers(config);
  const multiple = config?.type === ModelTypeEnum.stt ? 60 : 1000000;
  const matchedTier =
    tiers.find(
      (tier) => tier.maxInputTokens === undefined || inputTokens / multiple <= tier.maxInputTokens
    ) ?? tiers.at(-1);
  const totalPoints =
    config?.scope !== ModelScopeEnum.system
      ? 0
      : config.type === ModelTypeEnum.llm
        ? ((matchedTier?.inputPrice ?? 0) * inputTokens +
            (matchedTier?.outputPrice ?? 0) * outputTokens) /
          multiple
        : ((inputTokens + outputTokens) / multiple) * (config.pricing?.unitPrice ?? 0);
  return { totalPoints, tiers, matchedTier };
};
