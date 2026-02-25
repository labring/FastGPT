import type { RequireOnlyOne } from '../common/type/utils';
import { z } from 'zod';

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

export const PaginationResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    total: z.number().optional().default(0),
    list: z.array(itemSchema).optional().default([])
  });
export type PaginationResponseType<T = any> = {
  total: number;
  list: T[];
};
