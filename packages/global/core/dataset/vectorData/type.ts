import z from 'zod';
import { IntSchema } from '../../../common/zod';

/** 行数仅缓存在 Redis；Mongo 内部元数据按提供商记录局部索引生命周期。 */
export const DatasetVectorIndexStateSchema = z.enum([
  'none',
  'pending',
  'building',
  'ready',
  'removing',
  'failed'
]);
export const DatasetVectorDataSchema = z.object({
  pgIndex: DatasetVectorIndexStateSchema.optional(),
  pgIndexCheckedAt: z.date().optional(),
  openGaussIndex: DatasetVectorIndexStateSchema.optional(),
  openGaussIndexCheckedAt: z.date().optional()
});
export type DatasetVectorData = z.infer<typeof DatasetVectorDataSchema>;

/** 一次召回共享同一份路由快照，避免多个 query 重复统计知识库。 */
export const DatasetVectorSearchDataSchema = z.object({
  datasetId: z.string(),
  rows: IntSchema,
  pgIndex: DatasetVectorIndexStateSchema.optional(),
  openGaussIndex: DatasetVectorIndexStateSchema.optional()
});
export type DatasetVectorSearchData = z.infer<typeof DatasetVectorSearchDataSchema>;
