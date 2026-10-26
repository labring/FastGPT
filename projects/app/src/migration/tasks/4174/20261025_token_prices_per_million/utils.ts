import z from 'zod';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  LLMModelPricingSchema,
  UnitModelPricingSchema,
  type ModelPricingType
} from '@fastgpt/global/core/ai/model/schema';
import { roundModelPrice } from '@fastgpt/global/core/ai/model/pricing';

/** 根级字段仅在迁移内读取；保留旧下限用于校验，但不写入新结构。 */
export const LegacyModelPricesSchema = z.object({
  priceTiers: z
    .array(
      z.object({
        minInputTokens: z.number().min(0).optional(),
        maxInputTokens: z.number().min(0).nullish(),
        inputPrice: z.number().min(0),
        outputPrice: z.number().min(0)
      })
    )
    .max(5)
    .optional(),
  inputPrice: z.number().min(0).optional(),
  outputPrice: z.number().min(0).optional(),
  charsPointsPrice: z.number().min(0).optional()
});

/** 迁移专用：Token/TTS 单价乘千、边界除千，STT 原价复制；不修改源字段。 */
export const convertLegacyModelPricing = (
  source: unknown,
  type: ModelTypeEnum
): ModelPricingType => {
  const legacy = LegacyModelPricesSchema.parse(source);
  /** 十进制移位保留舍入中点及右闭区间边界，避免浮点乘除误差。 */
  const shiftDecimal = (value: number, offset: number) => {
    const [significand, exponent] = value.toExponential().split('e');
    return Number(`${significand}e${Number(exponent) + offset}`);
  };
  const convertPrice = (value: number) => roundModelPrice(shiftDecimal(value, 3));

  if (type !== ModelTypeEnum.llm) {
    return UnitModelPricingSchema.parse({
      ...(legacy.charsPointsPrice === undefined
        ? {}
        : {
            unitPrice:
              type === ModelTypeEnum.stt
                ? legacy.charsPointsPrice
                : convertPrice(legacy.charsPointsPrice)
          })
    });
  }

  // 空数组可能是旧 MongoDB 默认值；优先有效阶梯，再读取旧输入输出或综合价。
  const tiers = (() => {
    if (legacy.priceTiers && legacy.priceTiers.length > 0) return legacy.priceTiers;
    if (legacy.inputPrice !== undefined || legacy.outputPrice !== undefined) {
      return [{ inputPrice: legacy.inputPrice ?? 0, outputPrice: legacy.outputPrice ?? 0 }];
    }
    if (legacy.charsPointsPrice !== undefined) {
      return [{ inputPrice: legacy.charsPointsPrice, outputPrice: legacy.charsPointsPrice }];
    }
    return [];
  })();
  return LLMModelPricingSchema.parse({
    tiers: tiers.map((tier) => ({
      ...('maxInputTokens' in tier && typeof tier.maxInputTokens === 'number'
        ? { maxInputTokens: shiftDecimal(tier.maxInputTokens, -3) }
        : {}),
      inputPrice: convertPrice(tier.inputPrice),
      outputPrice: convertPrice(tier.outputPrice)
    }))
  });
};
