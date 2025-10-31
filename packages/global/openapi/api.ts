import { z } from 'zod';

export const PaginationPropsSchema = <T extends z.ZodRawShape>(schema?: z.ZodObject<T>) => {
  // Create base shape with pageSize and optional pagination fields
  const baseShape = {
    pageSize: z.union([z.number(), z.string()]),
    offset: z.union([z.number(), z.string()]).optional(),
    pageNum: z.union([z.number(), z.string()]).optional()
  };

  if (schema) {
    // Merge custom schema fields with base pagination fields
    return z.object({
      ...baseShape,
      ...schema.shape
    });
  }

  return z.object(baseShape);
};
