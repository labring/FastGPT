/**
 * 沙盒模块共享类型。
 *
 * 只定义 sandbox 实例、provider 和生命周期 operation，不访问服务端资源。
 */
import z from 'zod';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxImageConfigSchema } from '@fastgpt/global/core/ai/sandbox/type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  sandboxInstanceStatusList,
  sandboxStableStatusList,
  sandboxActiveStatusList,
  sandboxOperationTypeList,
  expectedOperationByStatus
} from './constants';

// ---- 沙盒实例 DB 类型 ----
export const SANDBOX_PROVIDER = 'opensandbox' as const;
export const SandboxProviderSchema = z.literal(SANDBOX_PROVIDER);
export type SandboxProviderType = z.infer<typeof SandboxProviderSchema>;
export const SharedSandboxStatusSchema = z.enum(SandboxStatusEnum);
export type SharedSandboxStatusType = z.infer<typeof SharedSandboxStatusSchema>;
export const SandboxInstanceStatusSchema = z.enum(sandboxInstanceStatusList);
export type SandboxInstanceStatusType = z.infer<typeof SandboxInstanceStatusSchema>;
export const SandboxStableStatusSchema = z.enum(sandboxStableStatusList);
export type SandboxStableStatusType = z.infer<typeof SandboxStableStatusSchema>;

/** 判断实例是否处于计入 Quota 的活跃状态。 */
export const isSandboxActiveStatus = (status: SandboxInstanceStatusType) =>
  sandboxActiveStatusList.some((activeStatus) => activeStatus === status);
export const SandboxOperationTypeSchema = z.enum(sandboxOperationTypeList);
export type SandboxOperationType = z.infer<typeof SandboxOperationTypeSchema>;
export const SandboxSourceTypeSchema = z.enum([
  ChatSourceTypeEnum.app,
  ChatSourceTypeEnum.workflowBuilder,
  ChatSourceTypeEnum.skillEdit
]);
export type SandboxSourceType = z.infer<typeof SandboxSourceTypeSchema>;

export const SandboxLimitSchema = z.object({
  cpuCount: z.number().optional(),
  memoryMiB: z.number().optional()
});

export type SandboxResourceLimitsType = z.infer<typeof SandboxLimitSchema>;

export const SandboxVolumeSchema = z.object({
  name: z.string(),
  claimName: z.string().optional(),
  mountPath: z.string(),
  subPath: z.string().optional()
});

export const SandboxArchiveInfoSchema = z.object({
  objectKey: z.string().min(1),
  generation: z.string().min(1),
  format: z.literal('tar.zst'),
  sizeBytes: z.number().int().nonnegative(),
  archivedAt: z.coerce.date()
});
export type SandboxArchiveInfoType = z.infer<typeof SandboxArchiveInfoSchema>;

export const SandboxStorageSchema = z.object({
  volumes: z.array(SandboxVolumeSchema).optional(),
  mountPath: z.string().optional(),
  archive: SandboxArchiveInfoSchema.optional(),
  // [4.18.0 legacy compat, remove in >= 4.19.0] 旧 Sealos Devbox 清理完成前保留墓碑标记
  legacyDevboxPendingCleanup: z.boolean().optional().meta({
    description: '4.18.0 迁移过渡字段（>= 4.19.0 移除）：保留旧 Sealos Devbox 待清理标记',
    deprecated: true
  })
});
export type SandboxStorageType = z.infer<typeof SandboxStorageSchema>;

export const SandboxOperationSchema = z.object({
  id: z.string().min(1),
  type: SandboxOperationTypeSchema,
  phase: z.string().min(1),
  previousStatus: SandboxStableStatusSchema.optional(),
  startedAt: z.coerce.date(),
  heartbeatAt: z.coerce.date(),
  failedAt: z.coerce.date().optional(),
  retryAfter: z.coerce.date().optional(),
  error: z.string().optional()
});
export type SandboxOperationTypeSchemaType = z.infer<typeof SandboxOperationSchema>;

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
    instanceId: z.string().optional(),
    storage: SandboxStorageSchema.nullish(),
    teamId: z.string().optional(),
    image: SandboxImageConfigSchema.optional(),
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
