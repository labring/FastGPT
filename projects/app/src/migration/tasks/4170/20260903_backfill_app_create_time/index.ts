import {
  systemMigrationLimits,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { z } from 'zod';
import {
  backfillAppCreateTimeRecord,
  countAppsMissingCreateTime,
  countAppsWithInvalidIdMissingCreateTime,
  getAppCreateTimeFromObjectId,
  initializeAppCreateTimeSnapshot,
  readAppCreateTimeBatch,
  readAppsMissingCreateTime,
  type AppCreateTimeRecord
} from './service';

const STAGE_KEY = 'apps';
const WRITE_CONCURRENCY = 20;

const AppCreateTimeCheckpointSchema = z.object({
  version: z.literal(1),
  initialized: z.boolean(),
  endId: z.string().nullable(),
  lastId: z.string().nullable(),
  processedCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative()
});

/**
 * 按固定 ObjectId 上界和 checkpoint 分批回填 App.createTime。
 * 每条写入使用 CAS，业务提交后先替换完整错误快照再推进游标，因此批次可安全重放。
 */
export const backfillAppCreateTime = async (context: SystemMigrationContext) => {
  const createFailedRecord = ({
    recordId,
    message
  }: {
    recordId: string;
    message: string;
  }): SystemMigrationFailedRecord => ({
    stageKey: STAGE_KEY,
    data: {
      collection: MongoApp.collection.name,
      recordId
    },
    reason: { message: message.slice(0, systemMigrationLimits.maxErrorMessageLength) }
  });
  const getFailedRecordKey = (record: SystemMigrationFailedRecord) => String(record.data.recordId);
  const runInChunks = async (
    records: AppCreateTimeRecord[]
  ): Promise<Array<string | undefined>> => {
    const results: Array<string | undefined> = [];
    for (let index = 0; index < records.length; index += WRITE_CONCURRENCY) {
      results.push(
        ...(await Promise.all(
          records.slice(index, index + WRITE_CONCURRENCY).map(backfillAppCreateTimeRecord)
        ))
      );
    }
    return results;
  };
  const processRecords = async (
    records: AppCreateTimeRecord[],
    failedRecordMap: Map<string, SystemMigrationFailedRecord>
  ) => {
    const results = await runInChunks(records);
    records.forEach((record, index) => {
      const recordId = String(record._id);
      failedRecordMap.delete(recordId);
      const message = results[index];
      if (message) failedRecordMap.set(recordId, createFailedRecord({ recordId, message }));
    });
  };

  let checkpoint: z.infer<typeof AppCreateTimeCheckpointSchema> = (await context.getCheckpoint(
    AppCreateTimeCheckpointSchema
  )) ?? {
    version: 1,
    initialized: false,
    endId: null,
    lastId: null,
    processedCount: 0,
    total: 0
  };

  if (!checkpoint.initialized) {
    const snapshot = await initializeAppCreateTimeSnapshot();
    checkpoint = { ...checkpoint, initialized: true, ...snapshot };
    await context.saveCheckpoint(checkpoint);
  }

  await context.reportProgress({
    key: STAGE_KEY,
    status: SystemMigrationStatusEnum.running,
    current: checkpoint.processedCount,
    total: checkpoint.total
  });

  const failedRecordMap = new Map(
    (await context.getFailedRecords())
      .filter((record) => record.stageKey === STAGE_KEY)
      .map((record) => [getFailedRecordKey(record), record])
  );

  // checkpoint 可能已经越过坏数据，管理员重试时必须优先处理完整错误快照。
  const failedRecords = [...failedRecordMap.values()];
  for (let index = 0; index < failedRecords.length; index += systemMigrationBatchSize) {
    await context.assertActive();
    const retryRecords = (
      await Promise.all(
        failedRecords.slice(index, index + systemMigrationBatchSize).map(async (failedRecord) => {
          const recordId = String(failedRecord.data.recordId);
          const createTime = getAppCreateTimeFromObjectId(recordId);
          if (!createTime) return undefined;
          return MongoApp.collection.findOne(
            { _id: new Types.ObjectId(recordId) },
            { projection: { _id: 1, createTime: 1 } }
          );
        })
      )
    ).filter((record): record is AppCreateTimeRecord => Boolean(record));
    failedRecords.slice(index, index + systemMigrationBatchSize).forEach((record) => {
      failedRecordMap.delete(getFailedRecordKey(record));
    });
    await processRecords(retryRecords, failedRecordMap);
    await context.reportFailedRecords([...failedRecordMap.values()]);
  }

  while (checkpoint.endId && checkpoint.lastId !== checkpoint.endId) {
    await context.assertActive();
    const records = await readAppCreateTimeBatch({
      endId: checkpoint.endId,
      lastId: checkpoint.lastId,
      limit: systemMigrationBatchSize
    });
    if (records.length === 0) break;

    await processRecords(records, failedRecordMap);
    checkpoint = {
      ...checkpoint,
      lastId: String(records.at(-1)!._id),
      processedCount: checkpoint.processedCount + records.length
    };
    await context.reportFailedRecords([...failedRecordMap.values()]);
    await context.saveCheckpoint(checkpoint);
    await context.reportProgress({
      key: STAGE_KEY,
      status: SystemMigrationStatusEnum.running,
      current: checkpoint.processedCount,
      total: checkpoint.total
    });
  }

  // 任务位于 4.17.0 队列末尾；完整尾扫补齐滚动升级期间旧节点的新写入。
  let tailLastId: string | null = null;
  while (true) {
    await context.assertActive();
    const records = await readAppsMissingCreateTime({
      lastId: tailLastId,
      limit: systemMigrationBatchSize
    });
    if (records.length === 0) break;

    await processRecords(records, failedRecordMap);
    await context.reportFailedRecords([...failedRecordMap.values()]);
    tailLastId = String(records.at(-1)!._id);
  }

  const remainingCount = await countAppsMissingCreateTime();
  if (failedRecordMap.size > 0 || remainingCount > 0) {
    await context.fail({
      message: `${Math.max(failedRecordMap.size, remainingCount)} apps still lack createTime`,
      failedRecords: [...failedRecordMap.values()]
    });
  }

  const skippedInvalidId = await countAppsWithInvalidIdMissingCreateTime();
  await context.reportProgress({
    key: STAGE_KEY,
    status: SystemMigrationStatusEnum.succeeded,
    current: checkpoint.total,
    total: checkpoint.total
  });
  context.logger.info('App createTime migration completed', {
    processedCount: checkpoint.processedCount,
    skippedInvalidId
  });

  return {
    processedCount: checkpoint.processedCount,
    skippedInvalidId
  };
};
