import z from 'zod';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxProtocolEnum, SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';

// ---- 沙盒实例 DB 类型 ----
export const SandboxProviderSchema = z.enum(['sealosdevbox', 'opensandbox', 'e2b']);
export type SandboxProviderType = z.infer<typeof SandboxProviderSchema>;
export const SandboxProviderValues = SandboxProviderSchema.options;
export const SharedSandboxStatusSchema = z.enum(SandboxStatusEnum);
export type SharedSandboxStatusType = z.infer<typeof SharedSandboxStatusSchema>;
export const SharedSandboxStatusValues = SharedSandboxStatusSchema.options;

export const SandboxLimitSchema = z.object({
  cpuCount: z.number(),
  memoryMiB: z.number(),
  diskGiB: z.number()
});

export const SandboxVolumeSchema = z.object({
  name: z.string(),
  claimName: z.string().optional(),
  mountPath: z.string(),
  subPath: z.string().optional()
});

export const SandboxStorageSchema = z.object({
  volumes: z.array(SandboxVolumeSchema).optional(),
  mountPath: z.string().optional()
});
export type SandboxStorageType = z.infer<typeof SandboxStorageSchema>;

export const SandboxImageSchema = z.object({
  repository: z.string(),
  tag: z.string().optional()
});

export const SandboxEndpointSchema = z.object({
  host: z.string(),
  port: z.number(),
  protocol: z.enum(SandboxProtocolEnum),
  url: z.string()
});

export const SandboxProviderStatusSchema = z.object({
  state: z.string(),
  message: z.string().optional(),
  reason: z.string().optional()
});

export const SandboxPersistedStorageSchema = z.object({
  bucket: z.string(),
  key: z.string(),
  size: z.number(),
  uploadedAt: z.date()
});

export const SandboxMetadataSchema = z.object({
  sandboxType: z.enum(SandboxTypeEnum).optional(),
  teamId: z.string().optional(),
  tmbId: z.string().optional(),
  skillId: z.string().optional(),
  sessionId: z.string().optional(),
  skillIds: z.array(z.string()).optional(),
  provider: SandboxProviderSchema.optional(),
  image: SandboxImageSchema.optional(),
  providerStatus: SandboxProviderStatusSchema.optional(),
  providerCreatedAt: z.date().optional(),
  endpoint: SandboxEndpointSchema.optional(),
  storage: SandboxPersistedStorageSchema.optional(),
  skillName: z.string().optional(),
  skillVersion: z.string().optional(),
  volumeEnabled: z.boolean().optional()
});
export type SandboxMetadataType = z.infer<typeof SandboxMetadataSchema>;

export const SandboxInstanceZodSchema = z.object({
  _id: z.string(),
  sandboxId: z.string(),
  appId: z.string().nullish(),
  userId: z.string().nullish(),
  chatId: z.string().nullish(),
  status: SharedSandboxStatusSchema,
  lastActiveAt: z.date(),
  createdAt: z.date(),
  limit: SandboxLimitSchema.nullish(),
  provider: SandboxProviderSchema,
  storage: SandboxStorageSchema.nullish(),
  metadata: SandboxMetadataSchema.optional()
});
export type SandboxInstanceSchemaType = z.infer<typeof SandboxInstanceZodSchema>;
