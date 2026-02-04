import type { z } from '@hono/zod-openapi';
export declare const ExecRequestSchema: z.ZodObject<
  {
    command: z.ZodString;
    cwd: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type ExecRequest = z.infer<typeof ExecRequestSchema>;
export declare const HealthResponseSchema: z.ZodObject<
  {
    status: z.ZodString;
    timestamp: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export declare const ExecResponseSchema: z.ZodObject<
  {
    success: z.ZodBoolean;
    stdout: z.ZodString;
    stderr: z.ZodString;
    exitCode: z.ZodNumber;
    cwd: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type ExecResponse = z.infer<typeof ExecResponseSchema>;
export declare const HealthCheckResponseSchema: z.ZodObject<
  {
    success: z.ZodLiteral<true>;
    healthy: z.ZodBoolean;
  },
  z.core.$strip
>;
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
export declare const ExecResultResponseSchema: z.ZodObject<
  {
    success: z.ZodLiteral<true>;
    data: z.ZodObject<
      {
        success: z.ZodBoolean;
        stdout: z.ZodString;
        stderr: z.ZodString;
        exitCode: z.ZodNumber;
        cwd: z.ZodOptional<z.ZodString>;
        error: z.ZodOptional<z.ZodString>;
      },
      z.core.$strip
    >;
  },
  z.core.$strip
>;
export type ExecResultResponse = z.infer<typeof ExecResultResponseSchema>;
