import type { PriceType } from '@fastgpt/global/core/ai/model/schema';

/**
 * 将 Token 和 TTS 字符的历史每千单位单价换算为每百万，阶梯边界同步换算。
 * 只转换迁移尚未保存备份的记录；幂等判断与舍入由迁移计划负责。
 * 调用方已排除 STT，业务运行期不使用此函数。
 */
export const convertModelPricingToMillion = <T extends PriceType>(pricing: T): T => {
  /** 按十进制移动边界，避免 4.1 / 1000 的二进制误差缩小右闭区间；不截断有效位。 */
  const convertBoundary = (boundary: number) => {
    const [significand, exponent] = boundary.toExponential().split('e');
    return Number(`${significand}e${Number(exponent) - 3}`);
  };

  return {
    ...pricing,
    ...(pricing.priceTiers
      ? {
          priceTiers: pricing.priceTiers.map((tier) => ({
            ...tier,
            ...(tier.minInputTokens !== undefined
              ? { minInputTokens: convertBoundary(tier.minInputTokens) }
              : {}),
            ...(typeof tier.maxInputTokens === 'number'
              ? { maxInputTokens: convertBoundary(tier.maxInputTokens) }
              : {}),
            inputPrice: tier.inputPrice * 1000,
            outputPrice: tier.outputPrice * 1000
          }))
        }
      : {}),
    ...(pricing.inputPrice !== undefined ? { inputPrice: pricing.inputPrice * 1000 } : {}),
    ...(pricing.outputPrice !== undefined ? { outputPrice: pricing.outputPrice * 1000 } : {}),
    ...(pricing.charsPointsPrice !== undefined
      ? { charsPointsPrice: pricing.charsPointsPrice * 1000 }
      : {})
  };
};
