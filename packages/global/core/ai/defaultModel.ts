import { z } from 'zod';
import { ModelTypeEnum } from './constants';

/** 各业务槽位配置的默认模型稳定 ID。 */
export const ModelDefaultIdsSchema = z.object({
  [ModelTypeEnum.llm]: z.string().optional(),
  [ModelTypeEnum.embedding]: z.string().optional(),
  [ModelTypeEnum.tts]: z.string().optional(),
  [ModelTypeEnum.stt]: z.string().optional(),
  [ModelTypeEnum.rerank]: z.string().optional(),
  datasetTextLLM: z.string().optional(),
  datasetImageLLM: z.string().optional(),
  chatTitleLLM: z.string().optional()
});

export type ModelDefaultIds = z.infer<typeof ModelDefaultIdsSchema>;
