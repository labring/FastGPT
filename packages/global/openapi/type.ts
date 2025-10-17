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
