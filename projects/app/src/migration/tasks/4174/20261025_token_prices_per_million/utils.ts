import type { PriceType } from '@fastgpt/global/core/ai/model/schema';

/**
 * 将 Token 和 TTS 字符的历史每千单位单价换算为每百万，阶梯边界同步换算。
 * 只转换迁移尚未保存备份的记录；幂等判断与舍入由迁移计划负责。
 * 调用方已排除 STT，业务运行期不使用此函数。
 */
export const convertModelPricingToMillion = <T extends PriceType>(pricing: T): T => {
  /** 十进制移位同时保留单价舍入中点和右闭区间边界，不通过浮点乘除放大误差。 */
  const shiftDecimal = (value: number, offset: number) => {
    const [significand, exponent] = value.toExponential().split('e');
    return Number(`${significand}e${Number(exponent) + offset}`);
  };

  return {
    ...pricing,
    ...(pricing.priceTiers
      ? {
          priceTiers: pricing.priceTiers.map((tier) => ({
            ...tier,
            ...(tier.minInputTokens !== undefined
              ? { minInputTokens: shiftDecimal(tier.minInputTokens, -3) }
              : {}),
            ...(typeof tier.maxInputTokens === 'number'
              ? { maxInputTokens: shiftDecimal(tier.maxInputTokens, -3) }
              : {}),
            inputPrice: shiftDecimal(tier.inputPrice, 3),
            outputPrice: shiftDecimal(tier.outputPrice, 3)
          }))
        }
      : {}),
    ...(pricing.inputPrice !== undefined
      ? { inputPrice: shiftDecimal(pricing.inputPrice, 3) }
      : {}),
    ...(pricing.outputPrice !== undefined
      ? { outputPrice: shiftDecimal(pricing.outputPrice, 3) }
      : {}),
    ...(pricing.charsPointsPrice !== undefined
      ? { charsPointsPrice: shiftDecimal(pricing.charsPointsPrice, 3) }
      : {})
  };
};
