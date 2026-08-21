import { ObjectIdSchema } from '../../common/type/mongo';
import { z } from 'zod';

export const DatasetSynonymLimits = {
  maxFileSize: 10 * 1024 * 1024,
  maxMappings: 10_000,
  maxTerms: 50_000,
  maxTermLength: 128
} as const;

export const DatasetSynonymSchemaVersion = 2 as const;

export enum DatasetSynonymMappingSourceEnum {
  job = 'job',
  legacyMigration = 'legacyMigration'
}

export enum DatasetSynonymJobTypeEnum {
  upload = 'upload',
  update = 'update',
  delete = 'delete'
}

export enum DatasetSynonymJobStatusEnum {
  pending = 'pending',
  diffing = 'diffing',
  marking = 'marking',
  processing = 'processing',
  rollingBack = 'rollingBack',
  completed = 'completed',
  failed = 'failed',
  cancelled = 'cancelled'
}

export enum DatasetSynonymOperationStatusEnum {
  prepared = 'prepared',
  vectorsPrepared = 'vectorsPrepared',
  mongoCommitted = 'mongoCommitted',
  completed = 'completed'
}

export enum DatasetMutationLockOwnerTypeEnum {
  dataMutation = 'dataMutation',
  synonymJob = 'synonymJob'
}

export const DatasetSynonymConfigSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '同义词配置 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '知识库 ID' }),
  fileName: z.string().optional().meta({ description: '当前生效文件名' }),
  size: z.number().int().nonnegative().optional().meta({ description: '当前生效文件大小' }),
  uploadTime: z.coerce.date().optional().meta({ description: '当前生效文件上传时间' }),
  uploaderId: ObjectIdSchema.optional().meta({ description: '当前生效文件上传成员 ID' }),
  activeVersion: z.number().int().nonnegative().meta({ description: '当前生效版本' }),
  latestVersion: z.number().int().nonnegative().meta({ description: '最新分配版本' }),
  schemaVersion: z.literal(DatasetSynonymSchemaVersion).meta({ description: '同义词存储结构版本' }),
  pendingVersion: z.number().int().positive().optional().meta({ description: '处理中版本' }),
  pendingFileName: z.string().optional().meta({ description: '处理中版本文件名' }),
  pendingSize: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .meta({ description: '处理中版本文件大小' }),
  pendingUploaderId: ObjectIdSchema.optional().meta({ description: '处理中版本上传成员 ID' }),
  pendingUploadTime: z.coerce.date().optional().meta({ description: '处理中版本上传时间' }),
  updateTime: z.coerce.date().meta({ description: '配置更新时间' })
});
export type DatasetSynonymConfigType = z.infer<typeof DatasetSynonymConfigSchema>;

export const DatasetSynonymMappingSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '同义词映射版本 ID' }),
  logicalMappingId: ObjectIdSchema.meta({ description: '跨版本稳定映射 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '知识库 ID' }),
  synonymFileId: ObjectIdSchema.meta({ description: '同义词配置 ID' }),
  fileVersion: z.number().int().positive().meta({ description: '文件版本' }),
  standardizedTerm: z.string().meta({ description: '标准词' }),
  normalizedStandardizedTerm: z.string().meta({ description: '标准词匹配键' }),
  synonymTerms: z.array(z.string()).meta({ description: '同义词列表' }),
  normalizedSynonymTerms: z.array(z.string()).meta({ description: '同义词匹配键列表' }),
  allTerms: z.string().meta({ description: '用于管理检索的全部词文本' }),
  fingerprint: z.string().meta({ description: '映射内容指纹' }),
  jobId: ObjectIdSchema.optional().meta({ description: '创建该版本的任务 ID；历史迁移版本为空' }),
  source: z
    .enum(DatasetSynonymMappingSourceEnum)
    .default(DatasetSynonymMappingSourceEnum.job)
    .meta({ description: 'mapping 版本来源' }),
  createTime: z.coerce.date().meta({ description: '创建时间' }),
  updateTime: z.coerce.date().meta({ description: '更新时间' })
});
export type DatasetSynonymMappingType = z.infer<typeof DatasetSynonymMappingSchema>;

export const DatasetSynonymDiffSummarySchema = z.object({
  added: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  affectedDataCount: z.number().int().nonnegative(),
  completedDataCount: z.number().int().nonnegative(),
  failedDataCount: z.number().int().nonnegative(),
  scannedDataCount: z.number().int().nonnegative()
});
export type DatasetSynonymDiffSummaryType = z.infer<typeof DatasetSynonymDiffSummarySchema>;

export const DatasetSynonymJobSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '同义词任务 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '任务发起成员 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '知识库 ID' }),
  billId: ObjectIdSchema.meta({ description: '同义词重建训练账单 ID' }),
  synonymFileId: ObjectIdSchema.optional().meta({ description: '同义词配置 ID' }),
  fileName: z.string().optional().meta({ description: '该版本的展示文件名' }),
  size: z.number().int().nonnegative().optional().meta({ description: '该版本规范 CSV 的大小' }),
  uploadTime: z.coerce.date().optional().meta({ description: '该版本提交时间' }),
  fileVersion: z.number().int().positive().meta({ description: '目标文件版本' }),
  snapshotReady: z
    .boolean()
    .optional()
    .meta({ description: '该任务的完整 mapping 快照是否可用于重试' }),
  fencingToken: z.number().int().positive().meta({ description: '写入屏障令牌' }),
  type: z.enum(DatasetSynonymJobTypeEnum).meta({ description: '任务类型' }),
  status: z.enum(DatasetSynonymJobStatusEnum).meta({ description: '任务状态' }),
  isActive: z.boolean().optional().meta({ description: '是否为当前运行中的任务' }),
  diffSummary: DatasetSynonymDiffSummarySchema.optional().meta({ description: '增量处理摘要' }),
  affectedLogicalMappingIds: z
    .array(ObjectIdSchema)
    .meta({ description: '本次 diff 影响的稳定 mapping ID 列表' }),
  markingCursor: ObjectIdSchema.optional().meta({ description: '数据标记游标' }),
  errorMsg: z.string().optional().meta({ description: '失败原因' }),
  cleanupPending: z.boolean().optional().meta({ description: '是否存在待清理的退休版本资源' }),
  retiredVersion: z
    .number()
    .int()
    .positive()
    .optional()
    .meta({ description: '待清理的退休 mapping 版本' }),
  cleanupError: z.string().optional().meta({ description: '最近一次退休资源清理失败原因' }),
  createTime: z.coerce.date().meta({ description: '创建时间' }),
  updateTime: z.coerce.date().meta({ description: '更新时间' }),
  finishTime: z.coerce.date().optional().meta({ description: '结束时间' })
});
export type DatasetSynonymJobType = z.infer<typeof DatasetSynonymJobSchema>;

export const DatasetSynonymOperationSchema = z.object({
  _id: ObjectIdSchema,
  operationId: z.string(),
  teamId: ObjectIdSchema,
  datasetId: ObjectIdSchema,
  jobId: ObjectIdSchema,
  trainingId: ObjectIdSchema,
  dataId: ObjectIdSchema,
  targetVersion: z.number().int().nonnegative(),
  status: z.enum(DatasetSynonymOperationStatusEnum),
  inputTokens: z.number().int().nonnegative().default(0),
  attempt: z.number().int().positive().default(1),
  insertedVectorIds: z.array(z.string()).default([]),
  obsoleteVectorIds: z.array(z.string()).default([]),
  errorMsg: z.string().optional(),
  createTime: z.coerce.date(),
  updateTime: z.coerce.date()
});
export type DatasetSynonymOperationType = z.infer<typeof DatasetSynonymOperationSchema>;

export const DatasetMutationLockSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '知识库写入锁 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '知识库 ID' }),
  ownerId: z.string().optional().meta({ description: '当前锁持有者 ID' }),
  ownerType: z
    .enum(DatasetMutationLockOwnerTypeEnum)
    .optional()
    .meta({ description: '当前锁持有者类型' }),
  sharedOwners: z
    .array(
      z.object({
        ownerId: z.string(),
        leaseUntil: z.coerce.date()
      })
    )
    .default([])
    .meta({ description: '当前有效或待清理的普通写入共享租约' }),
  fencingToken: z.number().int().nonnegative().meta({ description: '写入屏障令牌' }),
  leaseUntil: z.coerce.date().meta({ description: '租约到期时间' }),
  updateTime: z.coerce.date().meta({ description: '锁更新时间' })
});
export type DatasetMutationLockType = z.infer<typeof DatasetMutationLockSchema>;

export const DatasetSynonymMappingMetadataSchema = z.object({
  mappingId: ObjectIdSchema.meta({ description: '跨版本稳定映射 ID' }),
  datasetId: ObjectIdSchema.meta({ description: '知识库 ID' }),
  fileVersion: z.number().int().nonnegative().meta({ description: '映射版本' }),
  matchedTerm: z.string().meta({ description: '原文命中的同义词' }),
  standardizedTerm: z.string().meta({ description: '替换后的标准词' })
});
export type DatasetSynonymMappingMetadataType = z.infer<typeof DatasetSynonymMappingMetadataSchema>;

export const NormalizedSynonymMappingSchema = z.object({
  standardizedTerm: z.string(),
  normalizedStandardizedTerm: z.string(),
  synonymTerms: z.array(z.string()),
  normalizedSynonymTerms: z.array(z.string()),
  allTerms: z.string(),
  fingerprint: z.string(),
  sourceRows: z.array(z.number().int().positive())
});
export type NormalizedSynonymMappingType = z.infer<typeof NormalizedSynonymMappingSchema>;

export const DatasetSynonymInputMappingSchema = z.object({
  standardizedTerm: z.string().meta({ description: '标准词' }),
  synonymTerms: z.array(z.string()).min(1).meta({ description: '该标准词的同义词列表' })
});
export type DatasetSynonymInputMappingType = z.infer<typeof DatasetSynonymInputMappingSchema>;
