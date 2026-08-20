import z from 'zod';

/** 查询有效材料的最小过滤条件；match 按材料字段直接映射到 `data.<field>`。 */
export const ActiveTmpDataFilterSchema = z.object({
  dataId: z.string().min(1),
  match: z.record(z.string(), z.unknown()).optional()
});
export type ActiveTmpDataFilter = z.infer<typeof ActiveTmpDataFilterSchema>;
