import {
  systemMigrationLimits,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { z } from 'zod';
import {
  backfillDatasetCreateTimeRecord,
  countDatasetsMissingCreateTime,
  countDatasetsWithInvalidIdMissingCreateTime,
  getDatasetCreateTimeFromObjectId,
  initializeDatasetCreateTimeSnapshot,
  readDatasetCreateTimeBatch,
  readDatasetsMissingCreateTime
} from './datasetService';
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

const WRITE_CONCURRENCY = 20;

const CreateTimeStateSchema = z.object({
  initialized: z.boolean(),
  completed: z.boolean(),
  endId: z.string().nullable(),
  lastId: z.string().nullable(),
  processedCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative()
});
type CreateTimeState = z.infer<typeof CreateTimeStateSchema>;

const LegacyAppCreateTimeCheckpointSchema = CreateTimeStateSchema.omit({ completed: true }).extend({
  version: z.literal(1)
});
const ResourceCreateTimeCheckpointV2Schema = z.object({
  version: z.literal(2),
  apps: CreateTimeStateSchema,
  datasets: CreateTimeStateSchema
});
type ResourceCreateTimeCheckpoint = z.infer<typeof ResourceCreateTimeCheckpointV2Schema>;

const createInitialState = (): CreateTimeState => ({
  initialized: false,
  completed: false,
  endId: null,
  lastId: null,
  processedCount: 0,
  total: 0
});

// 兼容开发环境中已经保存的 v1 App checkpoint；升级后会重新校验 App，再继续 Dataset。
const ResourceCreateTimeCheckpointSchema = z
  .union([ResourceCreateTimeCheckpointV2Schema, LegacyAppCreateTimeCheckpointSchema])
  .transform(
    (checkpoint): ResourceCreateTimeCheckpoint =>
      checkpoint.version === 2
        ? checkpoint
        : {
            version: 2,
            apps: {
              initialized: checkpoint.initialized,
              completed: false,
              endId: checkpoint.endId,
              lastId: checkpoint.lastId,
              processedCount: checkpoint.processedCount,
              total: checkpoint.total
            },
            datasets: createInitialState()
          }
  );

type CreateTimeRecord = AppCreateTimeRecord;
type CreateTimeStageKey = 'apps' | 'datasets';
type CreateTimeStageConfig = {
  stageKey: CreateTimeStageKey;
  resourceName: string;
  collectionName: string;
  getCreateTimeFromObjectId: (id: unknown) => Date | undefined;
  initializeSnapshot: () => Promise<{ endId: string | null; total: number }>;
  readBatch: (input: {
    endId: string;
    lastId: string | null;
    limit: number;
  }) => Promise<CreateTimeRecord[]>;
  readMissing: (input: { lastId: string | null; limit: number }) => Promise<CreateTimeRecord[]>;
  backfillRecord: (record: CreateTimeRecord) => Promise<string | undefined>;
  findRecord: (recordId: string) => Promise<CreateTimeRecord | null>;
  countMissing: () => Promise<number>;
  countInvalidId: () => Promise<number>;
};

const stageConfigs: CreateTimeStageConfig[] = [
  {
    stageKey: 'apps',
    resourceName: 'apps',
    collectionName: MongoApp.collection.name,
    getCreateTimeFromObjectId: getAppCreateTimeFromObjectId,
    initializeSnapshot: initializeAppCreateTimeSnapshot,
    readBatch: readAppCreateTimeBatch,
    readMissing: readAppsMissingCreateTime,
    backfillRecord: backfillAppCreateTimeRecord,
    findRecord: (recordId) =>
      MongoApp.collection.findOne(
        { _id: new Types.ObjectId(recordId) },
        { projection: { _id: 1, createTime: 1 } }
      ),
    countMissing: countAppsMissingCreateTime,
    countInvalidId: countAppsWithInvalidIdMissingCreateTime
  },
  {
    stageKey: 'datasets',
    resourceName: 'datasets',
    collectionName: MongoDataset.collection.name,
    getCreateTimeFromObjectId: getDatasetCreateTimeFromObjectId,
    initializeSnapshot: initializeDatasetCreateTimeSnapshot,
    readBatch: readDatasetCreateTimeBatch,
    readMissing: readDatasetsMissingCreateTime,
    backfillRecord: backfillDatasetCreateTimeRecord,
    findRecord: (recordId) =>
      MongoDataset.collection.findOne(
        { _id: new Types.ObjectId(recordId) },
        { projection: { _id: 1, createTime: 1 } }
      ),
    countMissing: countDatasetsMissingCreateTime,
    countInvalidId: countDatasetsWithInvalidIdMissingCreateTime
  }
];

/**
 * 在同一迁移任务内分别回填 App 与 Dataset 的 createTime。
 * 每个阶段拥有独立 checkpoint state；记录写入使用 CAS，失败重试不会覆盖业务侧并发写入。
 */
export const backfillResourceCreateTime = async (context: SystemMigrationContext) => {
  let checkpoint =
    (await context.getCheckpoint(ResourceCreateTimeCheckpointSchema)) ??
    ({
      version: 2,
      apps: createInitialState(),
      datasets: createInitialState()
    } satisfies ResourceCreateTimeCheckpoint);

  const runStage = async (config: CreateTimeStageConfig) => {
    let state = checkpoint[config.stageKey];
    const saveState = async (nextState: CreateTimeState) => {
      state = nextState;
      checkpoint = { ...checkpoint, [config.stageKey]: nextState };
      await context.saveCheckpoint(checkpoint);
    };

    if (state.completed) {
      await context.reportProgress({
        key: config.stageKey,
        status: SystemMigrationStatusEnum.succeeded,
        current: state.total,
        total: state.total
      });
      return {
        processedCount: state.processedCount,
        skippedInvalidId: await config.countInvalidId()
      };
    }

    const createFailedRecord = ({
      recordId,
      message
    }: {
      recordId: string;
      message: string;
    }): SystemMigrationFailedRecord => ({
      stageKey: config.stageKey,
      data: { collection: config.collectionName, recordId },
      reason: { message: message.slice(0, systemMigrationLimits.maxErrorMessageLength) }
    });
    const getFailedRecordKey = (record: SystemMigrationFailedRecord) =>
      String(record.data.recordId);
    const runInChunks = async (records: CreateTimeRecord[]): Promise<Array<string | undefined>> => {
      const results: Array<string | undefined> = [];
      for (let index = 0; index < records.length; index += WRITE_CONCURRENCY) {
        results.push(
          ...(await Promise.all(
            records.slice(index, index + WRITE_CONCURRENCY).map(config.backfillRecord)
          ))
        );
      }
      return results;
    };
    const processRecords = async (
      records: CreateTimeRecord[],
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

    if (!state.initialized) {
      const snapshot = await config.initializeSnapshot();
      await saveState({ ...state, initialized: true, ...snapshot });
    }

    await context.reportProgress({
      key: config.stageKey,
      status: SystemMigrationStatusEnum.running,
      current: state.processedCount,
      total: state.total
    });

    const failedRecordMap = new Map(
      (await context.getFailedRecords())
        .filter((record) => record.stageKey === config.stageKey)
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
            if (!config.getCreateTimeFromObjectId(recordId)) return undefined;
            return config.findRecord(recordId);
          })
        )
      ).filter((record): record is CreateTimeRecord => Boolean(record));
      failedRecords.slice(index, index + systemMigrationBatchSize).forEach((record) => {
        failedRecordMap.delete(getFailedRecordKey(record));
      });
      await processRecords(retryRecords, failedRecordMap);
      await context.reportFailedRecords([...failedRecordMap.values()]);
    }

    while (state.endId && state.lastId !== state.endId) {
      await context.assertActive();
      const records = await config.readBatch({
        endId: state.endId,
        lastId: state.lastId,
        limit: systemMigrationBatchSize
      });
      if (records.length === 0) break;

      await processRecords(records, failedRecordMap);
      await context.reportFailedRecords([...failedRecordMap.values()]);
      await saveState({
        ...state,
        lastId: String(records.at(-1)!._id),
        processedCount: state.processedCount + records.length
      });
      await context.reportProgress({
        key: config.stageKey,
        status: SystemMigrationStatusEnum.running,
        current: state.processedCount,
        total: state.total
      });
    }

    // 任务位于 4.17.0 队列末尾；完整尾扫补齐滚动升级期间旧节点的新写入。
    let tailLastId: string | null = null;
    while (true) {
      await context.assertActive();
      const records = await config.readMissing({
        lastId: tailLastId,
        limit: systemMigrationBatchSize
      });
      if (records.length === 0) break;

      await processRecords(records, failedRecordMap);
      await context.reportFailedRecords([...failedRecordMap.values()]);
      tailLastId = String(records.at(-1)!._id);
    }

    const remainingCount = await config.countMissing();
    if (failedRecordMap.size > 0 || remainingCount > 0) {
      await context.fail({
        message: `${Math.max(failedRecordMap.size, remainingCount)} ${config.resourceName} still lack createTime`,
        failedRecords: [...failedRecordMap.values()]
      });
    }

    const skippedInvalidId = await config.countInvalidId();
    await saveState({ ...state, completed: true });
    await context.reportProgress({
      key: config.stageKey,
      status: SystemMigrationStatusEnum.succeeded,
      current: state.total,
      total: state.total
    });
    context.logger.info(`${config.resourceName} createTime migration completed`, {
      processedCount: state.processedCount,
      skippedInvalidId
    });

    return { processedCount: state.processedCount, skippedInvalidId };
  };

  const apps = await runStage(stageConfigs[0]);
  const datasets = await runStage(stageConfigs[1]);
  return {
    appsProcessedCount: apps.processedCount,
    datasetsProcessedCount: datasets.processedCount
  };
};
