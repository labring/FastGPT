/**
 * SDK Schemas for runtime validation
 * Uses standard zod (not @hono/zod-openapi)
 */
import { z } from 'zod';

// ==================== Common Schemas ====================

export const SuccessResponseSchema = z.object({
  success: z.literal(true)
});

// ==================== Container Schemas ====================

export const CreateContainerSchema = z.object({
  name: z.string().min(1)
});

const ContainerStatusSchema = z.object({
  state: z.enum(['Running', 'Creating', 'Paused', 'Error', 'Unknown']),
  replicas: z.number().optional(),
  availableReplicas: z.number().optional()
});

const ContainerServerSchema = z.object({
  serviceName: z.string(),
  number: z.number(),
  publicDomain: z.string().optional(),
  domain: z.string().optional()
});

const ContainerInfoSchema = z.object({
  name: z.string(),
  image: z.object({
    imageName: z.string()
  }),
  status: ContainerStatusSchema,
  server: ContainerServerSchema.optional(),
  createdAt: z.string().optional()
});

export const ContainerInfoResponseSchema = z.object({
  success: z.literal(true),
  data: ContainerInfoSchema
});

// ==================== Sandbox Schemas ====================

export const ExecRequestSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional()
});

const ExecResponseSchema = z.object({
  success: z.boolean(),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number(),
  cwd: z.string().optional(),
  error: z.string().optional()
});

export const HealthCheckResponseSchema = z.object({
  success: z.literal(true),
  healthy: z.boolean()
});

export const ExecResultResponseSchema = z.object({
  success: z.literal(true),
  data: ExecResponseSchema
});
