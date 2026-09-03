import { z } from 'zod';
import {
  systemMigrationLimits,
  SystemMigrationFailurePolicyEnum,
  SystemMigrationStatusEnum
} from './constants';

/** 迁移状态中的业务数据只允许标量，确保可稳定写入 Mongo、日志和 API JSON。 */
export const SystemMigrationDataValueSchema = z.union([
  z.string().max(systemMigrationLimits.maxDataStringLength),
  z.number().finite(),
  z.boolean(),
  z.null()
]);

export const SystemMigrationDataSchema = z
  .record(z.string().min(1), SystemMigrationDataValueSchema)
  .refine((params) => Object.keys(params).length <= systemMigrationLimits.maxDataEntries, {
    message: `Migration data cannot contain more than ${systemMigrationLimits.maxDataEntries} entries`
  })
  .meta({
    description: '迁移任务持久化和展示使用的有限标量业务数据',
    example: { sourceCount: 3, migratedCount: 3 }
  });

export const SystemMigrationStageKeySchema = z.string().min(1);

export const SystemMigrationStatusSchema = z.nativeEnum(SystemMigrationStatusEnum);
export const SystemMigrationFailurePolicySchema = z.nativeEnum(SystemMigrationFailurePolicyEnum);

export const SystemMigrationFailureDetailSchema = z.object({
  message: z.string().min(1).max(systemMigrationLimits.maxErrorMessageLength)
});

/** 持久化错误关联具体阶段；未进入任何阶段的框架错误允许没有 stageKey。 */
export const SystemMigrationErrorSchema = SystemMigrationFailureDetailSchema.extend({
  stageKey: SystemMigrationStageKeySchema.optional(),
  runId: z.string(),
  createdAt: z.date()
});

export type SystemMigrationError = z.infer<typeof SystemMigrationErrorSchema>;

const SystemMigrationProgressValueSchema = z.object({
  key: SystemMigrationStageKeySchema,
  params: SystemMigrationDataSchema.optional(),
  current: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional()
});

const isValidSystemMigrationProgressRange = (value: { current?: number; total?: number }) =>
  value.current === undefined || value.total === undefined || value.current <= value.total;

/** 任务只能主动把声明阶段标记为进行中或完成；失败状态统一由 Runner 写入。 */
export const SystemMigrationProgressInputSchema = SystemMigrationProgressValueSchema.extend({
  status: z.enum([SystemMigrationStatusEnum.running, SystemMigrationStatusEnum.succeeded])
}).refine(isValidSystemMigrationProgressRange, {
  message: 'Progress current cannot be greater than total',
  path: ['current']
});

export type SystemMigrationProgressInput = z.infer<typeof SystemMigrationProgressInputSchema>;

/** Mongo 中按阶段 key 保存的独立进度和最近错误。 */
export const SystemMigrationProgressSchema = SystemMigrationProgressValueSchema.extend({
  status: SystemMigrationStatusSchema,
  updatedAt: z.date(),
  error: SystemMigrationErrorSchema.optional()
})
  .refine(isValidSystemMigrationProgressRange, {
    message: 'Progress current cannot be greater than total',
    path: ['current']
  })
  .meta({ description: '单个升级阶段的进度快照' });

export type SystemMigrationProgress = z.infer<typeof SystemMigrationProgressSchema>;

/** 列表接口把静态 labelKey 与 Mongo 阶段状态合并后返回。 */
export const SystemMigrationProgressListItemSchema = SystemMigrationProgressValueSchema.extend({
  labelKey: z.string().min(1),
  status: SystemMigrationStatusSchema,
  failedRecordCount: z.number().int().nonnegative().optional(),
  updatedAt: z.date().optional(),
  error: SystemMigrationErrorSchema.optional()
}).refine(isValidSystemMigrationProgressRange, {
  message: 'Progress current cannot be greater than total',
  path: ['current']
});

export type SystemMigrationProgressListItem = z.infer<typeof SystemMigrationProgressListItemSchema>;

/** 任务成功后展示给管理员的最终结果；由 Runner 与 succeeded 终态原子写入。 */
export const SystemMigrationResultSchema = z
  .object({
    key: z.string().min(1),
    params: SystemMigrationDataSchema.optional()
  })
  .meta({ description: '任务成功后的最终结果' });

export type SystemMigrationResult = z.infer<typeof SystemMigrationResultSchema>;

/** 任务成功时写入 Mongo 的纯业务结果；展示用 i18n key 只从静态注册表获取。 */
export const SystemMigrationResultDataSchema = SystemMigrationDataSchema;

export type SystemMigrationResultData = z.infer<typeof SystemMigrationResultDataSchema>;

/**
 * 单条坏数据由“定位数据”和“失败原因”组成。
 * data 故意复用有限标量对象，不允许迁移脚本把完整业务正文或任意嵌套对象写入状态表。
 */
export const SystemMigrationFailedRecordSchema = z.object({
  stageKey: SystemMigrationStageKeySchema,
  data: SystemMigrationDataSchema,
  reason: SystemMigrationFailureDetailSchema
});

export type SystemMigrationFailedRecord = z.infer<typeof SystemMigrationFailedRecordSchema>;

/** 每条失败数据单独落库，因此数组不再受状态文档大小限制。 */
export const SystemMigrationFailedRecordsSchema = z.array(SystemMigrationFailedRecordSchema);

export const SystemMigrationFailureInputSchema = SystemMigrationFailureDetailSchema.extend({
  failedRecords: SystemMigrationFailedRecordsSchema.optional()
});

export type SystemMigrationFailureInput = z.infer<typeof SystemMigrationFailureInputSchema>;

/** 高频列表接口只返回失败数量，明细由独立接口按需加载。 */
export const SystemMigrationListItemSchema = z.object({
  id: z.string().meta({ description: '永久稳定的升级脚本 ID' }),
  version: z.string().meta({ description: '首次引入版本' }),
  order: z.number().int().positive().meta({ description: '注册表执行顺序' }),
  nameKey: z.string().meta({ description: '脚本名称的 i18n key' }),
  descriptionKey: z.string().meta({ description: '脚本描述的 i18n key' }),
  blockStartup: z.boolean().meta({ description: '是否阻塞节点 ready' }),
  onFailure: SystemMigrationFailurePolicySchema.meta({
    description: '任务失败后停止还是继续执行后续升级任务'
  }),
  status: SystemMigrationStatusSchema.meta({ description: '当前运行状态' }),
  heartbeatAt: z.date().optional().meta({ description: '最近一次 lease 心跳时间' }),
  leaseExpireAt: z.date().optional().meta({ description: '当前 lease 到期时间' }),
  progress: z.array(SystemMigrationProgressListItemSchema),
  result: SystemMigrationResultSchema.optional(),
  lastError: SystemMigrationErrorSchema.optional().meta({ description: '最近一次明确错误' }),
  failedRecordCount: z
    .number()
    .int()
    .nonnegative()
    .meta({ description: '独立错误明细集合中的记录数' }),
  startedAt: z.date().optional().meta({ description: '首次开始时间' }),
  lastStartedAt: z.date().optional().meta({ description: '最近一次开始时间' }),
  completedAt: z.date().optional().meta({ description: '成功完成时间' }),
  updatedAt: z.date().optional().meta({ description: '状态更新时间' })
});

export type SystemMigrationListItem = z.infer<typeof SystemMigrationListItemSchema>;

export const SystemMigrationListResponseSchema = z.object({
  serverTime: z.date().meta({ description: 'MongoDB 主节点时间，用于判断 lease 是否过期' }),
  businessReady: z.boolean().meta({ description: '是否所有阻塞脚本均已成功' }),
  migrations: z.array(SystemMigrationListItemSchema).meta({ description: '有序升级脚本列表' })
});

export type SystemMigrationListResponse = z.infer<typeof SystemMigrationListResponseSchema>;

export const SystemMigrationIdSchema = z.string().min(1).meta({ description: '升级脚本 ID' });

/** 失败明细读取接口仅允许查询静态注册表中存在的任务 ID。 */
export const GetSystemMigrationFailedRecordsQuerySchema = z.object({
  migrationId: SystemMigrationIdSchema,
  stageKey: SystemMigrationStageKeySchema
});

export type GetSystemMigrationFailedRecordsQuery = z.infer<
  typeof GetSystemMigrationFailedRecordsQuerySchema
>;

export const SystemMigrationFailedRecordsResponseSchema = z.object({
  migrationId: SystemMigrationIdSchema,
  stageKey: SystemMigrationStageKeySchema,
  failedRecords: SystemMigrationFailedRecordsSchema
});

export type SystemMigrationFailedRecordsResponse = z.infer<
  typeof SystemMigrationFailedRecordsResponseSchema
>;

/** 重试只提交任务 ID；服务端再次校验任务必须为非阻塞 failed。 */
export const RetrySystemMigrationBodySchema = z.object({
  migrationId: SystemMigrationIdSchema
});

export type RetrySystemMigrationBody = z.infer<typeof RetrySystemMigrationBodySchema>;
