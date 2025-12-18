import { z } from 'zod';

export const PaginationSchema = z.object({
  pageSize: z.union([z.number(), z.string()]).optional(),
  offset: z.union([z.number(), z.string()]).optional(),
  pageNum: z.union([z.number(), z.string()]).optional()
});
export type PaginationType = z.infer<typeof PaginationSchema>;

export const PaginationResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    total: z.number().optional().default(0),
    list: z.array(itemSchema).optional().default([])
  });
export type PaginationResponseType<T extends z.ZodTypeAny> = z.infer<
  ReturnType<typeof PaginationResponseSchema<T>>
>;
