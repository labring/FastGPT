/**
 * 沙盒模块共享类型。
 *
 * 只定义 sandbox 实例、provider 和生命周期 operation，不访问服务端资源。
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
  deleting: 'deleting'
} as const satisfies Record<(typeof sandboxInstanceStatusList)[number], string>;
export const SandboxInstanceStatusSchema = z.enum(sandboxInstanceStatusList);
export type SandboxInstanceStatusType = z.infer<typeof SandboxInstanceStatusSchema>;

export const sandboxStableStatusList = ['running', 'stopped', 'archived'] as const;
export const SandboxStableStatusSchema = z.enum(sandboxStableStatusList);
export type SandboxStableStatusType = z.infer<typeof SandboxStableStatusSchema>;

export const sandboxOperationTypeList = [
  'provision',
  'legacyMigration',
  'stop',
  'archive',
  'restore',
  'delete'
] as const;
export const SandboxOperationTypeEnum = {
  provision: 'provision',
  legacyMigration: 'legacyMigration',
  stop: 'stop',
  archive: 'archive',
  restore: 'restore',
  delete: 'delete'
} as const satisfies Record<(typeof sandboxOperationTypeList)[number], string>;
export const SandboxOperationTypeSchema = z.enum(sandboxOperationTypeList);
export type SandboxOperationType = z.infer<typeof SandboxOperationTypeSchema>;
export const SandboxSourceTypeSchema = z.enum([
  ChatSourceTypeEnum.app,
  ChatSourceTypeEnum.skillEdit
]);
export type SandboxSourceType = z.infer<typeof SandboxSourceTypeSchema>;

export const SandboxLimitSchema = z.object({
  cpuCount: z.number(),
  memoryMiB: z.number(),
  storageSize: z.string()
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

export const SandboxOperationSchema = z.object({
  id: z.string().min(1),
  type: SandboxOperationTypeSchema,
  phase: z.string().min(1),
  previousStatus: SandboxStableStatusSchema.optional(),
  startedAt: z.coerce.date(),
  heartbeatAt: z.coerce.date(),
  failedAt: z.coerce.date().optional(),
  error: z.string().optional()
});
export type SandboxOperationTypeSchemaType = z.infer<typeof SandboxOperationSchema>;

const expectedOperationByStatus: Partial<Record<SandboxInstanceStatusType, SandboxOperationType>> =
  {
    provisioning: 'provision',
    legacyMigrating: 'legacyMigration',
    stopping: 'stop',
    archiving: 'archive',
    restoring: 'restore',
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
    teamId: z.string().optional(),
    image: SandboxImageSchema.optional(),
    versionId: z.string().optional(),
    operation: SandboxOperationSchema.optional()
  })
  .superRefine((instance, ctx) => {
    const expectedOperation = expectedOperationByStatus[instance.status];
    const operation = instance.operation;

    if (!expectedOperation && operation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operation'],
        message: `Stable status ${instance.status} must not keep an operation`
      });
      return;
    }
    if (expectedOperation && operation?.type !== expectedOperation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['operation'],
        message: `Status ${instance.status} requires ${expectedOperation} operation`
      });
    }
  });
export type SandboxInstanceSchemaType = z.infer<typeof SandboxInstanceZodSchema>;
