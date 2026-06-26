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

const PriceTypeSchema = z.object({
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

const BaseModelItemSchema = z.object({
  id: z.string(),
  provider: z.string(),
  model: z.string(),
  name: z.string(),
  avatar: z.string().optional(), // model icon, from provider

  isActive: z.boolean().optional(),
  isCustom: z.boolean().optional(),
  isTuned: z.boolean().optional(), // Whether this is a fine-tuned model created by training module
  isDefault: z.boolean().optional(),

  // If has requestUrl, it will request the model directly
  requestUrl: z.string().optional(),
  requestAuth: z.string().optional(),

  // Test mode: when enabled, classify/extract/tool call/evaluation scenarios are disabled
  testMode: z.boolean().optional(), // test mode flag

  // Permission fields
  tmbId: z.string().optional(),
  teamId: z.string().optional(),
  isShared: z.boolean().optional()
});
type BaseModelItemType = z.infer<typeof BaseModelItemSchema>;

export const LLMModelItemSchema = PriceTypeSchema.extend(BaseModelItemSchema.shape).extend({
  type: z.literal(ModelTypeEnum.llm),
  // Model params
  maxContext: z.number().default(16000),
  maxResponse: z.number().default(8000),
  quoteMaxToken: z.number().default(8000),
  maxTemperature: z.number().optional(),

  showTopP: z.boolean().optional(),
  responseFormatList: z.array(z.string()).optional(),
  showStopSign: z.boolean().optional(),

  censor: z.boolean().optional(),
  vision: z.boolean().optional(),
  reasoning: z.boolean().optional(),

  functionCall: z.boolean().default(true),
  toolChoice: z.boolean().default(true),

  defaultSystemChatPrompt: z.string().optional(),
  defaultConfig: z.record(z.string(), z.any()).optional(),
  fieldMap: z.record(z.string(), z.string()).optional(),

  // LLM
  isDefaultDatasetTextModel: z.boolean().optional(),
  isDefaultDatasetImageModel: z.boolean().optional(),
  isDefaultEvaluationModel: z.boolean().optional(),
  isDefaultHelperBotModel: z.boolean().optional(),

  /** @deprecated */
  datasetProcess: z.boolean().optional(), // dataset
  /** @deprecated */
  usedInClassify: z.boolean().optional(),
  /** @deprecated */
  usedInExtractFields: z.boolean().optional(),
  /** @deprecated */
  usedInToolCall: z.boolean().optional(),
  /** @deprecated */
  useInEvaluation: z.boolean().optional()
});
export type LLMModelItemType = z.infer<typeof LLMModelItemSchema>;

export const EmbeddingModelItemSchema = PriceTypeSchema.extend(BaseModelItemSchema.shape).extend({
  type: z.literal(ModelTypeEnum.embedding),
  defaultToken: z.number().default(512), // split text default token
  maxToken: z.number().default(512), // model max token
  weight: z.number().default(0), // training weight
  hidden: z.boolean().optional(), // Disallow creation
  normalization: z.boolean().optional(), // normalization processing
  dimensions: z.number().optional(), // vector dimensions (e.g. 1536 for ada-002, 3072 for text-embedding-3-large)
  batchSize: z.number().min(1), // batch request size
  defaultConfig: z.record(z.string(), z.any()).optional(), // post request config
  dbConfig: z.record(z.string(), z.any()).optional(), // Custom parameters for storage
  queryConfig: z.record(z.string(), z.any()).optional(), // Custom parameters for query
  instruction: z.string().optional(), // Instruction for instruction-aware models (e.g. qwen3-embedding)
  supportTrain: z.boolean().optional(), // Whether the model supports training
  trainTaskList: z.array(z.any()).optional() // Runtime: EmbeddingTrainTaskListItem[], injected for isTuned models
});
export type EmbeddingModelItemType = z.infer<typeof EmbeddingModelItemSchema>;

export const RerankModelItemSchema = PriceTypeSchema.extend(BaseModelItemSchema.shape).extend({
  type: z.literal(ModelTypeEnum.rerank),
  maxToken: z.number().default(3000), // max input token for rerank query + one document
  instruction: z.string().optional(), // Instruction for instruction-aware models
  supportTrain: z.boolean().optional(), // Whether the model supports training
  trainTaskList: z.array(z.any()).optional() // Runtime: RerankTrainTaskListItem[], injected for isTuned models
});
export type RerankModelItemType = z.infer<typeof RerankModelItemSchema>;

export const TTSModelItemSchema = PriceTypeSchema.extend(BaseModelItemSchema.shape).extend({
  type: z.literal(ModelTypeEnum.tts),
  voices: z.array(z.object({ label: z.string(), value: z.string() })).default([])
});
export type TTSModelType = z.infer<typeof TTSModelItemSchema>;

export const STTModelItemSchema = PriceTypeSchema.extend(BaseModelItemSchema.shape).extend({
  type: z.literal(ModelTypeEnum.stt)
});
export type STTModelType = z.infer<typeof STTModelItemSchema>;
