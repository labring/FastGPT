import { resolveSTTPricing } from '@fastgpt/global/core/ai/model/pricing';
import type { ModelPricingType } from '@fastgpt/global/core/ai/model/schema';
import type {
  STTBillableUsageType,
  STTUpstreamUsageType
} from '@fastgpt/global/core/ai/audio/type';

/**
 * 仅按模型价格口径提取上游用量。缺失、负数和非有限值记 0；
 * 不使用客户端时长，不跨字段兜底，不强制最少一秒，也不从识别文字估算 Tokens。
 */
export const getSTTBillableUsage = ({
  pricing,
  usage
}: {
  pricing?: ModelPricingType;
  usage?: STTUpstreamUsageType;
}): STTBillableUsageType => {
  const resolved = resolveSTTPricing(pricing);
  if (resolved.type === 'duration') {
    const seconds = usage?.seconds;
    return {
      type: 'duration',
      seconds: typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? seconds : 0
    };
  }

  // 部分网关在 duration 响应中兼容填充 total_tokens=seconds，这不是真实 Tokens。
  /** 仅接受上游分别报告的安全整数；兼容时长响应不包含可计费 Tokens。 */
  const getTokens = (value: unknown) =>
    usage?.type !== 'duration' &&
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
      ? value
      : 0;
  return {
    type: 'tokens',
    inputTokens: getTokens(usage?.input_tokens),
    outputTokens: getTokens(usage?.output_tokens)
  };
};
