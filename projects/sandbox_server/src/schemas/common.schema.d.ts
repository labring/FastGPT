import type { z } from '@hono/zod-openapi';
export declare const SuccessResponseSchema: z.ZodObject<
  {
    success: z.ZodLiteral<true>;
  },
  z.core.$strip
>;
export type SuccessResponse = z.infer<typeof SuccessResponseSchema>;
export declare const ErrorResponseSchema: z.ZodObject<
  {
    success: z.ZodLiteral<false>;
    message: z.ZodString;
  },
  z.core.$strip
>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export declare const NameParamSchema: z.ZodObject<
  {
    name: z.ZodString;
  },
  z.core.$strip
>;
export type NameParam = z.infer<typeof NameParamSchema>;
