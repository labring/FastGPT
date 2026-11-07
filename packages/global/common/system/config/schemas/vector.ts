import z from 'zod';
import { positiveInteger } from './primitives';

export const VectorConfigSchema = z.strictObject({
  hnswEfSearch: positiveInteger(200),
  // 商业版所有向量库召回共享的并发上限，0 表示不限制
  vectorRecallConcurrency: z.number().int().min(0).max(1000).default(0)
});
