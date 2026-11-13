import z from 'zod';

export const SANDBOX_WORKSPACE_VOLUME_NAME = 'workspace';

// Kubernetes PVC 与 Docker named volume 统一使用 DNS label 子集。
const SANDBOX_VOLUME_NAME_RE = /^[a-z0-9]([a-z0-9-]{0,251}[a-z0-9])?$/;

export const SandboxVolumeNameSchema = z.string().trim().regex(SANDBOX_VOLUME_NAME_RE, {
  message: 'Volume name must use lowercase alphanumeric characters and hyphens'
});

export const SandboxDeploymentIdSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/)
  .meta({
    description: 'MongoDB 持久化的部署实例 ID，用于隔离共享基础设施中的沙盒资源',
    example: '0123456789abcdef0123456789abcdef'
  });
export type SandboxDeploymentId = z.infer<typeof SandboxDeploymentIdSchema>;

export const SandboxVolumeListQuerySchema = z.object({
  deploymentId: SandboxDeploymentIdSchema
});
export type SandboxVolumeListQuery = z.infer<typeof SandboxVolumeListQuerySchema>;

export const SandboxVolumeEnsureRequestSchema = z.object({
  claimName: SandboxVolumeNameSchema,
  deploymentId: SandboxDeploymentIdSchema,
  storageSize: z.string().trim().min(1).max(64).optional()
});
export type SandboxVolumeEnsureRequest = z.infer<typeof SandboxVolumeEnsureRequestSchema>;

export const SandboxVolumeEnsureResponseSchema = z.object({
  claimName: SandboxVolumeNameSchema,
  created: z.boolean()
});
export type SandboxVolumeEnsureResponse = z.infer<typeof SandboxVolumeEnsureResponseSchema>;

export const SandboxVolumeListResponseSchema = z.object({
  items: z.array(SandboxVolumeNameSchema)
});
export type SandboxVolumeListResponse = z.infer<typeof SandboxVolumeListResponseSchema>;
