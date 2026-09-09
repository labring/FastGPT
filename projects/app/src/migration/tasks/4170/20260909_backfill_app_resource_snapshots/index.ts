import {
  systemMigrationLimits,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { z } from 'zod';
import {
  backfillAppResourceRecords,
  backfillAppVersionResourceRecords,
  initializeAppResourceSnapshot,
  readAppResourceBatch,
  readAppResourceRecord,
  readAppVersionResourceBatch,
  readAppVersionResourceRecord,
  readInvalidAppResourceRecordIds,
  validateAppResourceRecords,
  validateAppVersionResourceRecords,
  type AppResourceMigrationBatchResult,
  type AppResourceMigrationFailure,
  type AppResourceMigrationRecord
} from './service';

const VERSION_STAGE_KEY = 'versions';
const APP_STAGE_KEY = 'apps';
const VALIDATION_STAGE_KEY = 'validation';

const StageCheckpointSchema = z.object({
  initialized: z.boolean(),
  completed: z.boolean(),
  endId: z.string().nullable(),
  lastId: z.string().nullable(),
  processedCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative()
});

const AppResourceCheckpointSchema = z.object({
  version: z.literal(1),
  stages: z.object({
    versions: StageCheckpointSchema,
    apps: StageCheckpointSchema
  })
});

type StageCheckpoint = z.infer<typeof StageCheckpointSchema>;
type AppResourceCheckpoint = z.infer<typeof AppResourceCheckpointSchema>;

const emptyStageCheckpoint = (): StageCheckpoint => ({
  initialized: false,
  completed: false,
  endId: null,
  lastId: null,
  processedCount: 0,
  total: 0
});

const getFailedRecordKey = (record: SystemMigrationFailedRecord) =>
  `${record.stageKey}:${String(record.data.recordId)}`;

const createFailedRecord = ({
  stageKey,
  failure
}: {
  stageKey: typeof VERSION_STAGE_KEY | typeof APP_STAGE_KEY;
  failure: AppResourceMigrationFailure;
}): SystemMigrationFailedRecord => ({
  stageKey,
  data: {
    recordId: String(failure.record._id),
    recordType: stageKey === VERSION_STAGE_KEY ? 'app_version' : 'app'
  },
  reason: {
    message: failure.message.slice(0, systemMigrationLimits.maxErrorMessageLength)
  }
});

/**
 * 分批回填 App Version 资源快照和 App 正式版本指针。
 * 数据无固定上界，因此固定 ObjectId 扫描范围并断点续跑；单条 CAS 和无正式 Version 事务
 * 保证业务提交后、checkpoint 保存前退出时可以安全重放。
 */
export const backfillAppResourceSnapshots = async (context: SystemMigrationContext) => {
  const checkpoint: AppResourceCheckpoint = (await context.getCheckpoint(
    AppResourceCheckpointSchema
  )) ?? {
    version: 1,
    stages: {
      versions: emptyStageCheckpoint(),
      apps: emptyStageCheckpoint()
    }
  };
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
  const deleteFailedRecord = (stageKey: string, recordId: unknown) => {
    if (failedRecordMap.delete(`${stageKey}:${String(recordId)}`)) {
      failedRecordSnapshotDirty = true;
    }
  };
  const reportFailedRecordsIfChanged = async () => {
    if (!failedRecordSnapshotDirty) return;
    await context.reportFailedRecords([...failedRecordMap.values()]);
    failedRecordSnapshotDirty = false;
  };
  const replaceFailures = ({
    stageKey,
    records,
    failures
  }: {
    stageKey: typeof VERSION_STAGE_KEY | typeof APP_STAGE_KEY;
    records: AppResourceMigrationRecord[];
    failures: AppResourceMigrationFailure[];
  }) => {
    const failuresById = new Map(failures.map((failure) => [String(failure.record._id), failure]));
    records.forEach((record) => {
      const failure = failuresById.get(String(record._id));
      if (failure) setFailedRecord(createFailedRecord({ stageKey, failure }));
      else deleteFailedRecord(stageKey, record._id);
    });
  };
  const saveCheckpoint = async () => context.saveCheckpoint(checkpoint);

  const runStage = async ({
    stageKey,
    collection,
    readBatch,
    readRecord,
    processRecords
  }: {
    stageKey: typeof VERSION_STAGE_KEY | typeof APP_STAGE_KEY;
    collection: typeof MongoApp.collection | typeof MongoAppVersion.collection;
    readBatch: (params: {
      endId?: string | null;
      lastId: string | null;
      limit: number;
    }) => Promise<AppResourceMigrationRecord[]>;
    readRecord: (id: string) => Promise<AppResourceMigrationRecord | null>;
    processRecords: (
      records: AppResourceMigrationRecord[]
    ) => Promise<AppResourceMigrationBatchResult>;
  }) => {
    let state = checkpoint.stages[stageKey];
    if (!state.initialized) {
      const snapshot = await initializeAppResourceSnapshot(collection);
      state = { ...state, ...snapshot, initialized: true };
      checkpoint.stages[stageKey] = state;
      await saveCheckpoint();
    }
    await context.reportProgress({
      key: stageKey,
      status: SystemMigrationStatusEnum.running,
      current: state.processedCount,
      total: state.total
    });

    const stageFailedRecords = [...failedRecordMap.values()].filter(
      (record) => record.stageKey === stageKey
    );
    for (let index = 0; index < stageFailedRecords.length; index += systemMigrationBatchSize) {
      await context.assertActive();
      const failedRecords = stageFailedRecords.slice(index, index + systemMigrationBatchSize);
      const currentRecords = await Promise.all(
        failedRecords.map((record) => readRecord(String(record.data.recordId)))
      );
      const records = currentRecords.filter((record): record is AppResourceMigrationRecord =>
        Boolean(record)
      );
      failedRecords.forEach((record, recordIndex) => {
        if (!currentRecords[recordIndex]) deleteFailedRecord(stageKey, record.data.recordId);
      });
      const result = await processRecords(records);
      replaceFailures({ stageKey, records, failures: result.failures });
      checkpoint.stages[stageKey] = state;
      await reportFailedRecordsIfChanged();
    }

    if (!state.completed) {
      while (state.endId && state.lastId !== state.endId) {
        await context.assertActive();
        const records = await readBatch({
          endId: state.endId,
          lastId: state.lastId,
          limit: systemMigrationBatchSize
        });
        if (records.length === 0) break;

        const result = await processRecords(records);
        replaceFailures({ stageKey, records, failures: result.failures });
        state.lastId = String(records.at(-1)!._id);
        state.processedCount += records.length;
        checkpoint.stages[stageKey] = state;
        await reportFailedRecordsIfChanged();
        await saveCheckpoint();
        await context.reportProgress({
          key: stageKey,
          status: SystemMigrationStatusEnum.running,
          current: state.processedCount,
          total: state.total
        });
      }

      // 尾扫也固定开始时的上界，覆盖主扫描期间新增数据且避免持续写入拖住本轮任务。
      const tailSnapshot = await initializeAppResourceSnapshot(collection);
      let tailLastId = state.endId;
      while (tailSnapshot.endId && tailLastId !== tailSnapshot.endId) {
        await context.assertActive();
        const records = await readBatch({
          endId: tailSnapshot.endId,
          lastId: tailLastId,
          limit: systemMigrationBatchSize
        });
        if (records.length === 0) break;
        const result = await processRecords(records);
        replaceFailures({ stageKey, records, failures: result.failures });
        checkpoint.stages[stageKey] = state;
        await reportFailedRecordsIfChanged();
        tailLastId = String(records.at(-1)!._id);
      }

      state.completed = true;
      checkpoint.stages[stageKey] = state;
      await saveCheckpoint();
    }
    await context.reportProgress({
      key: stageKey,
      status: SystemMigrationStatusEnum.succeeded,
      current: state.total,
      total: state.total
    });
  };

  await runStage({
    stageKey: VERSION_STAGE_KEY,
    collection: MongoAppVersion.collection,
    readBatch: readAppVersionResourceBatch,
    readRecord: readAppVersionResourceRecord,
    processRecords: backfillAppVersionResourceRecords
  });
  await runStage({
    stageKey: APP_STAGE_KEY,
    collection: MongoApp.collection,
    readBatch: readAppResourceBatch,
    readRecord: readAppResourceRecord,
    processRecords: backfillAppResourceRecords
  });

  await context.reportProgress({
    key: VALIDATION_STAGE_KEY,
    status: SystemMigrationStatusEnum.running
  });
  const [versionValidationSnapshot, appValidationSnapshot] = await Promise.all([
    initializeAppResourceSnapshot(MongoAppVersion.collection),
    initializeAppResourceSnapshot(MongoApp.collection)
  ]);
  let lastVersionId: string | null = null;
  while (versionValidationSnapshot.endId && lastVersionId !== versionValidationSnapshot.endId) {
    await context.assertActive();
    const records = await readAppVersionResourceBatch({
      endId: versionValidationSnapshot.endId,
      lastId: lastVersionId,
      limit: systemMigrationBatchSize
    });
    if (records.length === 0) break;
    replaceFailures({
      stageKey: VERSION_STAGE_KEY,
      records,
      failures: validateAppVersionResourceRecords(records)
    });
    await reportFailedRecordsIfChanged();
    lastVersionId = String(records.at(-1)!._id);
  }
  let lastAppId: string | null = null;
  while (appValidationSnapshot.endId && lastAppId !== appValidationSnapshot.endId) {
    await context.assertActive();
    const records = await readAppResourceBatch({
      endId: appValidationSnapshot.endId,
      lastId: lastAppId,
      limit: systemMigrationBatchSize
    });
    if (records.length === 0) break;
    replaceFailures({
      stageKey: APP_STAGE_KEY,
      records,
      failures: await validateAppResourceRecords(records)
    });
    await reportFailedRecordsIfChanged();
    lastAppId = String(records.at(-1)!._id);
  }
  for (const [stageKey, collection] of [
    [VERSION_STAGE_KEY, MongoAppVersion.collection],
    [APP_STAGE_KEY, MongoApp.collection]
  ] as const) {
    const invalidRecords = await readInvalidAppResourceRecordIds(
      collection,
      systemMigrationBatchSize
    );
    invalidRecords.forEach((record) =>
      setFailedRecord(
        createFailedRecord({
          stageKey,
          failure: { record, message: 'Record _id is not an ObjectId' }
        })
      )
    );
  }
  await reportFailedRecordsIfChanged();
  if (failedRecordMap.size > 0) {
    await context.fail({
      message: `${failedRecordMap.size} App resource records still require migration`,
      failedRecords: [...failedRecordMap.values()]
    });
  }
  await context.reportProgress({
    key: VALIDATION_STAGE_KEY,
    status: SystemMigrationStatusEnum.succeeded
  });

  const versionState = checkpoint.stages.versions;
  const appState = checkpoint.stages.apps;
  return {
    versionsProcessedCount: versionState.processedCount,
    appsProcessedCount: appState.processedCount
  };
};
