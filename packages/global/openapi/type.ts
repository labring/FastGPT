import { z } from 'zod';
import type { createDocument } from 'zod-openapi';

export type OpenAPIPath = Parameters<typeof createDocument>[0]['paths'];
export const getErrorResponse = ({
  code = 500,
  statusText = 'error',
  message = ''
}: {
  code?: number;
  statusText?: string;
  message?: string;
}) => {
  return z.object({
    code: z.literal(code),
    statusText: z.literal(statusText),
    message: z.literal(message),
    data: z.null().optional().default(null)
  });
};

export const formatSuccessResponse = <T>(data: T) => {
  return z.object({
    code: z.literal(200),
    statusText: z.string().optional().default(''),
    message: z.string().optional().default(''),
    data
  });
};

export const PaginationPropsSchema = z.object({
  pageSize: z.union([z.number(), z.string()]),
  // offset 和 pageNum 只能传其一
  offset: z.union([z.number(), z.string()]).optional(),
  pageNum: z.union([z.number(), z.string()]).optional()
});

export type PaginationPropsType = z.infer<typeof PaginationPropsSchema>;

export const PaginationResponseSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    total: z.number(),
    list: z.array(item)
  });
export type PaginationResponseType<T = any> = {
  total: number;
  list: T[];
};
