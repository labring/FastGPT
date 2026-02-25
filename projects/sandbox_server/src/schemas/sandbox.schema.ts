import { z } from '@hono/zod-openapi';

// ==================== Request Schemas ====================

export const ExecRequestSchema = z.object({
  command: z.string().min(1).openapi({ example: 'ls -la' }),
  cwd: z.string().optional().openapi({ example: '/app/sandbox' })
});
export type ExecRequest = z.infer<typeof ExecRequestSchema>;

// ==================== Response Schemas ====================

export const HealthResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string().optional()
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ExecResponseSchema = z.object({
  success: z.boolean(),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
  cwd: z.string().optional(),
  error: z.string().optional()
});
export type ExecResponse = z.infer<typeof ExecResponseSchema>;

export const HealthCheckResponseSchema = z.object({
  success: z.literal(true),
  healthy: z.boolean()
});
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

export const ExecResultResponseSchema = z.object({
  success: z.literal(true),
  data: ExecResponseSchema
});
export type ExecResultResponse = z.infer<typeof ExecResultResponseSchema>;
