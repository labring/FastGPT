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
import {
  sandboxInstanceStatusList,
  sandboxStableStatusList,
  sandboxActiveStatusList,
  sandboxOperationTypeList,
  expectedOperationByStatus
} from './constants';

// ---- 沙盒实例 DB 类型 ----
export const SandboxProviderSchema = z.enum(agentSandboxProviderList);
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
