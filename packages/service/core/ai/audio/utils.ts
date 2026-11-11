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
  const tokens = usage?.type === 'duration' ? undefined : usage?.total_tokens;
  return {
    type: 'tokens',
    totalTokens:
      typeof tokens === 'number' && Number.isSafeInteger(tokens) && tokens >= 0 ? tokens : 0
  };
};
