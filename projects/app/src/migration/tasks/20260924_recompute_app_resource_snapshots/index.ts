import {
  systemMigrationLimits,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { z } from 'zod';
import {
  initializeAppVersionSnapshot,
  readAppVersionResourceBatch,
  readAppVersionResourceRecord,
  recomputeAppVersionResourceRecords,
  validateAppVersionResourceRecords,
  type AppResourceMigrationFailure,
  type AppResourceMigrationRecord
} from './service';

const STAGE_KEY = 'versions';

const RecomputeAppResourceCheckpointSchema = z.object({
  version: z.literal(1),
  initialized: z.boolean(),
  completed: z.boolean(),
  endId: z.string().nullable(),
  lastId: z.string().nullable(),
  processedCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative()
});

type RecomputeAppResourceCheckpoint = z.infer<typeof RecomputeAppResourceCheckpointSchema>;

const emptyCheckpoint = (): RecomputeAppResourceCheckpoint => ({
  version: 1,
  initialized: false,
  completed: false,
  endId: null,
  lastId: null,
  processedCount: 0,
  total: 0
});

const getFailedRecordKey = (record: SystemMigrationFailedRecord) =>
  `${record.stageKey}:${String(record.data.recordId)}`;

const createFailedRecord = (failure: AppResourceMigrationFailure): SystemMigrationFailedRecord => ({
  stageKey: STAGE_KEY,
  data: {
    recordId: String(failure.record._id),
    recordType: 'app_version'
  },
  reason: {
    message: failure.message.slice(0, systemMigrationLimits.maxErrorMessageLength)
  }
});

/**
 * 重新计算并回填所有 App Version 的 resources 快照。
 * 使用应用所有者权限重新过滤，确保协作编辑或协作者离职不影响历史版本中合法的资源快照。
 */
export const recomputeAppResourceSnapshots = async (context: SystemMigrationContext) => {
  const checkpoint: RecomputeAppResourceCheckpoint =
    (await context.getCheckpoint(RecomputeAppResourceCheckpointSchema)) ?? emptyCheckpoint();

  const failedRecordMap = new Map(
    (await context.getFailedRecords()).map((record) => [getFailedRecordKey(record), record])
  );
  let failedRecordSnapshotDirty = false;

  const setFailedRecord = (record: SystemMigrationFailedRecord) => {
    const key = getFailedRecordKey(record);
    const current = failedRecordMap.get(key);
    if (
      current?.reason.message === record.reason.message &&
      current.data.recordType === record.data.recordType
    ) {
      return;
    }
    failedRecordMap.set(key, record);
    failedRecordSnapshotDirty = true;
  };

  const deleteFailedRecord = (recordId: unknown) => {
    if (failedRecordMap.delete(`${STAGE_KEY}:${String(recordId)}`)) {
      failedRecordSnapshotDirty = true;
    }
  };

  const reportFailedRecordsIfChanged = async () => {
    if (!failedRecordSnapshotDirty) return;
    await context.reportFailedRecords([...failedRecordMap.values()]);
    failedRecordSnapshotDirty = false;
  };

  const syncFailures = ({
    records,
    failures,
    isValidation = false
  }: {
    records: AppResourceMigrationRecord[];
    failures: AppResourceMigrationFailure[];
    isValidation?: boolean;
  }) => {
    const failuresById = new Map(failures.map((failure) => [String(failure.record._id), failure]));
    records.forEach((record) => {
      const failure = failuresById.get(String(record._id));
      const key = `${STAGE_KEY}:${String(record._id)}`;
      if (!failure) {
        deleteFailedRecord(record._id);
      } else if (!isValidation || !failedRecordMap.has(key)) {
        setFailedRecord(createFailedRecord(failure));
      }
    });
  };

  const saveCheckpoint = async () => context.saveCheckpoint(checkpoint);

  if (!checkpoint.initialized) {
    const snapshot = await initializeAppVersionSnapshot();
    checkpoint.initialized = true;
    checkpoint.endId = snapshot.endId;
    checkpoint.total = snapshot.total;
    await saveCheckpoint();
  }

  await context.reportProgress({
    key: STAGE_KEY,
    status: SystemMigrationStatusEnum.running,
    current: checkpoint.processedCount,
    total: checkpoint.total
  });

  // 重试历史失败记录
  const stageFailedRecords = [...failedRecordMap.values()].filter(
    (record) => record.stageKey === STAGE_KEY
  );
  for (let index = 0; index < stageFailedRecords.length; index += systemMigrationBatchSize) {
    await context.assertActive();
    const failedRecords = stageFailedRecords.slice(index, index + systemMigrationBatchSize);
    const currentRecords = await Promise.all(
      failedRecords.map((record) => readAppVersionResourceRecord(String(record.data.recordId)))
    );
    const records = currentRecords.filter((record): record is AppResourceMigrationRecord =>
      Boolean(record)
    );
    failedRecords.forEach((record, recordIndex) => {
      if (!currentRecords[recordIndex]) deleteFailedRecord(record.data.recordId);
    });
    const result = await recomputeAppVersionResourceRecords(records);
    syncFailures({ records, failures: result.failures });
    await reportFailedRecordsIfChanged();
  }

  // 主扫描
  if (!checkpoint.completed) {
    while (checkpoint.endId && checkpoint.lastId !== checkpoint.endId) {
      await context.assertActive();
      const records = await readAppVersionResourceBatch({
        endId: checkpoint.endId,
        lastId: checkpoint.lastId,
        limit: systemMigrationBatchSize
      });
      if (records.length === 0) break;

      const result = await recomputeAppVersionResourceRecords(records);
      syncFailures({ records, failures: result.failures });
      checkpoint.lastId = String(records.at(-1)!._id);
      checkpoint.processedCount += records.length;
      await reportFailedRecordsIfChanged();
      await saveCheckpoint();
      await context.reportProgress({
        key: STAGE_KEY,
        status: SystemMigrationStatusEnum.running,
        current: checkpoint.processedCount,
        total: checkpoint.total
      });
    }

    // 尾扫新增记录
    const tailSnapshot = await initializeAppVersionSnapshot();
    let tailLastId = checkpoint.endId;
    while (tailSnapshot.endId && tailLastId !== tailSnapshot.endId) {
      await context.assertActive();
      const records = await readAppVersionResourceBatch({
        endId: tailSnapshot.endId,
        lastId: tailLastId,
        limit: systemMigrationBatchSize
      });
      if (records.length === 0) break;
      const result = await recomputeAppVersionResourceRecords(records);
      syncFailures({ records, failures: result.failures });
      await reportFailedRecordsIfChanged();
      tailLastId = String(records.at(-1)!._id);
    }

    checkpoint.completed = true;
    await saveCheckpoint();
  }

  // 最终校验
  const validationLastRecord = await readAppVersionResourceBatch({
    endId: null,
    lastId: null,
    limit: 1
  });
  if (validationLastRecord.length > 0) {
    let lastId: string | null = null;
    while (true) {
      await context.assertActive();
      const records = await readAppVersionResourceBatch({
        endId: null,
        lastId,
        limit: systemMigrationBatchSize
      });
      if (records.length === 0) break;
      const invalidSnapshots = validateAppVersionResourceRecords(records);
      syncFailures({ records, failures: invalidSnapshots, isValidation: true });
      lastId = String(records.at(-1)!._id);
    }
  }

  await reportFailedRecordsIfChanged();

  if (failedRecordMap.size > 0) {
    await context.fail({
      message: `Failed to recompute ${failedRecordMap.size} version resource snapshots`
    });
  }

  await context.reportProgress({
    key: STAGE_KEY,
    status: SystemMigrationStatusEnum.succeeded,
    current: checkpoint.processedCount,
    total: checkpoint.processedCount
  });

  return {
    processedCount: checkpoint.processedCount
  };
};
