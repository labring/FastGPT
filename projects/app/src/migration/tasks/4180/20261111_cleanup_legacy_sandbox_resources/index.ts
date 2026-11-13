/**
 * 任务 2（`20261111_cleanup_legacy_sandbox_resources`）：
 * 显式依赖任务 1（`20261111_migrate_sandbox_to_juicefs`），在线上验收稳定、确认无需回滚后，
 * 由管理员手动触发回收旧容器、旧无标签卷、S3 `package.zip`、Sealos Devbox 与 `v2` 表记录。
 */
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { IntSchema } from '@fastgpt/global/common/zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { z } from 'zod';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  getSandboxMigrationEnv,
  sanitizeMigrationErrorMessage
} from '../sandbox_migration_shared/env';
import { getLegacySandboxV2Collection } from '../sandbox_migration_shared/legacySchema';
import { cleanupSingleLegacySandboxRecord, runLegacySandboxCleanupPreflight } from './service';

const CheckpointSchema = z.object({
  endId: ObjectIdSchema.nullable(),
  lastId: ObjectIdSchema.nullable(),
  scanned: IntSchema,
  cleanedCount: IntSchema
});

/**
 * 分批游标扫描并物理清理旧版沙箱残留资源及 `v2` 文档。
 */
export const cleanupLegacySandboxResources = async (context: SystemMigrationContext) => {
  const v2Collection = getLegacySandboxV2Collection();
  const existingFailures = await context.getFailedRecords();
  let checkpoint = await context.getCheckpoint(CheckpointSchema);

  await context.reportProgress({ key: 'preflight', status: SystemMigrationStatusEnum.running });
  await context.assertActive();

  // 1. 空表快路径：v2 无任何记录时无需外部凭证直接成功收尾。
  const latestDoc = await v2Collection.findOne({}, { projection: { _id: 1 }, sort: { _id: -1 } });
  if (!latestDoc && existingFailures.length === 0) {
    const doneCheckpoint = {
      endId: null,
      lastId: null,
      scanned: checkpoint?.scanned ?? 0,
      cleanedCount: checkpoint?.cleanedCount ?? 0
    };
    await context.saveCheckpoint(doneCheckpoint);
    await context.reportProgress({
      key: 'preflight',
      status: SystemMigrationStatusEnum.succeeded
    });
    await context.reportProgress({
      key: 'cleanup',
      status: SystemMigrationStatusEnum.succeeded,
      current: doneCheckpoint.cleanedCount
    });
    await context.reportProgress({
      key: 'validation',
      status: SystemMigrationStatusEnum.succeeded
    });
    return { cleanedCount: doneCheckpoint.cleanedCount };
  }

  try {
    await runLegacySandboxCleanupPreflight({ signal: context.signal });
  } catch (error) {
    context.signal.throwIfAborted();
    await context.fail({
      message: sanitizeMigrationErrorMessage(error)
    });
  }
  await context.reportProgress({ key: 'preflight', status: SystemMigrationStatusEnum.succeeded });

  if (!checkpoint) {
    checkpoint = {
      endId: latestDoc ? String(latestDoc._id) : null,
      lastId: null,
      scanned: 0,
      cleanedCount: 0
    };
    await context.saveCheckpoint(checkpoint);
  }

  const { concurrency } = getSandboxMigrationEnv();
  const failures = new Map<string, SystemMigrationFailedRecord>();
  for (const failure of existingFailures) {
    failures.set(String(failure.data.id), failure);
  }

  const runCleanupBatch = async (ids: string[]) => {
    let batchCleaned = 0;

    await batchRun(
      ids,
      async (id) => {
        context.signal.throwIfAborted();
        try {
          const res = await cleanupSingleLegacySandboxRecord({
            id,
            signal: context.signal
          });
          failures.delete(id);
          if (res.outcome === 'cleaned') {
            batchCleaned += 1;
          }
        } catch (error) {
          context.signal.throwIfAborted();
          const reasonMessage = sanitizeMigrationErrorMessage(error);
          context.logger.warn('Failed to clean up legacy v2 sandbox record', {
            id,
            reason: reasonMessage
          });
          failures.set(id, {
            stageKey: 'cleanup',
            data: { id },
            reason: { message: reasonMessage }
          });
        }
      },
      concurrency
    );

    return batchCleaned;
  };

  // 2. 优先重试上次清理失败的记录。
  await context.reportProgress({
    key: 'cleanup',
    status: SystemMigrationStatusEnum.running,
    current: checkpoint.cleanedCount
  });

  if (failures.size > 0) {
    await context.assertActive();
    const retryCleaned = await runCleanupBatch([...failures.keys()]);
    await context.reportFailedRecords([...failures.values()]);
    checkpoint = {
      ...checkpoint,
      cleanedCount: checkpoint.cleanedCount + retryCleaned
    };
    await context.saveCheckpoint(checkpoint);
  }

  // 3. 分批扫描剩余 v2 记录并逐条回收。
  while (checkpoint.endId) {
    context.signal.throwIfAborted();
    await context.assertActive();

    const records = await v2Collection
      .find(
        {
          _id: {
            $lte: new Types.ObjectId(checkpoint.endId),
            ...(checkpoint.lastId ? { $gt: new Types.ObjectId(checkpoint.lastId) } : {})
          }
        },
        { projection: { _id: 1 } }
      )
      .sort({ _id: 1 })
      .limit(systemMigrationBatchSize)
      .toArray();
    if (records.length === 0) break;

    const batchIds = records.map((record) => String(record._id));
    const batchCleaned = await runCleanupBatch(batchIds);

    await context.reportFailedRecords([...failures.values()]);
    checkpoint = {
      ...checkpoint,
      lastId: batchIds.at(-1) ?? checkpoint.lastId,
      scanned: checkpoint.scanned + records.length,
      cleanedCount: checkpoint.cleanedCount + batchCleaned
    };
    await context.saveCheckpoint(checkpoint);
    await context.reportProgress({
      key: 'cleanup',
      status: SystemMigrationStatusEnum.running,
      current: checkpoint.cleanedCount
    });

    if (failures.size >= systemMigrationBatchSize * 10) {
      await context.fail({
        message: 'Too many legacy sandbox cleanup failures; inspect failed records',
        failedRecords: [...failures.values()]
      });
    }
  }

  if (failures.size > 0) {
    await context.fail({
      message: 'Some legacy sandbox resources could not be cleaned; inspect failed records',
      failedRecords: [...failures.values()]
    });
  }

  await context.reportProgress({
    key: 'cleanup',
    status: SystemMigrationStatusEnum.succeeded,
    current: checkpoint.cleanedCount
  });

  // 4. 完成校验：断言 agent_sandbox_instances_v2 已清空至 0 条记录。
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  await context.assertActive();

  const remaining = await v2Collection
    .find({}, { projection: { _id: 1 } })
    .sort({ _id: 1 })
    .limit(systemMigrationBatchSize)
    .toArray();
  if (remaining.length > 0) {
    await context.fail({
      message: 'Legacy v2 sandbox collection still has remaining records',
      failedRecords: remaining.map(({ _id }) => ({
        stageKey: 'validation',
        data: { id: String(_id) },
        reason: { message: 'Legacy v2 sandbox record still exists; retry cleanup' }
      }))
    });
  }

  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });
  return { cleanedCount: checkpoint.cleanedCount };
};
