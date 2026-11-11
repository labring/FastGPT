/**
 * STT 按音频秒数计费，优先使用上游报告的有效时长，缺省时回退到调用方时长。
 * total_tokens 对 Qwen-ASR 等模型是真实 token 数，不能作为音频秒数使用。
 * fallbackDuration 由调用方校验为至少 1 秒；有效的上游时长也按最少 1 秒处理。
 */
export const getSTTDuration = ({
  usage,
  fallbackDuration
}: {
  usage?: { seconds?: unknown };
  fallbackDuration: number;
}) => {
  const seconds = usage?.seconds;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? Math.max(1, seconds)
    : fallbackDuration;
};
