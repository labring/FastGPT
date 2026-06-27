import z from 'zod';
import { SandboxStatusEnum, SandboxTypeEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

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

export const SandboxArchiveStateSchema = z.enum(['archiving', 'archived', 'restoring', 'failed']);
export type SandboxArchiveStateType = z.infer<typeof SandboxArchiveStateSchema>;

export const SandboxMetadataSchema = z.object({
  teamId: z.string().optional(),
  tmbId: z.string().optional(),

  volumeEnabled: z.boolean().optional(),
  provider: SandboxProviderSchema.optional(),
  archive: z
    .object({
      state: SandboxArchiveStateSchema,
      startedAt: z.coerce.date().optional(),
      archivedAt: z.coerce.date().optional(),
      failedAt: z.coerce.date().optional(),
      error: z.string().optional()
    })
    .optional(),

  /** @deprecated 旧 Skill Edit 归属字段，仅迁移脚本/历史数据观察使用。 */
  skillId: z.string().optional(),
  sessionId: z.string().optional(),
  skillIds: z.array(z.string()).optional(),
  image: SandboxImageSchema.optional(),

  skillName: z.string().optional(),
  versionId: z.string().optional()
});
export type SandboxMetadataType = z.infer<typeof SandboxMetadataSchema>;

export const SandboxInstanceZodSchema = z.object({
  _id: z.string(),
  sandboxId: z.string(),
  /** @deprecated 旧 sandbox 归属字段，仅迁移脚本/历史数据观察使用。 */
  appId: z.string().nullish(),
  sourceType: z.enum(ChatSourceTypeEnum),
  sourceId: z.string(),
  userId: z.string().nullish(),
  chatId: z.string().nullish(),
  type: z.enum(SandboxTypeEnum).nullish(),
  status: SharedSandboxStatusSchema,
  lastActiveAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  limit: SandboxLimitSchema.nullish(),
  provider: SandboxProviderSchema,
  storage: SandboxStorageSchema.nullish(),
  metadata: SandboxMetadataSchema.nullish()
});
export type SandboxInstanceSchemaType = z.infer<typeof SandboxInstanceZodSchema>;
