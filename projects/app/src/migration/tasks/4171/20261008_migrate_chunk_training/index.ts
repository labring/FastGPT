import { z } from 'zod';
import { Types } from '@fastgpt/service/common/mongo';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  countLegacyTrainings,
  getLegacyTrainingEndId,
  LegacyTrainingValidationError,
  migrateLegacyTraining,
  readLegacyTrainingBatch
} from './service';

const CursorSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/)
  .nullable();
const CheckpointSchema = z
  .object({
    version: z.literal(1),
    endId: CursorSchema,
    lastId: CursorSchema
  })
  .refine(({ endId, lastId }) => !lastId || (!!endId && lastId <= endId));

/**
 * 手动触发的分批断点迁移：逐条事务提交，先重试旧失败，再扫描固定上界内的历史任务。
 * 完整错误快照先于断点持久化，确保业务提交后崩溃可安全重放，坏数据不会被游标永久跳过。
 * 全局仍有旧任务时不报告成功；先重置扫描窗口，使管理员停掉遗漏的旧生产者后能再次重试。
 */
export const migrateChunkTraining = async (context: SystemMigrationContext) => {
  await context.reportProgress({ key: 'trainings', status: SystemMigrationStatusEnum.running });
  await context.assertActive();
  const failedRecords = new Map<string, SystemMigrationFailedRecord>();
  for (const record of await context.getFailedRecords()) {
    const id = z
      .string()
      .regex(/^[a-f0-9]{24}$/)
      .parse(record.data.trainingId);
    failedRecords.set(id, record);
  }
  let checkpoint = await context.getCheckpoint(CheckpointSchema);
  if (!checkpoint || !checkpoint.endId) {
    checkpoint = { version: 1, endId: await getLegacyTrainingEndId(), lastId: null };
  }

  /** 每条记录前校验执行权；只收集可定位的数据错误，不把数据库异常当成坏数据跳过。 */
  const migrateOne = async (id: string) => {
    context.signal.throwIfAborted();
    await context.assertActive();
    try {
      await migrateLegacyTraining(new Types.ObjectId(id));
      failedRecords.delete(id);
    } catch (error) {
      if (!(error instanceof LegacyTrainingValidationError)) throw error;
      failedRecords.set(id, {
        stageKey: 'trainings',
        data: { trainingId: id },
        reason: { message: error.message }
      });
    }
  };

  const retryIds = Array.from(failedRecords.keys());
  for (let offset = 0; offset < retryIds.length; offset += systemMigrationBatchSize) {
    for (const id of retryIds.slice(offset, offset + systemMigrationBatchSize))
      await migrateOne(id);
    await context.reportFailedRecords(Array.from(failedRecords.values()));
  }

  while (checkpoint.endId) {
    context.signal.throwIfAborted();
    await context.assertActive();
    const batch = await readLegacyTrainingBatch({
      ...checkpoint,
      endId: checkpoint.endId,
      limit: systemMigrationBatchSize
    });
    if (!batch.length) break;
    for (const task of batch) await migrateOne(String(task._id));
    await context.reportFailedRecords(Array.from(failedRecords.values()));
    checkpoint.lastId = String(batch[batch.length - 1]._id);
    await context.saveCheckpoint(checkpoint);
    await context.reportProgress({ key: 'trainings', status: SystemMigrationStatusEnum.running });
  }
  if (failedRecords.size > 0) {
    await context.fail({
      message: `${failedRecords.size} legacy training tasks need repair before retrying`,
      failedRecords: Array.from(failedRecords.values())
    });
  }
  await context.reportProgress({ key: 'trainings', status: SystemMigrationStatusEnum.succeeded });
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  await context.assertActive();
  const remainingCount = await countLegacyTrainings();
  if (remainingCount > 0) {
    // 重新打开有界扫描窗口；不在本次运行里追逐仍在写入的旧生产者。
    await context.saveCheckpoint({ version: 1, endId: null, lastId: null });
    await context.fail({
      message: `${remainingCount} legacy training tasks remain; stop old producers before retrying`
    });
  }
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });
  return { remainingCount };
};
