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
  provider: z.string(),
  model: z.string(),
  name: z.string(),
  avatar: z.string().optional(), // model icon, from provider

  isActive: z.boolean().optional(),
  isCustom: z.boolean().optional(),
  isDefault: z.boolean().optional(),

  // If has requestUrl, it will request the model directly
  requestUrl: z.string().optional(),
  requestAuth: z.string().optional(),

  // Test mode: when enabled, classify/extract/tool call/evaluation scenarios are disabled
  testMode: z.boolean().optional() // test mode flag
});
type BaseModelItemType = z.infer<typeof BaseModelItemSchema>;

export const LLMModelItemSchema = PriceTypeSchema.extend(BaseModelItemSchema.shape).extend({
  type: z.literal(ModelTypeEnum.llm),
  // Model params
  maxContext: z.number(),
  maxResponse: z.number(),
  quoteMaxToken: z.number(),
  maxTemperature: z.number().optional(),

  showTopP: z.boolean().optional(),
  responseFormatList: z.array(z.string()).optional(),
  showStopSign: z.boolean().optional(),

  censor: z.boolean().optional(),
  vision: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  reasoningEffort: z.boolean().optional(),

  functionCall: z.boolean(),
  toolChoice: z.boolean(),

  defaultSystemChatPrompt: z.string().optional(),
  defaultConfig: z.record(z.string(), z.any()).optional(),
  fieldMap: z.record(z.string(), z.string()).optional(),

  // LLM
  isDefaultDatasetTextModel: z.boolean().optional(),
  isDefaultDatasetImageModel: z.boolean().optional(),
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
  defaultToken: z.number(), // split text default token
  maxToken: z.number(), // model max token
  weight: z.number(), // training weight
  hidden: z.boolean().optional(), // Disallow creation
  normalization: z.boolean().optional(), // normalization processing
  batchSize: z.number().optional(), // batch request size
  defaultConfig: z.record(z.string(), z.any()).optional(), // post request config
  dbConfig: z.record(z.string(), z.any()).optional(), // Custom parameters for storage
  queryConfig: z.record(z.string(), z.any()).optional() // Custom parameters for query
});
export type EmbeddingModelItemType = z.infer<typeof EmbeddingModelItemSchema>;

export const RerankModelItemSchema = PriceTypeSchema.extend(BaseModelItemSchema.shape).extend({
  type: z.literal(ModelTypeEnum.rerank),
  maxToken: z.number().optional() // max input token for rerank query + one document
});
export type RerankModelItemType = z.infer<typeof RerankModelItemSchema>;

export const TTSModelItemSchema = PriceTypeSchema.extend(BaseModelItemSchema.shape).extend({
  type: z.literal(ModelTypeEnum.tts),
  voices: z.array(z.object({ label: z.string(), value: z.string() }))
});
export type TTSModelType = z.infer<typeof TTSModelItemSchema>;

export const STTModelItemSchema = PriceTypeSchema.extend(BaseModelItemSchema.shape).extend({
  type: z.literal(ModelTypeEnum.stt)
});
export type STTModelType = z.infer<typeof STTModelItemSchema>;
