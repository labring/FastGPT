import z from 'zod';
import { ModelTypeEnum } from '../../../../core/ai/constants';
import {
  LLMModelItemSchema,
  EmbeddingModelItemSchema,
  TTSModelItemSchema,
  STTModelItemSchema,
  RerankModelItemSchema,
  ModelPriceTierSchema
} from '../../../../core/ai/model/type';
import { PaginationResponseSchema } from '../../../api';
import { PermissionSchema } from '../../../../support/permission/controller';
import { SourceMemberSchema } from '../../../../support/user/type';
import { IntSchema } from '../../../../common/zod';

// ═══ Shared model schema (design §3.1) ═══
export const SystemModelItemSchema = z.discriminatedUnion('type', [
  LLMModelItemSchema,
  EmbeddingModelItemSchema,
  TTSModelItemSchema,
  STTModelItemSchema,
  RerankModelItemSchema
]);
export type SystemModelItem = z.infer<typeof SystemModelItemSchema>;

// ═══ POST /api/core/ai/model/list ═══
export const ListModelsBodySchema = z.object({
  provider: z.string().optional().meta({ description: '按提供商过滤' }),
  type: z.string().optional().meta({ description: '按模型类型过滤' }),
  search: z.string().optional().meta({ description: '按 modelId/model/name/创建人搜索' }),
  isActive: z.enum(['active', 'inactive']).optional().meta({ description: '按激活状态过滤' }),
  isSystem: z
    .boolean()
    .optional()
    .meta({ description: '按是否系统模型过滤（双 Tab：系统模型/团队模型）' }),
  pageSize: IntSchema.optional().meta({ description: '每页条数，不传返回全量' }),
  pageNum: IntSchema.optional().meta({ description: '页码，从 1 开始' }),
  offset: IntSchema.optional().meta({ description: '偏移量' }),
  resourceContext: z
    .object({
      appId: z.string().optional(),
      datasetId: z.string().optional()
    })
    .optional()
    .meta({ description: '资源上下文，仅用于回显资源已引用的模型' })
});
export type ListModelsBody = z.infer<typeof ListModelsBodySchema>;

export const ModelListItemSchema = z.object({
  id: z.string(),
  type: z.enum(ModelTypeEnum),
  provider: z.string(),
  model: z.string(),
  name: z.string(),
  avatar: z.string().optional(),
  isActive: z.boolean(),
  isSystem: z.boolean(),
  testMode: z.boolean().optional(),
  charsPointsPrice: z.number().optional(),
  inputPrice: z.number().optional(),
  outputPrice: z.number().optional(),
  priceTiers: z.array(ModelPriceTierSchema).optional(),
  contextToken: z.number().optional(),
  quoteMaxToken: z.number().optional(),
  hidden: z.boolean().optional(),
  vision: z.boolean().optional(),
  audio: z.boolean().optional(),
  video: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  toolChoice: z.boolean().optional(),
  channelCount: z.number().optional(),
  sourceMember: SourceMemberSchema.optional(),
  permission: PermissionSchema
});
export type ModelListItem = z.infer<typeof ModelListItemSchema>;

export const ListModelsResponseSchema = PaginationResponseSchema(ModelListItemSchema).extend({
  pageNum: z.number().optional(),
  pageSize: z.number().optional(),
  activeTotal: z.number().optional()
});
export type ListModelsPaginationResponse = z.infer<typeof ListModelsResponseSchema>;

// ═══ GET /api/core/ai/model/detail ═══
export const GetModelDetailQuerySchema = z.object({
  id: z.string().meta({ example: '68ad85a7463006c963799a05', description: '模型 ID' }),
  appId: z.string().optional(),
  datasetId: z.string().optional()
});
export type GetModelDetailQuery = z.infer<typeof GetModelDetailQuerySchema>;

export const GetModelDetailResponseSchema = SystemModelItemSchema;
export type GetModelDetailResponse = z.infer<typeof GetModelDetailResponseSchema>;

// ═══ POST /api/core/ai/model/create ═══
export const CreateModelBodySchema = z.discriminatedUnion('type', [
  LLMModelItemSchema.omit({ id: true }),
  EmbeddingModelItemSchema.omit({ id: true }),
  TTSModelItemSchema.omit({ id: true }),
  STTModelItemSchema.omit({ id: true }),
  RerankModelItemSchema.omit({ id: true })
]);
export type CreateModelBody = z.infer<typeof CreateModelBodySchema>;

export const CreateModelResponseSchema = z.object({
  id: z.string().meta({ example: '68ad85a7463006c963799a05', description: '新创建的模型 ID' })
});
export type CreateModelResponse = z.infer<typeof CreateModelResponseSchema>;

// ═══ PUT /api/core/ai/model/update ═══
const _AllPartialModelFields = LLMModelItemSchema.omit({ id: true, type: true })
  .partial()
  .extend(EmbeddingModelItemSchema.omit({ id: true, type: true }).partial().shape)
  .extend(TTSModelItemSchema.omit({ id: true, type: true }).partial().shape)
  .extend(STTModelItemSchema.omit({ id: true, type: true }).partial().shape)
  .extend(RerankModelItemSchema.omit({ id: true, type: true }).partial().shape);

export const UpdateModelBodySchema = z
  .object({
    id: z.string().meta({ example: '68ad85a7463006c963799a05', description: '模型 ID' }),
    type: z.enum(ModelTypeEnum).optional().meta({ description: '模型类型' })
  })
  .extend(_AllPartialModelFields.shape);
export type UpdateModelBody = z.infer<typeof UpdateModelBodySchema>;

export const UpdateModelResponseSchema = z.undefined().meta({ description: '操作成功' });
export type UpdateModelResponse = z.infer<typeof UpdateModelResponseSchema>;

// ═══ DELETE /api/core/ai/model/delete ═══
export const DeleteModelQuerySchema = z.object({
  id: z.string().meta({ example: '68ad85a7463006c963799a05', description: '模型 ID' })
});
export type DeleteModelQuery = z.infer<typeof DeleteModelQuerySchema>;

// refChannelCount: same-upstream-name channel references in the model's own
// bucket (F2-S3 hint; channels route by name and keep working after the delete).
export const DeleteModelResponseSchema = z.object({
  refChannelCount: z.number().meta({ description: '同上游名渠道引用数（仅统计同归属桶内渠道）' })
});
export type DeleteModelResponse = z.infer<typeof DeleteModelResponseSchema>;

// ═══ GET /api/core/ai/model/test ═══
export const TestModelQuerySchema = z.object({
  id: z.string().meta({ example: '68ad85a7463006c963799a05', description: '模型 ID' }),
  channelId: IntSchema.optional().meta({ description: '指定渠道 ID 测试' })
});
export type TestModelQuery = z.infer<typeof TestModelQuerySchema>;

export const TestModelResponseSchema = z.union([
  z.string(),
  z.object({
    tokens: z.number(),
    vectors: z.array(z.array(z.number()))
  }),
  z.undefined()
]);
export type TestModelResponse = z.infer<typeof TestModelResponseSchema>;

// ═══ GET /api/core/ai/model/getConfigJson ═══
export const GetConfigJsonResponseSchema = z.string().meta({
  description: '模型配置 JSON 字符串'
});
export type GetConfigJsonResponse = z.infer<typeof GetConfigJsonResponseSchema>;

// ═══ GET /api/core/ai/model/templates ═══
export const GetModelTemplatesQuerySchema = z.object({
  provider: z.string().optional().meta({ description: '按提供商过滤' }),
  type: z.string().optional().meta({ description: '按模型类型过滤' }),
  search: z.string().optional().meta({ description: '按 model/name 搜索' })
});
export type GetModelTemplatesQuery = z.infer<typeof GetModelTemplatesQuerySchema>;

export const ModelTemplateSchema = z.object({
  provider: z.string(),
  type: z.enum(ModelTypeEnum),
  model: z.string(),
  name: z.string(),
  avatar: z.string().optional(),
  defaultConfig: z.record(z.string(), z.any()).optional(),
  fieldMap: z.record(z.string(), z.string()).optional(),
  maxContext: z.number().optional(),
  maxResponse: z.number().optional(),
  vision: z.boolean().optional(),
  functionCall: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  toolChoice: z.boolean().optional(),
  voices: z.array(z.object({ label: z.string(), value: z.string() })).optional()
});
export const GetModelTemplatesResponseSchema = z.object({
  templates: z.array(ModelTemplateSchema)
});
export type GetModelTemplatesResponse = z.infer<typeof GetModelTemplatesResponseSchema>;

// ═══ GET /api/core/ai/model/getSystemDefault ═══
export const GetSystemDefaultModelResponseSchema = z.object({
  llm: z.object({ id: z.string(), model: z.string(), name: z.string() }).optional().nullable(),
  embedding: z
    .object({ id: z.string(), model: z.string(), name: z.string() })
    .optional()
    .nullable(),
  tts: z.object({ id: z.string(), model: z.string(), name: z.string() }).optional().nullable(),
  stt: z.object({ id: z.string(), model: z.string(), name: z.string() }).optional().nullable(),
  rerank: z.object({ id: z.string(), model: z.string(), name: z.string() }).optional().nullable(),
  datasetTextLLM: z
    .object({ id: z.string(), model: z.string(), name: z.string() })
    .optional()
    .nullable(),
  datasetImageLLM: z
    .object({ id: z.string(), model: z.string(), name: z.string() })
    .optional()
    .nullable(),
  chatTitleLLM: z
    .object({ id: z.string(), model: z.string(), name: z.string() })
    .optional()
    .nullable(),
  helperBotLLM: z
    .object({ id: z.string(), model: z.string(), name: z.string() })
    .optional()
    .nullable()
});
export type GetSystemDefaultModelResponse = z.infer<typeof GetSystemDefaultModelResponseSchema>;

// ═══ PUT /api/core/ai/model/updateSystemDefault ═══
export const UpdateSystemDefaultModelBodySchema = z.object({
  llmId: z.string().nullable().optional(),
  embeddingId: z.string().nullable().optional(),
  ttsId: z.string().nullable().optional(),
  sttId: z.string().nullable().optional(),
  rerankId: z.string().nullable().optional(),
  datasetTextLLMId: z.string().nullable().optional(),
  datasetImageLLMId: z.string().nullable().optional(),
  chatTitleLLMId: z.string().nullable().optional(),
  helperBotLLMId: z.string().nullable().optional()
});
export type UpdateSystemDefaultModelBody = z.infer<typeof UpdateSystemDefaultModelBodySchema>;

export const UpdateSystemDefaultModelResponseSchema = z
  .undefined()
  .meta({ description: '操作成功' });
export type UpdateSystemDefaultModelResponse = z.infer<
  typeof UpdateSystemDefaultModelResponseSchema
>;

// ═══ PUT /api/core/ai/model/updateWithJson ═══
// Union of all model-type fields (id/type omitted), made partial for bulk import/update.
// Reuses `_AllPartialModelFields` declared above (shared with UpdateModelBodySchema).
export const SystemModelConfigJsonItemSchema = z
  .object({
    id: z
      .string()
      .optional()
      .meta({ description: '模型 ID，更新时必填；创建时留空由 upsert 自动生成' }),
    type: z.enum(ModelTypeEnum).optional().meta({ description: '模型类型' })
  })
  .extend(_AllPartialModelFields.shape);
export type SystemModelConfigJsonItem = z.infer<typeof SystemModelConfigJsonItemSchema>;

export const UpdateWithJsonBodySchema = z.object({
  config: z.string().meta({
    example: '[{"model":"gpt-4o","type":"llm","name":"GPT-4o","provider":"openai"}]',
    description: '模型配置 JSON 字符串'
  })
});
export type UpdateWithJsonBody = z.infer<typeof UpdateWithJsonBodySchema>;

export const UpdateWithJsonResponseSchema = z.undefined().meta({ description: '操作成功' });
export type UpdateWithJsonResponse = z.infer<typeof UpdateWithJsonResponseSchema>;

// ═══ POST /api/core/ai/model/usageLogs ═══
// Model-dimension call log (design §14.1): lists usage_items restricted to the
// models the current user can access (AUTH-TC08). `search` matches the creator
// username; legacy records without modelId fall back to the upstream model name.
export const UsageLogBodySchema = z.object({
  modelId: z.string().optional().meta({ description: '按模型过滤（必须是可访问模型）' }),
  type: z.enum(ModelTypeEnum).optional().meta({ description: '按模型类型过滤' }),
  search: z.string().optional().meta({ description: '按创建人用户名搜索' }),
  dateStart: z.string().optional().meta({ description: '开始时间（ISO 字符串）' }),
  dateEnd: z.string().optional().meta({ description: '结束时间（ISO 字符串）' }),
  pageSize: IntSchema.optional().meta({ description: '每页条数' }),
  pageNum: IntSchema.optional().meta({ description: '页码，从 1 开始' }),
  offset: IntSchema.optional().meta({ description: '偏移量' })
});
export type UsageLogBody = z.infer<typeof UsageLogBodySchema>;

export const UsageLogItemSchema = z.object({
  id: z.string(),
  time: z.string().datetime(),
  modelId: z.string().optional(),
  model: z.string().optional(),
  name: z.string().optional(),
  type: z.enum(ModelTypeEnum).optional(),
  totalPoints: z.number(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  sourceMember: SourceMemberSchema.optional()
});
export type UsageLogItem = z.infer<typeof UsageLogItemSchema>;

export const UsageLogResponseSchema = PaginationResponseSchema(UsageLogItemSchema).extend({
  pageNum: z.number().optional(),
  pageSize: z.number().optional()
});
export type UsageLogPaginationResponse = z.infer<typeof UsageLogResponseSchema>;

// ═══ POST /api/core/ai/model/usageStats ═══
// Model monitor aggregates (design §14.2) over usage_items, restricted to the
// accessible model set (AUTH-TC08).
export const UsageStatsBodySchema = z.object({
  modelId: z.string().optional().meta({ description: '按模型过滤（必须是可访问模型）' }),
  type: z.enum(ModelTypeEnum).optional().meta({ description: '按模型类型过滤' }),
  dateStart: z.string().optional().meta({ description: '开始时间（ISO 字符串）' }),
  dateEnd: z.string().optional().meta({ description: '结束时间（ISO 字符串）' }),
  unit: z.enum(['day']).optional().default('day').meta({ description: '趋势聚合颗粒度' }),
  timezone: z.string().optional().default('+00:00').meta({ description: '趋势按日分桶时区' })
});
export type UsageStatsBody = z.infer<typeof UsageStatsBodySchema>;

export const UsageStatsResponseSchema = z.object({
  totalCalls: z.number().meta({ description: '总调用次数（usage item 条数）' }),
  totalTokens: z.number().meta({ description: '总 Token（inputTokens + outputTokens）' }),
  totalPoints: z.number().meta({ description: '总积分消耗（usage_items.amount 合计）' }),
  trend: z
    .array(
      z.object({
        date: z.string().meta({ description: 'YYYY-MM-DD' }),
        calls: z.number(),
        tokens: z.number(),
        points: z.number()
      })
    )
    .meta({ description: '按日调用趋势（升序）' }),
  modelDistribution: z
    .array(
      z.object({
        modelId: z.string(),
        name: z.string().meta({ description: '展示名（解析失败时回退 model）' }),
        calls: z.number(),
        points: z.number()
      })
    )
    .meta({ description: '按模型分布（积分降序）' })
});
export type UsageStatsResponse = z.infer<typeof UsageStatsResponseSchema>;
