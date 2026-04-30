import type { RequireOnlyOne } from '../common/type/utils';
import z from 'zod';

/* 按 offset 分页 */
export const PaginationSchema = z.object({
  pageSize: z.union([z.number(), z.string()]).optional().describe('每页条数'),
  offset: z.union([z.number(), z.string()]).optional().describe('偏移量(与页码二选一)'),
  pageNum: z.union([z.number(), z.string()]).optional().describe('页码(与偏移量二选一)')
});
export type PaginationType = z.infer<typeof PaginationSchema>;

export type PaginationProps<T = {}> = T & {
  pageSize: number | string;
} & RequireOnlyOne<{
    offset: number | string;
    pageNum: number | string;
  }>;

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
    pageSize: z
      .int()
      .positive()
      .optional()
      .default(10)
      .meta({ example: 15, description: '每页条数' }),
    anchor: z.any().optional().meta({ description: '当前锚点（如 chunkIndex）' }),
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

export type LinkedPaginationProps<T = {}, A = any> = T & {
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
            anchor: z.any().optional().meta({ description: '锚点值' })
          })
        )
      )
      .meta({ description: '数据列表' }),
    hasMorePrev: z.boolean().meta({ example: false, description: '是否还有更多前置数据' }),
    hasMoreNext: z.boolean().meta({ example: true, description: '是否还有更多后置数据' })
  });

export type LinkedListResponse<T = {}, A = any> = {
  list: Array<T & { id: string; anchor?: A }>;
  hasMorePrev: boolean;
  hasMoreNext: boolean;
};

// Backward-compatible alias for older callers that still import PaginationResponse.
export type PaginationResponse<T = any> = PaginationResponseType<T>;
