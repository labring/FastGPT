/**
 * 沙盒模块共享类型。
 *
 * 只定义 sandbox 实例、provider、生命周期 Saga 和 metadata schema，不访问服务端资源。
 */
import z from 'zod';
import {
  agentSandboxProviderList,
  SandboxStatusEnum
} from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

// ---- 沙盒实例 DB 类型 ----
export const SandboxProviderSchema = z.enum(agentSandboxProviderList);
export type SandboxProviderType = z.infer<typeof SandboxProviderSchema>;
export const SharedSandboxStatusSchema = z.enum(SandboxStatusEnum);
export type SharedSandboxStatusType = z.infer<typeof SharedSandboxStatusSchema>;

export const sandboxInstanceStatusList = [
  'provisioning',
  'legacyMigrating',
  'running',
  'stopping',
  'stopped',
  'archiving',
  'archived',
  'restoring',
  'providerMigrating',
  'deleting'
] as const;
export const SandboxInstanceStatusEnum = {
  provisioning: 'provisioning',
  legacyMigrating: 'legacyMigrating',
  running: 'running',
  stopping: 'stopping',
  stopped: 'stopped',
  archiving: 'archiving',
  archived: 'archived',
  restoring: 'restoring',
  providerMigrating: 'providerMigrating',
  deleting: 'deleting'
} as const satisfies Record<(typeof sandboxInstanceStatusList)[number], string>;
export const SandboxInstanceStatusSchema = z.enum(sandboxInstanceStatusList);
export type SandboxInstanceStatusType = z.infer<typeof SandboxInstanceStatusSchema>;

export const sandboxStableStatusList = ['running', 'stopped', 'archived'] as const;
export const SandboxStableStatusSchema = z.enum(sandboxStableStatusList);
export type SandboxStableStatusType = z.infer<typeof SandboxStableStatusSchema>;

export const sandboxLifecycleTypeList = [
  'provision',
  'legacyMigration',
  'stop',
  'archive',
  'restore',
  'providerMigration',
  'delete'
] as const;
export const SandboxLifecycleTypeEnum = {
  provision: 'provision',
  legacyMigration: 'legacyMigration',
  stop: 'stop',
  archive: 'archive',
  restore: 'restore',
  providerMigration: 'providerMigration',
  delete: 'delete'
} as const satisfies Record<(typeof sandboxLifecycleTypeList)[number], string>;
export const SandboxLifecycleTypeSchema = z.enum(sandboxLifecycleTypeList);
export type SandboxLifecycleType = z.infer<typeof SandboxLifecycleTypeSchema>;
export const SandboxSourceTypeSchema = z.enum([
  ChatSourceTypeEnum.app,
  ChatSourceTypeEnum.skillEdit
]);
export type SandboxSourceType = z.infer<typeof SandboxSourceTypeSchema>;

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

export const SandboxActiveSagaSchema = z
  .object({
    sagaId: z.string().min(1),
    type: SandboxLifecycleTypeSchema
  })
  .strict();
export type SandboxActiveSaga = z.infer<typeof SandboxActiveSagaSchema>;

export const SandboxMetadataSchema = z
  .object({
    teamId: z.string().optional(),
    tmbId: z.string().optional(),
    volumeEnabled: z.boolean().optional(),
    sessionId: z.string().optional(),
    skillIds: z.array(z.string()).optional(),
    image: SandboxImageSchema.optional(),
    skillName: z.string().optional(),
    versionId: z.string().optional(),
    /** Adapter 返回的 opaque handle，用于跨进程稳定重绑定同一个上游资源。 */
    upstreamId: z.string().min(1).optional(),
    activeSaga: SandboxActiveSagaSchema.optional()
  })
  .strict();
export type SandboxMetadataType = z.infer<typeof SandboxMetadataSchema>;

const expectedSagaByStatus: Partial<Record<SandboxInstanceStatusType, SandboxLifecycleType>> = {
  provisioning: 'provision',
  legacyMigrating: 'legacyMigration',
  stopping: 'stop',
  archiving: 'archive',
  restoring: 'restore',
  providerMigrating: 'providerMigration',
  deleting: 'delete'
};

export const SandboxInstanceZodSchema = z
  .object({
    _id: z.string(),
    sandboxId: z.string(),
    sourceType: SandboxSourceTypeSchema,
    sourceId: z.string(),
    userId: z.string(),
    status: SandboxInstanceStatusSchema,
    lastActiveAt: z.coerce.date(),
    createdAt: z.coerce.date(),
    limit: SandboxLimitSchema.nullish(),
    provider: SandboxProviderSchema,
    storage: SandboxStorageSchema.nullish(),
    metadata: SandboxMetadataSchema.nullish()
  })
  .superRefine((instance, ctx) => {
    const expectedSaga = expectedSagaByStatus[instance.status];
    const activeSaga = instance.metadata?.activeSaga;

    if (!expectedSaga && activeSaga) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['metadata', 'activeSaga'],
        message: `Stable status ${instance.status} must not keep an active Saga`
      });
      return;
    }
    if (expectedSaga && activeSaga?.type !== expectedSaga) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['metadata', 'activeSaga'],
        message: `Status ${instance.status} requires ${expectedSaga} active Saga`
      });
    }
  });
export type SandboxInstanceSchemaType = z.infer<typeof SandboxInstanceZodSchema>;
