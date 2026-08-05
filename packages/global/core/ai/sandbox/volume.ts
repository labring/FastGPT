import z from 'zod';

export const SANDBOX_WORKSPACE_VOLUME_NAME = 'workspace';

// Kubernetes PVC 与 Docker named volume 统一使用 DNS label 子集。
export const SANDBOX_VOLUME_NAME_RE = /^[a-z0-9]([a-z0-9-]{0,251}[a-z0-9])?$/;

export const SandboxVolumeNameSchema = z.string().trim().regex(SANDBOX_VOLUME_NAME_RE, {
  message: 'Volume name must use lowercase alphanumeric characters and hyphens'
});

export const SandboxVolumeEnsureRequestSchema = z.object({
  claimName: SandboxVolumeNameSchema,
  storageSize: z.string().trim().min(1).max(64).optional()
});
export type SandboxVolumeEnsureRequest = z.infer<typeof SandboxVolumeEnsureRequestSchema>;

export const SandboxVolumeEnsureResponseSchema = z.object({
  claimName: SandboxVolumeNameSchema,
  created: z.boolean()
});
export type SandboxVolumeEnsureResponse = z.infer<typeof SandboxVolumeEnsureResponseSchema>;
