import { z } from '@hono/zod-openapi';

// Common response wrapper
export const SuccessResponseSchema = z.object({
  success: z.literal(true)
});
export type SuccessResponse = z.infer<typeof SuccessResponseSchema>;

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string()
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// Path parameter for container/sandbox name
export const NameParamSchema = z.object({
  name: z
    .string()
    .min(1)
    .openapi({ param: { name: 'name', in: 'path' }, example: 'my-container' })
});
export type NameParam = z.infer<typeof NameParamSchema>;
