import { z } from 'zod';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import { Types } from '@fastgpt/service/common/mongo';
import type { SystemMigrationContext } from '@/migration/registry';
import { systemMigrationBatchSize } from '@/migration/constants';
import {
  getFolderMigrationSnapshot,
  migrateFolderMigrationBatch,
  readFolderMigrationBatch,
  readFolderMigrationDocsByIds
} from './service';

const CursorSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/)
  .nullable();
const CheckpointSchema = z.object({
  version: z.literal(1),
  stage: z.enum(['apps', 'datasets', 'validation']),
  validationCollection: z.enum(['apps', 'datasets']).optional(),
  endId: CursorSchema,
  lastId: CursorSchema,
  current: z.number().int().nonnegative(),
  total: z.number().int().nonnegative()
});
type Checkpoint = z.infer<typeof CheckpointSchema>;
type CollectionStage = 'apps' | 'datasets';

const getFailedRecordKey = (record: SystemMigrationFailedRecord) =>
  `${String(record.data.collection)}:${String(record.data.documentId)}`;

const toFailedRecord = ({
  stage,
  id,
  reason
}: {
  stage: CollectionStage;
  id: string;
  reason: string;
}): SystemMigrationFailedRecord => ({
  stageKey: stage,
  data: { collection: stage, documentId: id },
  reason: { message: reason }
});

/** 以 parentId 重建全部文件夹路径；异常记录跳过写入并保留为可重试失败项。 */
export const backfillFolderAncestorIds = async (context: SystemMigrationContext) => {
  let checkpoint = await context.getCheckpoint(CheckpointSchema);
  const failedRecords = new Map<string, SystemMigrationFailedRecord>();
  const originalRecords = await context.getFailedRecords();
  originalRecords.forEach((record) => failedRecords.set(getFailedRecordKey(record), record));

  const snapshotFailedRecords = () =>
    Array.from(failedRecords.values()).sort((a, b) =>
      getFailedRecordKey(a).localeCompare(getFailedRecordKey(b))
    );
  let failedSnapshot = JSON.stringify(snapshotFailedRecords());
  const reportFailedChanges = async () => {
    const records = snapshotFailedRecords();
    const nextSnapshot = JSON.stringify(records);
    if (nextSnapshot === failedSnapshot) return;
    await context.reportFailedRecords(records);
    failedSnapshot = nextSnapshot;
  };

  // 先重试断点游标之前已记录的坏数据，避免管理员修复后被断点跳过。
  for (const stage of ['apps', 'datasets'] as const) {
    const stageRecords = () =>
      snapshotFailedRecords().filter((record) => record.stageKey === stage);
    const records = stageRecords();
    for (let offset = 0; offset < records.length; offset += systemMigrationBatchSize) {
      context.signal.throwIfAborted();
      await context.assertActive();
      const batchRecords = records.slice(offset, offset + systemMigrationBatchSize);
      const docs = await readFolderMigrationDocsByIds({
        stage,
        ids: batchRecords.map((record) => String(record.data.documentId))
      });
      const docIds = new Set(docs.map((doc) => String(doc._id)));
      const { errors } = await migrateFolderMigrationBatch({ stage, docs });
      const errorsById = new Map(errors.map((error) => [error.id, error.reason]));
      for (const record of batchRecords) {
        const id = String(record.data.documentId);
        const key = getFailedRecordKey(record);
        if (!docIds.has(id)) {
          failedRecords.delete(key);
        } else if (errorsById.has(id)) {
          failedRecords.set(
            key,
            toFailedRecord({ stage, id, reason: errorsById.get(id) ?? 'invalid folder path' })
          );
        } else {
          failedRecords.delete(key);
        }
      }
      await reportFailedChanges();
    }
  }

  // 校验阶段恢复时重新从头扫描，确保此前游标之前修复的记录也会纳入校验。
  if (checkpoint?.stage === 'validation' && originalRecords.length > 0) {
    const appSnapshot = await getFolderMigrationSnapshot('apps');
    checkpoint = {
      version: 1,
      stage: 'validation',
      validationCollection: 'apps',
      endId: appSnapshot.endId ? String(appSnapshot.endId) : null,
      lastId: null,
      current: 0,
      total: appSnapshot.total
    };
    await context.saveCheckpoint(checkpoint);
  }

  const makeStageCheckpoint = async (stage: CollectionStage): Promise<Checkpoint> => {
    const snapshot = await getFolderMigrationSnapshot(stage);
    return {
      version: 1,
      stage,
      endId: snapshot.endId ? String(snapshot.endId) : null,
      lastId: null,
      current: 0,
      total: snapshot.total
    };
  };

  if (!checkpoint) {
    checkpoint = await makeStageCheckpoint('apps');
    await context.saveCheckpoint(checkpoint);
  }

  // 按稳定 ObjectId 断点扫描应用与知识库集合。
  for (const stage of ['apps', 'datasets'] as const) {
    if (checkpoint.stage === 'validation') break;
    if (checkpoint.stage === 'datasets' && stage === 'apps') {
      await context.reportProgress({ key: 'apps', status: SystemMigrationStatusEnum.succeeded });
      continue;
    }
    if (checkpoint.stage === 'apps' && stage === 'datasets') {
      checkpoint = await makeStageCheckpoint('datasets');
      await context.saveCheckpoint(checkpoint);
    }

    await context.reportProgress({
      key: stage,
      status: SystemMigrationStatusEnum.running,
      current: checkpoint.current,
      total: checkpoint.total
    });
    while (checkpoint.endId) {
      context.signal.throwIfAborted();
      await context.assertActive();
      const docs = await readFolderMigrationBatch({
        stage,
        lastId: checkpoint.lastId ? new Types.ObjectId(checkpoint.lastId) : null,
        endId: new Types.ObjectId(checkpoint.endId),
        limit: systemMigrationBatchSize
      });
      if (docs.length === 0) break;

      const { errors } = await migrateFolderMigrationBatch({ stage, docs });
      const errorsById = new Map(errors.map((error) => [error.id, error.reason]));
      for (const doc of docs) {
        const id = String(doc._id);
        const key = `${stage}:${id}`;
        const reason = errorsById.get(id);
        if (reason) failedRecords.set(key, toFailedRecord({ stage, id, reason }));
        else failedRecords.delete(key);
      }
      await reportFailedChanges();

      checkpoint.lastId = String(docs[docs.length - 1]._id);
      checkpoint.current += docs.length;
      await context.saveCheckpoint(checkpoint);
      await context.reportProgress({
        key: stage,
        status: SystemMigrationStatusEnum.running,
        current: checkpoint.current,
        total: checkpoint.total
      });
    }

    await context.reportProgress({
      key: stage,
      status: SystemMigrationStatusEnum.succeeded,
      current: checkpoint.current,
      total: checkpoint.total
    });
    if (stage === 'apps') {
      checkpoint = await makeStageCheckpoint('datasets');
      await context.saveCheckpoint(checkpoint);
    } else {
      const appSnapshot = await getFolderMigrationSnapshot('apps');
      const datasetSnapshot = await getFolderMigrationSnapshot('datasets');
      checkpoint = {
        version: 1,
        stage: 'validation',
        validationCollection: 'apps',
        endId: appSnapshot.endId ? String(appSnapshot.endId) : null,
        lastId: null,
        current: 0,
        total: appSnapshot.total + datasetSnapshot.total
      };
      await context.saveCheckpoint(checkpoint);
    }
  }

  // 写入完成后验证完整快照；验证阶段同样使用稳定批次和断点。
  if (checkpoint.stage === 'validation') {
    await context.reportProgress({ key: 'apps', status: SystemMigrationStatusEnum.succeeded });
    await context.reportProgress({ key: 'datasets', status: SystemMigrationStatusEnum.succeeded });
    await context.reportProgress({
      key: 'validation',
      status: SystemMigrationStatusEnum.running,
      current: checkpoint.current,
      total: checkpoint.total
    });

    for (const stage of ['apps', 'datasets'] as const) {
      if (checkpoint.validationCollection === 'datasets' && stage === 'apps') continue;
      if (checkpoint.validationCollection === 'apps' && stage === 'datasets') {
        const snapshot = await getFolderMigrationSnapshot('datasets');
        checkpoint.validationCollection = 'datasets';
        checkpoint.endId = snapshot.endId ? String(snapshot.endId) : null;
        checkpoint.lastId = null;
        checkpoint.total = checkpoint.current + snapshot.total;
        await context.saveCheckpoint(checkpoint);
      }

      while (checkpoint.endId) {
        context.signal.throwIfAborted();
        await context.assertActive();
        const docs = await readFolderMigrationBatch({
          stage,
          lastId: checkpoint.lastId ? new Types.ObjectId(checkpoint.lastId) : null,
          endId: new Types.ObjectId(checkpoint.endId),
          limit: systemMigrationBatchSize
        });
        if (docs.length === 0) break;

        const { errors } = await migrateFolderMigrationBatch({ stage, docs, verifyOnly: true });
        const errorsById = new Map(errors.map((error) => [error.id, error.reason]));
        for (const doc of docs) {
          const id = String(doc._id);
          const key = `${stage}:${id}`;
          const reason = errorsById.get(id);
          if (reason) failedRecords.set(key, toFailedRecord({ stage, id, reason }));
          else failedRecords.delete(key);
        }
        await reportFailedChanges();

        checkpoint.lastId = String(docs[docs.length - 1]._id);
        checkpoint.current += docs.length;
        await context.saveCheckpoint(checkpoint);
        await context.reportProgress({
          key: 'validation',
          status: SystemMigrationStatusEnum.running,
          current: checkpoint.current,
          total: checkpoint.total
        });
      }
      if (stage === 'apps') {
        const snapshot = await getFolderMigrationSnapshot('datasets');
        checkpoint.validationCollection = 'datasets';
        checkpoint.endId = snapshot.endId ? String(snapshot.endId) : null;
        checkpoint.lastId = null;
        checkpoint.total = checkpoint.current + snapshot.total;
        await context.saveCheckpoint(checkpoint);
      }
    }

    const unresolvedRecords = snapshotFailedRecords();
    if (unresolvedRecords.length > 0) {
      await context.fail({
        message: `${unresolvedRecords.length} folder records could not be migrated; repair the listed records and retry`,
        failedRecords: unresolvedRecords
      });
    }

    await context.reportProgress({
      key: 'validation',
      status: SystemMigrationStatusEnum.succeeded,
      current: checkpoint.total,
      total: checkpoint.total
    });
    return { scannedCount: checkpoint.total, failedCount: 0 };
  }

  return { scannedCount: checkpoint.current, failedCount: snapshotFailedRecords().length };
};
