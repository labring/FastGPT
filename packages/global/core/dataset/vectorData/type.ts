import { z } from 'zod';

/** 内部向量统计快照：整个对象可缺省，但存在时四个字段必须完整。 */
export const DatasetVectorDataSchema = z.object({
  rows: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  rowsUpdatedAt: z.date(),
  pgIndex: z.enum(['none', 'pending', 'building', 'ready', 'failed']),
  pgIndexCheckedAt: z.date()
});

export type DatasetVectorDataType = z.infer<typeof DatasetVectorDataSchema>;
