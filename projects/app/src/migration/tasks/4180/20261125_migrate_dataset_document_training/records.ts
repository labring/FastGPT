import z from 'zod';
import { Types } from '@fastgpt/service/common/mongo';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

export const MongoIdSchema = z.instanceof(Types.ObjectId);
export const ScopeSchema = z.object({
  teamId: MongoIdSchema,
  datasetId: MongoIdSchema,
  collectionId: MongoIdSchema
});
export type Scope = z.infer<typeof ScopeSchema>;

const metadata = z.record(z.string(), z.unknown());
export const LegacyIndexContentSchema = z.object({
  q: z.string().nullish(),
  a: z.string().nullish(),
  imageId: z.string().nullish(),
  indexes: z
    .array(z.object({ text: z.string(), type: z.enum(DatasetDataIndexTypeEnum).optional() }))
    .nullish()
});
export const LegacyTaskSchema = ScopeSchema.extend({
  ...LegacyIndexContentSchema.shape,
  _id: MongoIdSchema,
  tmbId: MongoIdSchema,
  mode: z.union([z.enum(TrainingModeEnum), z.literal('rebuild')]),
  dataId: MongoIdSchema.nullish(),
  retryCount: z.int().nonnegative().optional(),
  lockTime: z.date().nullish(),
  errorMsg: z.string().nullish(),
  imageDescMap: z.record(z.string(), z.string()).nullish(),
  dataMetadata: metadata.nullish(),
  chunkIndex: z.int().nonnegative().optional(),
  indexSize: z.int().nonnegative().optional(),
  synonymVersion: z.int().nonnegative().nullish()
});
export type LegacyTask = z.infer<typeof LegacyTaskSchema>;

export const LegacyDataSchema = ScopeSchema.extend({
  _id: MongoIdSchema,
  indexStatus: z.string().nullish(),
  indexError: z.boolean().optional(),
  indexErrorMsg: z.string().nullish(),
  rebuilding: z.boolean().optional(),
  synonymVersion: z.int().nonnegative().nullish(),
  synonymRebuildingVersion: z.int().positive().nullish()
});
export type LegacyData = z.infer<typeof LegacyDataSchema>;

// 修复只接受工作载荷和旧错误原因，冻结的归属、工作类型和分块状态继续参与校验。
export const LegacyTaskRepairSchema = LegacyTaskSchema.pick({
  q: true,
  a: true,
  imageId: true,
  indexes: true,
  imageDescMap: true,
  dataMetadata: true,
  chunkIndex: true,
  indexSize: true,
  errorMsg: true
})
  .partial()
  .strict();
export const LegacyDataRepairSchema = z.strictObject({ indexErrorMsg: z.string() });

export class MigrationRecordError extends Error {}

/** 保留可定位字段名，避免把历史任务内容写入迁移错误明细。 */
export const parseRecord = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const field = result.error.issues[0]?.path[0];
  throw new MigrationRecordError(
    `Invalid record field: ${typeof field === 'string' ? field : 'document'}`
  );
};

export const insufficientPoints = 'common:code_error.team_error.ai_points_not_enough';
const blockedLockTime = new Date('2050-01-01');

/** 旧的锁只区分可领取、最终错误与欠费，迁移不沿用它作为暂停时间。 */
export const getTaskError = (task: LegacyTask) => {
  const blocked =
    task.lockTime !== null && task.lockTime !== undefined && task.lockTime >= blockedLockTime;
  if (blocked && task.errorMsg === insufficientPoints) return undefined;
  if (!blocked && (task.retryCount ?? 0) > 0) return undefined;
  if (task.errorMsg?.trim()) return task.errorMsg;
  throw new MigrationRecordError('Stopped legacy training is missing its error');
};
