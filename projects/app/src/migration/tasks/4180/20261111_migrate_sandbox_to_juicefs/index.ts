/**
 * 任务 1（`20261111_migrate_sandbox_to_juicefs`）：
 * 手动触发将 `agent_sandbox_instances_v2` 下的 4 类存量工作区无损迁入 JuiceFS 并写入 `agent_sandbox_instances_v3`。
 *
 * 严格保留旧表、旧卷、S3 `package.zip` 与已暂停的远端 Sealos Devbox，确保验收完成前可随时回滚。
 */
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { IntSchema } from '@fastgpt/global/common/zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { z } from 'zod';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  getSandboxMigrationEnv,
  sanitizeMigrationErrorMessage
} from '../sandbox_migration_shared/env';
import {
  buildMatchingV3SandboxFilter,
  getLegacySandboxV2Collection,
  LegacySandboxV2DocSchema,
  resolveActiveSandboxSourceTeamId
} from '../sandbox_migration_shared/legacySchema';
import {
  hasLiveLegacyV2MigrationCandidate,
  migrateSingleLegacySandboxRecord,
  runSandboxMigrationPreflight
} from './service';

const CheckpointSchema = z.object({
  endId: ObjectIdSchema.nullable(),
  lastId: ObjectIdSchema.nullable(),
  scanned: IntSchema,
  migratedCount: IntSchema,
  skippedCount: IntSchema
});

/**
 * 分批游标扫描 + 固定并发容器搬迁编排入口。
 */
export const migrateSandboxToJuicefs = async (context: SystemMigrationContext) => {
  const v2Collection = getLegacySandboxV2Collection();
  const existingFailures = await context.getFailedRecords();
  let checkpoint = await context.getCheckpoint(CheckpointSchema);

  await context.reportProgress({ key: 'preflight', status: SystemMigrationStatusEnum.running });
  await context.assertActive();

  // 1. 空表/仅残余 deleting 或已软删除业务源孤儿记录快路径：无需配置沙箱环境变量即可直接标记完成。
  const last = !checkpoint
    ? await v2Collection.findOne({}, { projection: { _id: 1 }, sort: { _id: -1 } })
    : undefined;
  const hasLiveCandidate =
    !checkpoint && last ? await hasLiveLegacyV2MigrationCandidate(systemMigrationBatchSize) : false;
  if (!checkpoint && !hasLiveCandidate && existingFailures.length === 0) {
    const skippedCount = last ? await v2Collection.countDocuments({}) : 0;
    const emptyCheckpoint = {
      endId: null,
      lastId: null,
      scanned: skippedCount,
      migratedCount: 0,
      skippedCount
    };
    await context.saveCheckpoint(emptyCheckpoint);
    await context.reportProgress({
      key: 'preflight',
      status: SystemMigrationStatusEnum.succeeded
    });
    await context.reportProgress({
      key: 'instances',
      status: SystemMigrationStatusEnum.succeeded,
      current: skippedCount,
      total: skippedCount
    });
    await context.reportProgress({
      key: 'validation',
      status: SystemMigrationStatusEnum.succeeded
    });
    return { migratedCount: 0, skippedCount };
  }

  try {
    await runSandboxMigrationPreflight({ signal: context.signal });
  } catch (error) {
    context.signal.throwIfAborted();
    await context.fail({
      message: sanitizeMigrationErrorMessage(error)
    });
  }
  await context.reportProgress({ key: 'preflight', status: SystemMigrationStatusEnum.succeeded });

  if (!checkpoint) {
    checkpoint = {
      endId: last ? String(last._id) : null,
      lastId: null,
      scanned: 0,
      migratedCount: 0,
      skippedCount: 0
    };
    await context.saveCheckpoint(checkpoint);
  }

  const { concurrency } = getSandboxMigrationEnv();
  const failures = new Map<string, SystemMigrationFailedRecord>();
  for (const failure of existingFailures) {
    failures.set(String(failure.data.id), failure);
  }

  const runBatchItems = async (ids: string[]) => {
    let batchMigrated = 0;
    let batchSkipped = 0;

    await batchRun(
      ids,
      async (id) => {
        context.signal.throwIfAborted();
        try {
          const result = await migrateSingleLegacySandboxRecord({
            id,
            signal: context.signal
          });
          failures.delete(id);
          if (result.outcome === 'migrated') {
            batchMigrated += 1;
          } else {
            batchSkipped += 1;
          }
        } catch (error) {
          context.signal.throwIfAborted();
          const reasonMessage = sanitizeMigrationErrorMessage(error);
          context.logger.warn('Failed to migrate legacy v2 sandbox record', {
            id,
            reason: reasonMessage
          });
          failures.set(id, {
            stageKey: 'instances',
            data: { id },
            reason: { message: reasonMessage }
          });
        }
      },
      concurrency
    );

    return { batchMigrated, batchSkipped };
  };

  // 2. 优先重试上次失败留下的记录，并按约定先持久化错误快照再推进 checkpoint。
  await context.reportProgress({
    key: 'instances',
    status: SystemMigrationStatusEnum.running,
    current: checkpoint.scanned
  });

  if (failures.size > 0) {
    await context.assertActive();
    const retryIds = [...failures.keys()];
    const { batchMigrated, batchSkipped } = await runBatchItems(retryIds);
    await context.reportFailedRecords([...failures.values()]);
    checkpoint = {
      ...checkpoint,
      migratedCount: checkpoint.migratedCount + batchMigrated,
      skippedCount: checkpoint.skippedCount + batchSkipped
    };
    await context.saveCheckpoint(checkpoint);
  }

  // 3. 按 _id 升序游标分批读取并固定并发搬迁。
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
    const { batchMigrated, batchSkipped } = await runBatchItems(batchIds);

    await context.reportFailedRecords([...failures.values()]);
    checkpoint = {
      ...checkpoint,
      lastId: batchIds.at(-1) ?? checkpoint.lastId,
      scanned: checkpoint.scanned + records.length,
      migratedCount: checkpoint.migratedCount + batchMigrated,
      skippedCount: checkpoint.skippedCount + batchSkipped
    };
    await context.saveCheckpoint(checkpoint);
    await context.reportProgress({
      key: 'instances',
      status: SystemMigrationStatusEnum.running,
      current: checkpoint.scanned
    });

    if (failures.size >= systemMigrationBatchSize * 10) {
      await context.fail({
        message: 'Too many legacy sandbox instances failed migration; inspect failed records',
        failedRecords: [...failures.values()]
      });
    }
  }

  if (failures.size > 0) {
    await context.fail({
      message: 'Some legacy sandbox instances require repair before retrying',
      failedRecords: [...failures.values()]
    });
  }

  await context.reportProgress({
    key: 'instances',
    status: SystemMigrationStatusEnum.succeeded,
    current: checkpoint.scanned
  });

  // 4. 完成校验：核验全部存活业务源的非 deleting 旧记录均已在 v3 落库。
  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.running });
  await context.assertActive();

  let validationCursor: Types.ObjectId | undefined;
  const unmigratedFailures: SystemMigrationFailedRecord[] = [];

  while (unmigratedFailures.length < systemMigrationBatchSize) {
    context.signal.throwIfAborted();
    const batch = await v2Collection
      .find({
        status: { $ne: 'deleting' },
        ...(validationCursor ? { _id: { $gt: validationCursor } } : {})
      })
      .sort({ _id: 1 })
      .limit(systemMigrationBatchSize)
      .toArray();
    if (batch.length === 0) break;
    validationCursor = batch.at(-1)?._id as Types.ObjectId | undefined;

    for (const raw of batch) {
      const id = String(raw._id);
      const parsed = LegacySandboxV2DocSchema.safeParse(raw);
      if (!parsed.success) {
        unmigratedFailures.push({
          stageKey: 'validation',
          data: { id },
          reason: { message: 'Malformed legacy v2 sandbox document' }
        });
        continue;
      }

      const doc = parsed.data;
      const activeTeamId = await resolveActiveSandboxSourceTeamId({
        sourceType: doc.sourceType,
        sourceId: doc.sourceId
      });
      if (!activeTeamId) continue;

      const existsInV3 = await MongoSandboxInstance.exists(buildMatchingV3SandboxFilter(doc));
      if (!existsInV3) {
        unmigratedFailures.push({
          stageKey: 'validation',
          data: { id },
          reason: { message: `Active sandbox ${doc.sandboxId} is missing in v3 collection` }
        });
      }
    }
  }

  if (unmigratedFailures.length > 0) {
    await context.fail({
      message: 'Sandbox v3 migration validation detected unmigrated active records',
      failedRecords: unmigratedFailures
    });
  }

  await context.reportProgress({ key: 'validation', status: SystemMigrationStatusEnum.succeeded });
  return {
    migratedCount: checkpoint.migratedCount,
    skippedCount: checkpoint.skippedCount
  };
};
