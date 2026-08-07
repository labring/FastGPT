import z from 'zod';

/**
 * v2 list 接口共享分页参数（形制对齐 PaginationSchema，契约收紧）。
 *
 * 注意：ListV2PaginationSchema 是 raw object（不含任何 refinement）——
 * Zod 4.1.12 下对含 refinement 的 object 调 .extend() 会在模块初始化时抛错
 * （"Object schemas containing refinements cannot be extended. Use .safeExtend() instead."），
 * 因此各资源 body schema 先 extend 此 raw object，再对最终 object 应用 v2PaginationMutualExclusion。
 */
export const V2PageSizeSchema = z.number().int().min(1).max(100).optional();
export const V2OffsetSchema = z.number().int().min(0).optional();
export const V2PageNumSchema = z.number().int().min(1).optional();

export const ListV2PaginationSchema = z.object({
  pageSize: V2PageSizeSchema,
  offset: V2OffsetSchema,
  pageNum: V2PageNumSchema
});
export type ListV2PaginationShape = z.infer<typeof ListV2PaginationSchema>;

/** offset 与 pageNum 互斥（二选一）；各资源 body schema 在最终 object 上应用 */
export const v2PaginationMutualExclusion = (v: ListV2PaginationShape, ctx: z.RefinementCtx) => {
  if (v.offset !== undefined && v.pageNum !== undefined) {
    ctx.addIssue({
      code: 'custom',
      message: 'offset 与 pageNum 互斥，二选一'
    });
  }
};
