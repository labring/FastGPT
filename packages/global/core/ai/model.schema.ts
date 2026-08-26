/* v8 ignore file */
import { ModelTypeEnum } from './constants';
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
 * 模型类型专属配置。公共业务字段保留在 system_models 顶层，只有不同类型之间存在差异的
 * 请求能力与默认参数进入 config，避免运行时将插件返回对象整体覆盖数据库配置。
 */
export const LLMModelConfigSchema = z.object({
  maxContext: z.number(),
  maxResponse: z.number(),
  quoteMaxToken: z.number(),
  maxTemperature: z.number().optional(),
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

const SystemModelDocumentBaseSchema = PriceTypeSchema.extend({
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  name: z.string().trim().min(1),
  isSystem: z.literal(true).default(true),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  requestUrl: z.string().optional(),
  requestAuth: z.string().optional(),
  testMode: z.boolean().optional()
});

export const LLMSystemModelDocumentSchema = SystemModelDocumentBaseSchema.extend({
  type: z.literal(ModelTypeEnum.llm),
  config: LLMModelConfigSchema,
  isDefaultDatasetTextModel: z.boolean().optional(),
  isDefaultDatasetImageModel: z.boolean().optional(),
  isDefaultChatTitleModel: z.boolean().optional()
});

export const EmbeddingSystemModelDocumentSchema = SystemModelDocumentBaseSchema.extend({
  type: z.literal(ModelTypeEnum.embedding),
  config: EmbeddingModelConfigSchema
});

export const RerankSystemModelDocumentSchema = SystemModelDocumentBaseSchema.extend({
  type: z.literal(ModelTypeEnum.rerank),
  config: RerankModelConfigSchema
});

export const TTSSystemModelDocumentSchema = SystemModelDocumentBaseSchema.extend({
  type: z.literal(ModelTypeEnum.tts),
  config: TTSModelConfigSchema
});

export const STTSystemModelDocumentSchema = SystemModelDocumentBaseSchema.extend({
  type: z.literal(ModelTypeEnum.stt),
  config: STTModelConfigSchema
});

/** system_models 持久化后的标准形态；modelId 由 MongoDB `_id` 提供，不重复存储。 */
export const SystemModelDocumentDataSchema = z.discriminatedUnion('type', [
  LLMSystemModelDocumentSchema,
  EmbeddingSystemModelDocumentSchema,
  TTSSystemModelDocumentSchema,
  STTSystemModelDocumentSchema,
  RerankSystemModelDocumentSchema
]);
export type SystemModelDocumentDataType = z.infer<typeof SystemModelDocumentDataSchema>;

/** 运行时模型数据。avatar 与 isCustom 都由 provider/plugin 信息派生。 */
const RuntimeSystemModelFields = {
  modelId: z.string(),
  avatar: z.string().optional(),
  isCustom: z.boolean()
};

export const LLMSystemModelDataSchema =
  LLMSystemModelDocumentSchema.extend(RuntimeSystemModelFields);
export const EmbeddingSystemModelDataSchema =
  EmbeddingSystemModelDocumentSchema.extend(RuntimeSystemModelFields);
export const TTSSystemModelDataSchema =
  TTSSystemModelDocumentSchema.extend(RuntimeSystemModelFields);
export const STTSystemModelDataSchema =
  STTSystemModelDocumentSchema.extend(RuntimeSystemModelFields);
export const RerankSystemModelDataSchema =
  RerankSystemModelDocumentSchema.extend(RuntimeSystemModelFields);

export const SystemModelDataSchema = z.discriminatedUnion('type', [
  LLMSystemModelDataSchema,
  EmbeddingSystemModelDataSchema,
  TTSSystemModelDataSchema,
  STTSystemModelDataSchema,
  RerankSystemModelDataSchema
]);
export type SystemModelDataType = z.infer<typeof SystemModelDataSchema>;

/**
 * 模型引用只允许稳定 ID 与废弃的系统 model 标识。modelId 存在时必须优先解析，
 * 不得因 ID 无效而降级使用 model。
 */
export type ModelReferenceType = {
  modelId?: string;
  /** @deprecated 新数据只写 modelId。 */
  model?: string;
};

export type LLMSystemModelDataType = Extract<SystemModelDataType, { type: ModelTypeEnum.llm }>;
export type EmbeddingSystemModelDataType = Extract<
  SystemModelDataType,
  { type: ModelTypeEnum.embedding }
>;
export type RerankSystemModelDataType = Extract<
  SystemModelDataType,
  { type: ModelTypeEnum.rerank }
>;
export type TTSSystemModelDataType = Extract<SystemModelDataType, { type: ModelTypeEnum.tts }>;
export type STTSystemModelDataType = Extract<SystemModelDataType, { type: ModelTypeEnum.stt }>;
