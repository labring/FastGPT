import z from 'zod';

/** 计费用量的 type 来自模型价格配置，不直接采用上游 usage.type。 */
export const STTBillableUsageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('duration'), seconds: z.number().nonnegative() }),
  z.object({
    type: z.literal('tokens'),
    inputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    outputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
  })
]);
export type STTBillableUsageType = z.infer<typeof STTBillableUsageSchema>;

/** 上游值在计费边界按 unknown 检查，缺失和非法值均不能转换成可扣费数量。 */
export type STTUpstreamUsageType = {
  type?: unknown;
  seconds?: unknown;
  /** 上游统计字段，不参与 STT 计费，也不用于推导输入或输出数量。 */
  total_tokens?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
};
