import { ModelStatusProbeStatusSchema } from '../../../../core/ai/model/status';
import { IntSchema } from '../../../../common/zod';
import z from 'zod';

/** 模型当前状态，未探测过时为 unknown */
const ModelStatusSchema = z.union([ModelStatusProbeStatusSchema, z.literal('unknown')]);
/** 支持探测的模型类型 */
const ModelTypeSchema = z.enum(['llm', 'embedding', 'tts', 'stt', 'rerank']);

/**
 * 模型探测配置响应 Schema。
 * 对前端脱敏，仅返回 webhookTokenConfigured 布尔标记，不回传 token 原文。
 */
export const ModelStatusProbeConfigResponseSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: IntSchema.min(5).max(60),
  webhookUrl: z.string().optional(),
  webhookTokenConfigured: z.boolean()
});
export type ModelStatusProbeConfigResponse = z.infer<typeof ModelStatusProbeConfigResponseSchema>;

const WebhookUrlSchema = z.union([z.string().trim().url().max(2048), z.literal('')]);

/**
 * 修改模型状态探测配置请求体 Schema。
 * 支持增量修改：未传 webhookUrl/webhookToken 时保留旧值。
 * 支持通过 clearWebhookToken=true 显式清空已配置的 token。
 */
export const UpdateModelStatusProbeConfigBodySchema = z
  .object({
    enabled: z.boolean(),
    intervalMinutes: IntSchema.min(5).max(60),
    webhookUrl: WebhookUrlSchema.optional(),
    webhookToken: z.string().trim().max(2048).optional(),
    clearWebhookToken: z.boolean().optional().default(false)
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.clearWebhookToken && value.webhookToken) {
      ctx.addIssue({
        code: 'custom',
        path: ['webhookToken'],
        message: 'clearWebhookToken cannot be combined with webhookToken'
      });
    }
  });
export type UpdateModelStatusProbeConfigBody = z.infer<
  typeof UpdateModelStatusProbeConfigBodySchema
>;

/** 单条模型探测历史记录 Schema */
export const ModelStatusProbeRecordSchema = z.object({
  modelId: z.string(),
  name: z.string(),
  model: z.string(),
  provider: z.string(),
  type: ModelTypeSchema,
  status: ModelStatusProbeStatusSchema,
  latencyMs: z.number().nonnegative().optional(),
  attempts: IntSchema.min(1).max(4),
  error: z.string().optional(),
  testedAt: z.string()
});
export type ModelStatusProbeRecord = z.infer<typeof ModelStatusProbeRecordSchema>;

/** 单个模型的健康状态及 48 小时汇总 Schema */
export const ModelStatusProbeModelSchema = z.object({
  modelId: z.string(),
  name: z.string(),
  model: z.string(),
  provider: z.string(),
  avatar: z.string().optional(),
  type: ModelTypeSchema,
  status: ModelStatusSchema,
  latest: ModelStatusProbeRecordSchema.nullable(),
  records: z.array(ModelStatusProbeRecordSchema),
  stabilityPercent: z.number().min(0).max(100),
  totalChecks: IntSchema
});
export type ModelStatusProbeModel = z.infer<typeof ModelStatusProbeModelSchema>;

/** 获取模型状态列表接口响应 Schema */
export const GetModelStatusResponseSchema = z.object({
  config: ModelStatusProbeConfigResponseSchema,
  summary: z.object({
    enabledModels: IntSchema,
    green: IntSchema,
    yellow: IntSchema,
    red: IntSchema,
    unknown: IntSchema
  }),
  models: z.array(ModelStatusProbeModelSchema),
  lastProbeTime: z.string().nullable()
});
export type GetModelStatusResponse = z.infer<typeof GetModelStatusResponseSchema>;

/** 触发全量模型探测接口响应 Schema */
export const RunModelStatusProbeResponseSchema = z.object({
  skipped: z.boolean(),
  testedAt: z.string(),
  records: z.array(ModelStatusProbeRecordSchema)
});
export type RunModelStatusProbeResponse = z.infer<typeof RunModelStatusProbeResponseSchema>;
