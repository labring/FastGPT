import { z } from 'zod';

export const PaginationSchema = z.object({
  pageSize: z.union([z.number(), z.string()]),
  offset: z.union([z.number(), z.string()]).optional(),
  pageNum: z.union([z.number(), z.string()]).optional()
});
export const PaginationResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    total: z.number(),
    list: z.array(itemSchema)
  });
