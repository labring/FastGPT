import type { RequireOnlyOne } from '../common/type/utils';
import { IntSchema } from '../common/zod';
import { JsonValueOpenApiMeta } from '../common/zod/openapi';
import z from 'zod';

export const PaginationPageSizeLimit = 500;

const paginationPresentation = {
  'x-fastgpt-union-group': { id: 'pagination', label: '分页参数' }
};

/** 通用分页默认每页 20 条，超限自动截断；业务接口可缩小条数上限。 */
export const PaginationPageSizeSchema = IntSchema.positive()
  .overwrite((value) => Math.min(value, PaginationPageSizeLimit))
  .max(PaginationPageSizeLimit)
  .default(20)
  .meta({
    ...paginationPresentation,
    example: 20,
    description: `每页条数，默认 20，最大 ${PaginationPageSizeLimit}，超出自动按 ${PaginationPageSizeLimit} 处理`
  });

/** 缺省按第一页查询；保留可选类型，允许客户端省略该字段。 */
export const PaginationPageNumSchema = IntSchema.positive()
  .default(1)
  .optional()
  .meta({
    ...paginationPresentation,
    'x-fastgpt-union-parameter': true,
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
      offset: IntSchema.meta({
        ...paginationPresentation,
        'x-fastgpt-union-parameter': true,
        example: 0,
        description: '偏移量，从 0 开始'
      })
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
      .meta({
        title: '按偏移量获取',
        description: '通过 offset 指定起始位置，从 0 开始；同时传入页码时优先使用 offset。'
      }),
    commonSchema.extend(resolvedPageShape).extend({ offset: z.never().optional() }).meta({
      title: '按页码获取',
      description: '通过页码获取，默认第 1 页；pageSize 控制每页条数。'
    })
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

/**
 * 链式分页只有前翻、后翻、初始定位、默认页四种互斥模式。
 * 额外业务字段及分页限制应用于所有分支；未选中的 ID 显式禁止，避免 union 静默丢弃冲突参数。
 */
export const LinkedPaginationSchema = <TShape extends z.ZodRawShape = Record<never, never>>(
  extraShape?: TShape
) => {
  const commonSchema = z
    .object({
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
      })
    })
    .extend(extraShape ?? ({} as TShape));

  const noPosition = {
    prevId: z.never().optional(),
    nextId: z.never().optional(),
    initialId: z.never().optional()
  };
  return z
    .union([
      commonSchema
        .extend({ ...noPosition, prevId: commonSchema.shape.prevId.nonoptional() })
        .meta({ title: '向前翻页' }),
      commonSchema
        .extend({ ...noPosition, nextId: commonSchema.shape.nextId.nonoptional() })
        .meta({ title: '向后翻页' }),
      commonSchema
        .extend({ ...noPosition, initialId: commonSchema.shape.initialId.nonoptional() })
        .meta({ title: '定位记录' }),
      commonSchema.extend(noPosition).meta({ title: '默认页' })
    ])
    .meta({
      // OpenAPI 生成器会隐藏 never 字段，补充排斥约束以保留 union 的运行时互斥语义。
      not: {
        anyOf: [
          { required: ['prevId', 'nextId'] },
          { required: ['prevId', 'initialId'] },
          { required: ['nextId', 'initialId'] }
        ]
      }
    });
};

/** 从通用 schema 推导互斥参数，并保留业务自定义 anchor 类型的能力。 */
export type LinkedPaginationProps<T = unknown, A = any> = T &
  z.infer<ReturnType<typeof LinkedPaginationSchema<{ anchor: z.ZodOptional<z.ZodType<A>> }>>>;

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
