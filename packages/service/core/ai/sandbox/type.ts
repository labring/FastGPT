import z from 'zod';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxProtocolEnum, SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';

// ---- 沙盒实例 DB 类型 ----
export const SandboxProviderSchema = z.enum(['sealosdevbox', 'opensandbox', 'e2b']);
export type SandboxProviderType = z.infer<typeof SandboxProviderSchema>;
export const SharedSandboxStatusSchema = z.enum(SandboxStatusEnum);
export type SharedSandboxStatusType = z.infer<typeof SharedSandboxStatusSchema>;

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

export const SandboxMetadataSchema = z.object({
  sandboxType: z.enum(SandboxTypeEnum),
  teamId: z.string().optional(),
  tmbId: z.string().optional(),

  volumeEnabled: z.boolean().optional(),

  skillId: z.string().optional(),
  sessionId: z.string().optional(),
  skillIds: z.array(z.string()).optional(),
  image: SandboxImageSchema,
  endpoint: SandboxEndpointSchema.optional()
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
  metadata: SandboxMetadataSchema.nullish()
});
export type SandboxInstanceSchemaType = z.infer<typeof SandboxInstanceZodSchema>;
