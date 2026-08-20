import z from 'zod';

/** 身份验证材料在 DAL 侧的最小实体形状，字段语义与旧 tmp_datas 集合一致。 */
export const TmpDataMaterialSchema = z.object({
  dataId: z.string().min(1),
  data: z.unknown(),
  expireAt: z.date()
});
export type TmpDataMaterial = z.infer<typeof TmpDataMaterialSchema>;

export type TmpDataWrite = Pick<TmpDataMaterial, 'dataId' | 'data' | 'expireAt'>;
