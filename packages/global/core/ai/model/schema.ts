/* v8 ignore file */
import { ModelScopeEnum, ModelTypeEnum } from '../constants';
import { ObjectIdSchema } from '../../../common/type/mongo';
import z from 'zod';

export const ModelPriceTierSchema = z
  .object({
    minInputTokens: z.number().min(0).optional().meta({
      description: '最小输入 tokens 值，单位: k/tokens'
    }),
    maxInputTokens: z.number().min(0).nullish().meta({
      description: '最大输入 tokens 值，单位: k/tokens. 如果未提供，则视为无限大梯度。'
    }),
    inputPrice: z.number(),
    outputPrice: z.number()
  })
  .meta({
    description: '模型价格梯度, 为左开右闭规则。'
  });
export type ModelPriceTierType = z.infer<typeof ModelPriceTierSchema>;

export const PriceTypeSchema = z.object({
  charsPointsPrice: z.number().optional(), // 1k chars=n points; 60s=n points;
  // 新版的梯度价格计算字段
  priceTiers: z.array(ModelPriceTierSchema).optional().meta({
    description:
      'The price tiers for this model. If not provided, the model will use the default price tiers.'
  }),

  /** @deprecated */
  inputPrice: z.number().optional(), // 1k tokens=n points
  /** @deprecated */
  outputPrice: z.number().optional() // 1k tokens=n points
});
export type PriceType = z.infer<typeof PriceTypeSchema>;

/**
 * 模型类型专属配置。公共业务字段保留在 ai_models 顶层，只有不同类型之间存在差异的
 * 请求能力与默认参数进入 config，避免运行时将插件返回对象整体覆盖数据库配置。
 */
export const LLMModelConfigSchema = z.object({
  maxContext: z.number(),
  maxResponse: z.number(),
  quoteMaxToken: z.number(),
  // null 明确表示模型不支持或未配置温度，允许 API 与数据库保留这一语义。
  maxTemperature: z.number().nullish(),
  showTopP: z.boolean().optional(),
  responseFormatList: z.array(z.string()).optional(),
  showStopSign: z.boolean().optional(),
  censor: z.boolean().optional(),
  vision: z.boolean().optional(),
  audio: z.boolean().optional(),
  video: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  reasoningEffort: z.boolean().optional(),
  functionCall: z.boolean().optional(),
  toolChoice: z.boolean().optional(),
  defaultSystemChatPrompt: z.string().optional(),
  defaultConfig: z.record(z.string(), z.any()).optional(),
  fieldMap: z.record(z.string(), z.string()).optional()
});
export type LLMModelConfigType = z.infer<typeof LLMModelConfigSchema>;

export const EmbeddingModelConfigSchema = z.object({
  defaultToken: z.number(),
  maxToken: z.number(),
  weight: z.number().default(0),
  hidden: z.boolean().optional(),
  vision: z.boolean().optional(),
  normalization: z.boolean().optional(),
  batchSize: z.number().optional(),
  defaultConfig: z.record(z.string(), z.any()).optional(),
  dbConfig: z.record(z.string(), z.any()).optional(),
  queryConfig: z.record(z.string(), z.any()).optional()
});
export type EmbeddingModelConfigType = z.infer<typeof EmbeddingModelConfigSchema>;

export const RerankModelConfigSchema = z.object({
  maxToken: z.number().optional(),
  defaultConfig: z.record(z.string(), z.any()).optional()
});
export type RerankModelConfigType = z.infer<typeof RerankModelConfigSchema>;

export const TTSModelConfigSchema = z.object({
  voices: z.array(z.object({ label: z.string(), value: z.string() }))
});
export type TTSModelConfigType = z.infer<typeof TTSModelConfigSchema>;

export const STTModelConfigSchema = z.object({});
export type STTModelConfigType = z.infer<typeof STTModelConfigSchema>;

const AIModelDocumentBaseSchema = PriceTypeSchema.extend({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  name: z.string().trim().min(1),
  scope: z.nativeEnum(ModelScopeEnum).default(ModelScopeEnum.system),
  tmbId: ObjectIdSchema.nullish(),
  teamId: ObjectIdSchema.nullish(),
  isActive: z.boolean().optional(),
  requestUrl: z.string().optional(),
  requestAuth: z.string().optional(),
  testMode: z.boolean().optional()
});

export const LLMModelDocumentSchema = AIModelDocumentBaseSchema.extend({
  type: z.literal(ModelTypeEnum.llm),
  config: LLMModelConfigSchema
});

export const EmbeddingModelDocumentSchema = AIModelDocumentBaseSchema.extend({
  type: z.literal(ModelTypeEnum.embedding),
  config: EmbeddingModelConfigSchema
});

export const RerankModelDocumentSchema = AIModelDocumentBaseSchema.extend({
  type: z.literal(ModelTypeEnum.rerank),
  config: RerankModelConfigSchema
});

export const TTSModelDocumentSchema = AIModelDocumentBaseSchema.extend({
  type: z.literal(ModelTypeEnum.tts),
  config: TTSModelConfigSchema
});

export const STTModelDocumentSchema = AIModelDocumentBaseSchema.extend({
  type: z.literal(ModelTypeEnum.stt),
  config: STTModelConfigSchema
});

/** ai_models 持久化后的标准形态；modelId 由 MongoDB `_id` 提供，不重复存储。 */
export const AIModelDocumentDataSchema = z.discriminatedUnion('type', [
  LLMModelDocumentSchema,
  EmbeddingModelDocumentSchema,
  TTSModelDocumentSchema,
  STTModelDocumentSchema,
  RerankModelDocumentSchema
]);
export type AIModelDocumentDataType = z.infer<typeof AIModelDocumentDataSchema>;

/** 运行时模型数据。modelId 来自 MongoDB `_id`，avatar 由 provider 派生。 */
const RuntimeModelFields = {
  modelId: z.string(),
  avatar: z.string().optional()
};

export const LLMModelDataSchema = LLMModelDocumentSchema.extend(RuntimeModelFields);
export const EmbeddingModelDataSchema = EmbeddingModelDocumentSchema.extend(RuntimeModelFields);
export const TTSModelDataSchema = TTSModelDocumentSchema.extend(RuntimeModelFields);
export const STTModelDataSchema = STTModelDocumentSchema.extend(RuntimeModelFields);
export const RerankModelDataSchema = RerankModelDocumentSchema.extend(RuntimeModelFields);

export const AIModelDataSchema = z.discriminatedUnion('type', [
  LLMModelDataSchema,
  EmbeddingModelDataSchema,
  TTSModelDataSchema,
  STTModelDataSchema,
  RerankModelDataSchema
]);
export type AIModelDataType = z.infer<typeof AIModelDataSchema>;

/**
 * 模型引用只允许稳定 ID 与废弃的系统 model 标识。非空 modelId 必须优先解析，
 * 不得因 ID 无效而降级使用 model。
 */
export type ModelReferenceType = {
  modelId?: string | null;
  /** @deprecated 新数据只写 modelId。 */
  model?: string | null;
};

export type LLMModelDataType = Extract<AIModelDataType, { type: ModelTypeEnum.llm }>;
export type EmbeddingModelDataType = Extract<AIModelDataType, { type: ModelTypeEnum.embedding }>;
export type RerankModelDataType = Extract<AIModelDataType, { type: ModelTypeEnum.rerank }>;
export type TTSModelDataType = Extract<AIModelDataType, { type: ModelTypeEnum.tts }>;
export type STTModelDataType = Extract<AIModelDataType, { type: ModelTypeEnum.stt }>;
