import type { RequireOnlyOne } from '../common/type/utils';
import { IntSchema } from '../common/zod';
import { JsonValueOpenApiMeta } from '../common/zod/openapi';
import z from 'zod';

export const PaginationPageSizeLimit = 500;

/** 通用分页默认每页 20 条，超限自动截断；业务接口可缩小条数上限。 */
export const PaginationPageSizeSchema = IntSchema.positive()
  .overwrite((value) => Math.min(value, PaginationPageSizeLimit))
  .max(PaginationPageSizeLimit)
  .default(20)
  .meta({
    example: 20,
    description: `每页条数，默认 20，最大 ${PaginationPageSizeLimit}，超出自动按 ${PaginationPageSizeLimit} 处理`
  });

/** 缺省按第一页查询；保留可选类型，允许客户端省略该字段。 */
export const PaginationPageNumSchema = IntSchema.positive().default(1).optional().meta({
  example: 1,
  description: '页码，从 1 开始；传入 offset 时忽略'
});

/**
 * 将业务筛选字段与互斥分页分支组合。offset 分支优先并移除页码字段；
 * 无 offset 时按页码查询，默认第一页。pageShape 用于兼容 Skill 的 page 字段。
 * 无效 offset 不得回退为页码查询；两种模式都保留业务字段及各自的默认值。
 */
export const createPaginationSchema = <
  TShape extends z.ZodRawShape = Record<never, never>,
  TPageShape extends z.ZodRawShape = { pageNum: typeof PaginationPageNumSchema }
>(
  extraShape?: TShape,
  pageShape?: TPageShape
) => {
  const resolvedPageShape = (pageShape ?? { pageNum: PaginationPageNumSchema }) as TPageShape;
  const ignoredPageField = z.never().optional().catch(undefined);
  const ignoredPageShape = Object.fromEntries(
    Object.keys(resolvedPageShape).map((key) => [key, ignoredPageField])
  ) as { [Key in keyof TPageShape]: typeof ignoredPageField };
  const commonSchema = z
    .object({
      offset: IntSchema.meta({ example: 0, description: '偏移量，从 0 开始' })
    })
    // 分支定位字段先展示，便于在格式选择下直接看到 offset 或页码，再设置每页条数。
    .extend(resolvedPageShape)
    .extend({ pageSize: PaginationPageSizeSchema.optional() })
    .extend(extraShape ?? ({} as TShape));

  return z.union([
    commonSchema
      .extend(ignoredPageShape)
      .extend({ offset: commonSchema.shape.offset.nonoptional() })
      .overwrite((value) => {
        const result = { ...value };
        // catch 只负责忽略页码校验，仍需删除属性，保证解析结果中只有一种定位字段。
        Object.keys(resolvedPageShape).forEach((key) => Reflect.deleteProperty(result, key));
        return result;
      })
      .meta({ title: '按偏移量获取' }),
    commonSchema
      .extend(resolvedPageShape)
      .extend({ offset: z.never().optional() })
      .meta({ title: '按页码获取' })
  ]);
};

/** 通用分页二选一；各业务接口通过 createPaginationSchema 组合字段及每页条数的默认值。 */
export const PaginationSchema = createPaginationSchema();
export type PaginationType = z.infer<typeof PaginationSchema>;

export type PaginationProps<T = unknown> = T &
  Required<Pick<PaginationType, 'pageSize'>> &
  RequireOnlyOne<Pick<PaginationType, 'offset' | 'pageNum'>>;

export const PaginationResponseSchema = <T extends z.ZodTypeAny>(
  itemSchema: T
): z.ZodObject<{
  total: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
  list: z.ZodDefault<z.ZodOptional<z.ZodArray<T>>>;
}> =>
  z.object({
    total: z.number().optional().default(0),
    list: z.array(itemSchema).optional().default([])
  });
export type PaginationResponseType<T = any> = {
  total: number;
  list: T[];
};

/* 按 cursor 分页 */

export const LinkedPaginationSchema = <TShape extends z.ZodRawShape>(extraShape?: TShape) =>
  z.object({
    pageSize: PaginationPageSizeSchema,
    anchor: z
      .any()
      .optional()
      .meta({ ...JsonValueOpenApiMeta, description: '当前锚点（如 chunkIndex）' }),
    initialId: z.string().optional().meta({
      example: '68ad85a7463006c963799a05',
      description: '初始定位数据 ID'
    }),
    nextId: z.string().optional().meta({
      example: '68ad85a7463006c963799a06',
      description: '向后翻页的游标 ID'
    }),
    prevId: z.string().optional().meta({
      example: '68ad85a7463006c963799a04',
      description: '向前翻页的游标 ID'
    }),
    ...(extraShape ?? ({} as TShape))
  });

export type LinkedPaginationProps<T = unknown, A = any> = T & {
  pageSize: number;
  anchor?: A;
  initialId?: string;
  nextId?: string;
  prevId?: string;
};

export const LinkedListResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    list: z
      .array(
        z.intersection(
          itemSchema,
          z.object({
            id: z.string().meta({ example: '68ad85a7463006c963799a05', description: '数据 ID' }),
            anchor: z
              .any()
              .optional()
              .meta({ ...JsonValueOpenApiMeta, description: '锚点值' })
          })
        )
      )
      .meta({ description: '数据列表' }),
    hasMorePrev: z.boolean().meta({ example: false, description: '是否还有更多前置数据' }),
    hasMoreNext: z.boolean().meta({ example: true, description: '是否还有更多后置数据' })
  });

export type LinkedListResponse<T = unknown, A = any> = {
  list: Array<T & { id: string; anchor?: A }>;
  hasMorePrev: boolean;
  hasMoreNext: boolean;
};

// Backward-compatible alias for older callers that still import PaginationResponse.
export type PaginationResponse<T = any> = PaginationResponseType<T>;
