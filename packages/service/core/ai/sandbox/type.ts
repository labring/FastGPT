import z from 'zod';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxProtocolEnum, SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';

// ---- 沙盒实例 DB 类型 ----
export const SandboxProviderValues = ['sealosdevbox', 'opensandbox'] as const;
export const SharedSandboxStatusValues = [
  SandboxStatusEnum.running,
  SandboxStatusEnum.stopped
] as const;

export const SandboxProviderSchema = z.enum(SandboxProviderValues);
export type SandboxProviderType = z.infer<typeof SandboxProviderSchema>;
export const SharedSandboxStatusSchema = z.enum(SharedSandboxStatusValues);
export type SharedSandboxStatusType = z.infer<typeof SharedSandboxStatusSchema>;

export const SandboxLimitSchema = z.object({
  cpuCount: z.number(),
  memoryMiB: z.number(),
  diskGiB: z.number()
});

export const SandboxImageSchema = z.object({
  repository: z.string(),
  tag: z.string().optional()
});

export const SandboxProviderStatusSchema = z.object({
  state: z.string(),
  message: z.string().optional(),
  reason: z.string().optional()
});

export const SandboxEndpointSchema = z.object({
  host: z.string(),
  port: z.number(),
  protocol: z.enum(SandboxProtocolEnum),
  url: z.string()
});

export const SandboxStorageSchema = z.object({
  bucket: z.string(),
  key: z.string(),
  size: z.number(),
  uploadedAt: z.date()
});

export const SandboxDetailSchema = z.object({
  sandboxType: z.enum(SandboxTypeEnum),
  teamId: z.string(),
  tmbId: z.string(),
  skillId: z.string().optional(),
  sessionId: z.string().optional(),
  skillIds: z.array(z.string()).optional(),
  provider: SandboxProviderSchema,
  image: SandboxImageSchema,
  providerStatus: SandboxProviderStatusSchema,
  providerCreatedAt: z.date(),
  endpoint: SandboxEndpointSchema.optional(),
  storage: SandboxStorageSchema.optional(),
  metadata: z.union([z.map(z.string(), z.any()), z.record(z.string(), z.any())]).optional()
});

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
  detail: SandboxDetailSchema.optional()
});

export type SandboxInstanceSchemaType = z.infer<typeof SandboxInstanceZodSchema>;
