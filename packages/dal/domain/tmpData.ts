import z from 'zod';

/** 身份验证材料在 DAL 侧的最小形状，字段语义与旧 tmp_datas 集合一致。 */
export const TmpDataMaterialSchema = z.object({
  dataId: z.string().min(1),
  data: z.unknown(),
  expireAt: z.date()
});
export type TmpDataMaterial = z.infer<typeof TmpDataMaterialSchema>;

/** 查询有效材料的最小过滤条件；match 按材料字段直接映射到 `data.<field>`。 */
export const ActiveTmpDataFilterSchema = z.object({
  dataId: z.string().min(1),
  match: z.record(z.string(), z.unknown()).optional()
});
export type ActiveTmpDataFilter = z.infer<typeof ActiveTmpDataFilterSchema>;
