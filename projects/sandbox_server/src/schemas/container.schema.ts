import { z } from '@hono/zod-openapi';

// ==================== Request Schemas ====================

export const CreateContainerSchema = z.object({
  name: z.string().min(1).openapi({ example: 'my-container' })
});
export type CreateContainerInput = z.infer<typeof CreateContainerSchema>;

// ==================== Response Schemas ====================

export const ContainerStatusSchema = z.object({
  state: z.enum(['Running', 'Creating', 'Paused', 'Error', 'Unknown']),
  replicas: z.number().optional(),
  availableReplicas: z.number().optional()
});
export type ContainerStatus = z.infer<typeof ContainerStatusSchema>;

export const ContainerServerSchema = z.object({
  serviceName: z.string(),
  number: z.number(),
  publicDomain: z.string().optional(),
  domain: z.string().optional()
});
export type ContainerServer = z.infer<typeof ContainerServerSchema>;

export const ContainerInfoSchema = z.object({
  name: z.string(),
  image: z.object({
    imageName: z.string()
  }),
  status: ContainerStatusSchema,
  server: ContainerServerSchema.optional(),
  createdAt: z.string().optional()
});
export type ContainerInfo = z.infer<typeof ContainerInfoSchema>;

export const ContainerInfoResponseSchema = z.object({
  success: z.literal(true),
  data: ContainerInfoSchema
});
export type ContainerInfoResponse = z.infer<typeof ContainerInfoResponseSchema>;

// ==================== Sealos API Response Schemas ====================

export const SealosContainerResponseSchema = z.object({
  name: z.string(),
  image: z.object({
    imageName: z.string()
  }),
  createTime: z.string().optional(),
  status: z.object({
    replicas: z.coerce.number(),
    availableReplicas: z.coerce.number(),
    isPause: z.coerce.boolean()
  }),
  ports: z.array(
    z.object({
      serviceName: z.string(),
      number: z.coerce.number(),
      publicDomain: z.string().optional(),
      domain: z.string().optional()
    })
  )
});
export type SealosContainerResponse = z.infer<typeof SealosContainerResponseSchema>;
