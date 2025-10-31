import { z } from 'zod';

export const PaginationSchema = z.object({
  pageSize: z.union([z.number(), z.string()]),
  offset: z.union([z.number(), z.string()]).optional(),
  pageNum: z.union([z.number(), z.string()]).optional()
});
