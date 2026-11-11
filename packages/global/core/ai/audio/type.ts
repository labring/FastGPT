import z from 'zod';

/** 计费用量的 type 来自模型价格配置，不直接采用上游 usage.type。 */
export const STTBillableUsageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('duration'), seconds: z.number().nonnegative() }),
  z.object({ type: z.literal('tokens'), totalTokens: z.number().int().nonnegative() })
]);
export type STTBillableUsageType = z.infer<typeof STTBillableUsageSchema>;

export const STTBillingSnapshotSchema = z.object({
  type: z.enum(['duration', 'tokens']).meta({ description: '本次 STT 计价类型' }),
  quantity: z.number().nonnegative().meta({ description: '本次计费用量，单位由 type 决定' }),
  unitPrice: z.number().nonnegative().meta({ description: '本次积分单价' }),
  unitSize: z
    .number()
    .positive()
    .meta({ description: '单价对应的数量分母，时长为 N 秒，Tokens 为百万' })
});
export type STTBillingSnapshotType = z.infer<typeof STTBillingSnapshotSchema>;

/** 上游值在计费边界按 unknown 检查，缺失和非法值均不能转换成可扣费数量。 */
export type STTUpstreamUsageType = {
  type?: unknown;
  seconds?: unknown;
  total_tokens?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
};
