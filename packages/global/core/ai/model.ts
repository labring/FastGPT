import { ModelTypeEnum } from './constants';
import z from 'zod';

const PriceTypeSchema = z.object({
  charsPointsPrice: z.number().optional(), // 1k chars=n points; 60s=n points;
  // If inputPrice is set, the input-output charging scheme is adopted
  inputPrice: z.number().optional(), // 1k tokens=n points
  outputPrice: z.number().optional() // 1k tokens=n points
});
type PriceType = z.infer<typeof PriceTypeSchema>;

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
  requestAuth: z.string().optional()
});
type BaseModelItemType = z.infer<typeof BaseModelItemSchema>;

export const LLMModelItemSchema = PriceTypeSchema.and(BaseModelItemSchema).and(
  z.object({
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

    // diff function model
    datasetProcess: z.boolean().optional(), // dataset
    usedInClassify: z.boolean().optional(), // classify
    usedInExtractFields: z.boolean().optional(), // extract fields
    usedInToolCall: z.boolean().optional(), // tool call
    useInEvaluation: z.boolean().optional(), // evaluation

    functionCall: z.boolean(),
    toolChoice: z.boolean(),

    defaultSystemChatPrompt: z.string().optional(),
    defaultConfig: z.record(z.string(), z.any()).optional(),
    fieldMap: z.record(z.string(), z.string()).optional(),

    // LLM
    isDefaultDatasetTextModel: z.boolean().optional(),
    isDefaultDatasetImageModel: z.boolean().optional(),
    isDefaultHelperBotModel: z.boolean().optional()
  })
);
export type LLMModelItemType = z.infer<typeof LLMModelItemSchema>;

export const EmbeddingModelItemSchema = PriceTypeSchema.and(BaseModelItemSchema).and(
  z.object({
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
  })
);
export type EmbeddingModelItemType = PriceType &
  BaseModelItemType & {
    type: ModelTypeEnum.embedding;
    defaultToken: number; // split text default token
    maxToken: number; // model max token
    weight: number; // training weight
    hidden?: boolean; // Disallow creation
    normalization?: boolean; // normalization processing
    batchSize?: number;
    defaultConfig?: Record<string, any>; // post request config
    dbConfig?: Record<string, any>; // Custom parameters for storage
    queryConfig?: Record<string, any>; // Custom parameters for query
  };

export const RerankModelItemSchema = PriceTypeSchema.and(BaseModelItemSchema).and(
  z.object({
    type: z.literal(ModelTypeEnum.rerank)
  })
);
export type RerankModelItemType = z.infer<typeof RerankModelItemSchema>;

export const TTSModelItemSchema = PriceTypeSchema.and(BaseModelItemSchema).and(
  z.object({
    type: z.literal(ModelTypeEnum.tts),
    voices: z.array(z.object({ label: z.string(), value: z.string() }))
  })
);
export type TTSModelType = z.infer<typeof TTSModelItemSchema>;

export const STTModelItemSchema = PriceTypeSchema.and(BaseModelItemSchema).and(
  z.object({
    type: z.literal(ModelTypeEnum.stt)
  })
);
export type STTModelType = z.infer<typeof STTModelItemSchema>;
