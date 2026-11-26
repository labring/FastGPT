import { SystemMigrationStatusEnum as Status } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { Types } from '@fastgpt/service/common/mongo';
import { LeaseCache, RedisLeaseUnavailableError } from '@fastgpt/dal/redis/caches/lease';
import { datasetTrainingMQService } from '@fastgpt/dal/redis/bullmq/services/datasetTraining';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { MigrationRecordError } from './records';
import { applySource, preflightSource, validateAndRefreshRounds, validateSource } from './service';
import {
  CheckpointSchema,
  copySnapshotBatch,
  countSnapshot,
  getInitialCheckpoint,
  getSnapshot,
  hasLegacySources,
  prepareSnapshotIndexes,
  readSnapshotBatch,
  sourceStages,
  streamSnapshot,
  type Checkpoint,
  type SnapshotRow,
  type SourceStage
} from './snapshot';

const stages = ['preflight', ...sourceStages, 'validation'] as const;
const reconcileLease = new LeaseCache();
const maxFailureRecords = 500;

const emptyResult = () => ({
  legacyTasks: 0,
  candidateData: 0,
  documents: 0,
  parse: 0,
  qa: 0,
  data: 0,
  duplicateParse: 0,
  indexed: 0,
  deletedParent: 0,
  rebuildSource: 0,
  coveredData: 0
});

/** 迁移使用固定源快照与分批断点，允许在 Mongo 提交后、游标保存前安全重放。 */
export const migrateDatasetDocumentTraining = async (context: SystemMigrationContext) => {
  const checkpoint = await context.getCheckpoint(CheckpointSchema);
  const failedRecords = await context.getFailedRecords();
  const hasSnapshot =
    !checkpoint &&
    ((await getSnapshot('legacyTasks').findOne({}, { projection: { _id: 1 } })) ||
      (await getSnapshot('remainingData').findOne({}, { projection: { _id: 1 } })));
  if (!checkpoint && !hasSnapshot && failedRecords.length === 0 && !(await hasLegacySources())) {
    for (const key of stages) {
      await context.reportProgress({ key, status: Status.running, current: 0, total: 0 });
      await context.reportProgress({ key, status: Status.succeeded, current: 0, total: 0 });
    }
    return emptyResult();
  }

  await context.reportProgress({ key: 'preflight', status: Status.running });
  if (hasSnapshot)
    await context.fail({ message: 'Migration snapshot exists without its checkpoint' });

  const queue = datasetTrainingMQService.getQueue();
  if (!(await queue.isPaused()) || (await queue.getActiveCount()) !== 0) {
    await context.fail({
      message: 'Pause the datasetTraining queue and wait for active jobs to finish'
    });
  }
  try {
    return await reconcileLease.withLease({
      key: 'datasetTrainingReconcile',
      label: 'dataset document training migration',
      ttlMs: 60_000,
      fn: async (lease) => {
        const assertActive = async () => {
          context.signal.throwIfAborted();
          lease.assertValid();
          await context.assertActive();
          lease.assertValid();
        };
        await assertActive();
        const progress = checkpoint ?? (await getInitialCheckpoint());
        if (!checkpoint) await context.saveCheckpoint(progress);
        const failures = new Map(failedRecords.map((record) => [failureKey(record), record]));
        return runMigration({ context, progress, failures, assertActive });
      }
    });
  } catch (error) {
    if (error instanceof RedisLeaseUnavailableError) {
      return context.fail({
        message: 'Dataset training reconciliation is running. Retry after it finishes.'
      });
    }
    throw error;
  }
};

type Run = {
  context: SystemMigrationContext;
  progress: Checkpoint;
  failures: Map<string, SystemMigrationFailedRecord>;
  assertActive: () => Promise<void>;
};

const runMigration = async (run: Run) => {
  const { context, progress, failures, assertActive } = run;
  const execution = {
    migrationId: context.migrationId,
    cutoverAt: new Date(progress.cutoverAt),
    assertActive
  };

  // 完整快照才允许进入业务写入；复制断点只记录已确认写入的一批。
  await sealSnapshots(run);
  if (!progress.preflightDone) {
    for (const stage of sourceStages) {
      const { endId } = progress[stage];
      if (!endId) continue;
      let checked = 0;
      for await (const row of streamSnapshot(stage, endId)) {
        await assertActive();
        await tryRecord({ run, key: 'preflight', stage, row }, () =>
          preflightSource({ stage, row }, execution)
        );
        checked++;
        if (checked % systemMigrationBatchSize === 0 && failures.size > 0) {
          await context.reportFailedRecords([...failures.values()]);
        }
      }
    }
    await failIfUnresolved(run, 'preflight');
    await assertActive();
    await context.reportFailedRecords([...failures.values()]);
    progress.preflightDone = true;
    await context.saveCheckpoint(progress);
  }
  await context.reportProgress({ key: 'preflight', status: Status.succeeded });

  // 旧任务先写出可还原工作，随后处理只存在于分块上的状态。
  for (const stage of sourceStages) {
    const cursor = progress[stage];
    await context.reportProgress({
      key: stage,
      status: Status.running,
      current: cursor.processed,
      total: cursor.total
    });
    const apply = (row: SnapshotRow) => applySource({ stage, row }, execution);
    for (const record of [...failures.values()]) {
      if (record.stageKey !== stage) continue;
      const id = ObjectIdSchema.parse(record.data.id);
      const row = await getSnapshot(stage).findOne({ _id: new Types.ObjectId(id) });
      if (!row) throw new Error(`Frozen source ${id} is missing during retry`);
      await tryRecord({ run, key: stage, stage, row }, () => apply(row));
    }

    while (true) {
      await assertActive();
      const rows = await readSnapshotBatch(stage, cursor);
      const last = rows.at(-1);
      if (!last) break;
      for (const row of rows) await tryRecord({ run, key: stage, stage, row }, () => apply(row));

      await assertActive();
      await context.reportFailedRecords([...failures.values()]);
      cursor.processedThrough = String(last._id);
      cursor.processed += rows.length;
      await context.saveCheckpoint(progress);
      await context.reportProgress({
        key: stage,
        status: Status.running,
        current: cursor.processed,
        total: cursor.total
      });
    }
    await failIfUnresolved(run, stage);
    if (cursor.processed !== cursor.total)
      throw new Error(`Frozen source count changed in ${stage}`);
    await context.reportFailedRecords([...failures.values()]);
    await context.reportProgress({
      key: stage,
      status: Status.succeeded,
      current: cursor.processed,
      total: cursor.total
    });
  }

  // 按原始快照验收，而不是用目标是否非空或旧队列是否为空判断成功。
  await context.reportProgress({ key: 'validation', status: Status.running });
  const result = emptyResult();
  for (const stage of sourceStages) {
    const { endId, total } = progress[stage];
    if (endId) {
      let checked = 0;
      for await (const row of streamSnapshot(stage, endId)) {
        await assertActive();
        await tryRecord({ run, key: 'validation', stage, row }, async () => {
          const kind = await validateSource({ stage, row }, context.migrationId);
          result[kind]++;
        });
        checked++;
        if (checked % systemMigrationBatchSize === 0 && failures.size > 0) {
          await context.reportFailedRecords([...failures.values()]);
        }
      }
      if (checked !== total) throw new Error(`Frozen source count changed in ${stage}`);
    }
    if (stage === 'legacyTasks') result.legacyTasks = total;
    else result.candidateData = total;
  }
  if ([...failures.values()].some(({ data }) => data.sourceStage !== 'round'))
    await context.fail({
      message: 'Dataset training migration still has unresolved records',
      failedRecords: [...failures.values()]
    });
  let reportedRoundFailures = failures.size;
  result.documents = await validateAndRefreshRounds(execution, async (_id, action) => {
    await tryRecord({ run, key: 'validation', stage: 'round', row: { _id } }, action);
    if (failures.size > reportedRoundFailures) {
      reportedRoundFailures = failures.size;
      await context.reportFailedRecords([...failures.values()]);
    }
  });
  await failIfUnresolved(run, 'validation');
  await context.reportFailedRecords([]);
  await assertActive();
  if (!(await datasetTrainingMQService.getQueue().isPaused()))
    await context.fail({
      message: 'The datasetTraining queue was resumed before migration completed'
    });
  await context.reportProgress({ key: 'validation', status: Status.succeeded });
  return result;
};

const sealSnapshots = async ({ context, progress, assertActive }: Run) => {
  if (progress.sealed) return;
  await assertActive();
  await prepareSnapshotIndexes();
  const scans = [
    ['legacyTasks', progress.legacyTasks],
    ['indexStatus', progress.remainingData.indexStatus],
    ['rebuilding', progress.remainingData.rebuilding]
  ] as const;
  for (const [source, cursor] of scans) {
    while (true) {
      await assertActive();
      const last = await copySnapshotBatch({ source, checkpoint: cursor, assertActive });
      if (!last) break;
      await assertActive();
      cursor.copiedThrough = last;
      await context.saveCheckpoint(progress);
    }
  }
  for (const stage of sourceStages) {
    const { endId, total } = progress[stage];
    if ((await countSnapshot(stage, endId)) !== total) {
      await context.fail({
        message: `Incomplete ${stage} snapshot. Restore the missing records from the cutover backup before retrying.`
      });
    }
  }
  await assertActive();
  progress.sealed = true;
  await context.saveCheckpoint(progress);
};

const failureKey = ({ stageKey, data }: SystemMigrationFailedRecord) =>
  `${stageKey}:${data.sourceStage}:${data.id}`;

const tryRecord = async (
  {
    run,
    key,
    stage,
    row
  }: {
    run: Run;
    key: (typeof stages)[number];
    stage: SourceStage | 'round';
    row: Pick<SnapshotRow, '_id'>;
  },
  action: () => Promise<void>
) => {
  const record = { stageKey: key, data: { sourceStage: stage, id: String(row._id) } };
  const id = failureKey({ ...record, reason: { message: '' } });
  try {
    await action();
    run.failures.delete(id);
  } catch (error) {
    if (!(error instanceof MigrationRecordError)) throw error;
    run.failures.set(id, { ...record, reason: { message: error.message } });
    if (run.failures.size >= maxFailureRecords) {
      await run.context.fail({
        message: 'Too many dataset training records need repair',
        failedRecords: [...run.failures.values()]
      });
    }
  }
};

const failIfUnresolved = async ({ context, failures }: Run, stageKey: (typeof stages)[number]) => {
  if ([...failures.values()].some((record) => record.stageKey === stageKey)) {
    await context.fail({
      message: 'Dataset training migration has unresolved source records',
      failedRecords: [...failures.values()]
    });
  }
};
