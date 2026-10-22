import z from 'zod';
import { IntSchema } from '../../../common/zod';

/** 行数仅缓存在 Redis；Mongo 内部元数据只记录 PG 局部索引的生命周期。 */
export const DatasetVectorDataSchema = z.object({
  pgIndex: z.enum(['none', 'pending', 'building', 'ready', 'failed']),
  pgIndexCheckedAt: z.date()
});
export type DatasetVectorData = z.infer<typeof DatasetVectorDataSchema>;

/** 一次召回共享同一份路由快照，避免多个 query 重复统计知识库。 */
export const DatasetVectorSearchDataSchema = z.object({
  datasetId: z.string(),
  rows: IntSchema,
  pgIndex: DatasetVectorDataSchema.shape.pgIndex
});
export type DatasetVectorSearchData = z.infer<typeof DatasetVectorSearchDataSchema>;
