/**
 * 沙盒模块共享类型。
 *
 * 只定义 OpenSandbox 实例与生命周期 operation，不访问服务端资源。
 */
import z from 'zod';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { sandboxStableStatusList } from './constants';
import {
  sandboxInstanceStatusList,
  sandboxActiveStatusList,
  sandboxOperationTypeList
} from './constants';

// ---- 沙盒实例 DB 类型 ----
export const SandboxInstanceStatusSchema = z.enum(sandboxInstanceStatusList);
export type SandboxInstanceStatusType = z.infer<typeof SandboxInstanceStatusSchema>;
export type SandboxStableStatusType = (typeof sandboxStableStatusList)[number];

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

export const SandboxResourceLimitsSchema = z.object({
  cpuCount: z.number().optional(),
  memoryMiB: z.number().optional(),
  ephemeralStorageSize: z.string().optional()
});
export type SandboxResourceLimitsType = z.infer<typeof SandboxResourceLimitsSchema>;

export const SandboxVolumeSchema = z.object({
  name: z.string().min(1),
  claimName: z.string().min(1),
  mountPath: z.string().min(1),
  readOnly: z.boolean().optional()
});
export type SandboxVolumeType = z.infer<typeof SandboxVolumeSchema>;

export const SandboxStorageSchema = z.object({
  volumes: z.array(SandboxVolumeSchema).optional()
});
export type SandboxStorageType = z.infer<typeof SandboxStorageSchema>;

export const SandboxContextSchema = z.object({
  skillVersionId: z.string().min(1).optional()
});
export type SandboxContextType = z.infer<typeof SandboxContextSchema>;

const SandboxImageSchema = z.string().min(1);

const SandboxOperationSchema = z.object({
  id: z.string().min(1),
  type: SandboxOperationTypeSchema,
  phase: z.string().min(1),
  startedAt: z.coerce.date(),
  heartbeatAt: z.coerce.date(),
  failedAt: z.coerce.date().optional(),
  error: z.string().optional()
});

export const SandboxInstanceZodSchema = z.object({
  _id: z.string(),
  sandboxId: z.string(),
  sourceType: SandboxSourceTypeSchema,
  sourceId: z.string(),
  userId: z.string(),
  teamId: z.string().min(1),
  instanceId: z.string().min(1).optional(),
  image: SandboxImageSchema.optional(),
  resourceLimits: SandboxResourceLimitsSchema.nullish(),
  storage: SandboxStorageSchema.nullish(),
  context: SandboxContextSchema.nullish(),
  status: SandboxInstanceStatusSchema,
  operation: SandboxOperationSchema.optional(),
  lastActiveAt: z.coerce.date(),
  createdAt: z.coerce.date()
});
export type SandboxInstanceSchemaType = z.infer<typeof SandboxInstanceZodSchema>;
