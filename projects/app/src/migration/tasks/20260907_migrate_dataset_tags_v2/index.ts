import { z } from 'zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { Types } from '@fastgpt/service/common/mongo';
import {
  migrateCollectionTagValues,
  migrateDatasetTagDefinitions,
  migrationCollections,
  validateDatasetTagMigration,
  type DatasetTagMigrationRecord,
  type MigrationRecordResult
} from './service';

const StageKeySchema = z.enum(['datasets', 'collections']);
type StageKey = z.infer<typeof StageKeySchema>;

const StageStateSchema = z.object({
  initialized: z.boolean(),
  completed: z.boolean(),
  endId: z.string().nullable(),
  lastId: z.string().nullable(),
  processedCount: z.number().int().nonnegative(),
  migratedCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  deletedDefinitionCount: z.number().int().nonnegative(),
  deletedReferenceCollectionCount: z.number().int().nonnegative()
});
type StageState = z.infer<typeof StageStateSchema>;

const CheckpointSchema = z.object({
  version: z.literal(1),
  stages: z.record(StageKeySchema, StageStateSchema)
});
type Checkpoint = z.infer<typeof CheckpointSchema>;

const createStageState = (): StageState => ({
  initialized: false,
  completed: false,
  endId: null,
  lastId: null,
  processedCount: 0,
  migratedCount: 0,
  total: 0,
  deletedDefinitionCount: 0,
  deletedReferenceCollectionCount: 0
});

const stageKeys = StageKeySchema.options;
const createCheckpoint = (): Checkpoint => ({
  version: 1,
  stages: Object.fromEntries(
    stageKeys.map((key) => [key, createStageState()])
  ) as Checkpoint['stages']
});

const stageQueries: Record<StageKey, Record<string, unknown>> = {
  datasets: { type: { $ne: DatasetTypeEnum.folder } },
  collections: {}
};

/**
 * 4.17.0 阻塞升级：标签定义和 Collection 标签值是新版运行时的前置条件。
 * 任务按两个原始 Mongo 集合的 ObjectId 固定上界分批扫描；单记录写入幂等，业务提交后才推进 checkpoint。
 * 失败直接交给 Runner 阻止 ready，不使用阻塞任务禁止的 failedRecords。
 */
export const migrateDatasetTagsV2 = async (context: SystemMigrationContext) => {
  let checkpoint = (await context.getCheckpoint(CheckpointSchema)) ?? createCheckpoint();

  const saveStage = async (key: StageKey, state: StageState) => {
    checkpoint = { ...checkpoint, stages: { ...checkpoint.stages, [key]: state } };
    await context.saveCheckpoint(checkpoint);
  };

  const runStage = async (
    key: StageKey,
    processRecord: (record: DatasetTagMigrationRecord) => Promise<MigrationRecordResult>
  ) => {
    const collection = migrationCollections[key];
    const query = stageQueries[key];
    let state = checkpoint.stages[key];

    if (!state.initialized) {
      const lastRecord = await collection
        .find({ ...query, _id: { $type: 'objectId' } }, { projection: { _id: 1 } })
        .sort({ _id: -1 })
        .limit(1)
        .next();
      const endId = lastRecord ? String(lastRecord._id) : null;
      const total = endId
        ? await collection.countDocuments({
            ...query,
            _id: { $type: 'objectId', $lte: lastRecord!._id }
          })
        : 0;
      state = { ...state, initialized: true, endId, total };
      await saveStage(key, state);
    }

    await context.reportProgress({
      key,
      status: state.completed
        ? SystemMigrationStatusEnum.succeeded
        : SystemMigrationStatusEnum.running,
      current: state.processedCount,
      total: state.total
    });
    if (state.completed) return state;

    while (state.endId && state.lastId !== state.endId) {
      context.signal.throwIfAborted();
      await context.assertActive();
      const records = (await collection
        .find(
          {
            ...query,
            _id: {
              $type: 'objectId',
              ...(state.lastId ? { $gt: new Types.ObjectId(state.lastId) } : {}),
              $lte: new Types.ObjectId(state.endId)
            }
          },
          { projection: { _id: 1, teamId: 1 } }
        )
        .sort({ _id: 1 })
        .limit(systemMigrationBatchSize)
        .toArray()) as DatasetTagMigrationRecord[];
      if (records.length === 0) break;

      let batchResult: MigrationRecordResult = {};
      for (const record of records) {
        const result = await processRecord(record);
        batchResult = {
          migratedCount: (batchResult.migratedCount ?? 0) + (result.migratedCount ?? 0),
          deletedDefinitionCount:
            (batchResult.deletedDefinitionCount ?? 0) + (result.deletedDefinitionCount ?? 0),
          deletedReferenceCollectionCount:
            (batchResult.deletedReferenceCollectionCount ?? 0) +
            (result.deletedReferenceCollectionCount ?? 0)
        };
      }
      await context.assertActive();
      state = {
        ...state,
        lastId: String(records.at(-1)!._id),
        processedCount: state.processedCount + records.length,
        migratedCount: state.migratedCount + (batchResult.migratedCount ?? 0),
        deletedDefinitionCount:
          state.deletedDefinitionCount + (batchResult.deletedDefinitionCount ?? 0),
        deletedReferenceCollectionCount:
          state.deletedReferenceCollectionCount + (batchResult.deletedReferenceCollectionCount ?? 0)
      };
      await saveStage(key, state);
      await context.reportProgress({
        key,
        status: SystemMigrationStatusEnum.running,
        current: state.processedCount,
        total: state.total
      });
    }

    state = { ...state, completed: true };
    await saveStage(key, state);
    await context.reportProgress({
      key,
      status: SystemMigrationStatusEnum.succeeded,
      current: state.processedCount,
      total: state.total
    });
    return state;
  };

  const datasets = await runStage('datasets', async (record) => {
    if (!record.teamId) throw new Error(`Dataset ${String(record._id)} has no teamId`);
    return migrateDatasetTagDefinitions({ datasetId: record._id, teamId: record.teamId });
  });
  const collections = await runStage('collections', (record) =>
    migrateCollectionTagValues({ collectionId: record._id })
  );

  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  await context.assertActive();
  const validation = await validateDatasetTagMigration().catch(async (error) => {
    checkpoint = createCheckpoint();
    await context.saveCheckpoint(checkpoint);
    throw error;
  });
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });

  return {
    datasetsProcessedCount: datasets.processedCount,
    collectionsMigratedCount: collections.migratedCount,
    duplicateDefinitionsDeletedCount: datasets.deletedDefinitionCount,
    duplicateReferenceCollectionsCleanedCount: datasets.deletedReferenceCollectionCount,
    legacyCollectionCount: validation.legacyCollectionCount
  };
};
