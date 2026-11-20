import { z } from 'zod';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { IntSchema } from '@fastgpt/global/common/zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  isLegacyOpenSandboxVolumeLayout,
  isSandboxRecordMigrated,
  LEGACY_ARCHIVE_MIGRATION_FILTER,
  LEGACY_DEVBOX_PROVIDER,
  needsLegacyZipTranscode,
  UNMIGRATED_SANDBOX_FILTER
} from '@fastgpt/service/core/ai/sandbox/legacy';
import { SANDBOX_PROVIDER } from '@fastgpt/service/core/ai/sandbox/type';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import { migrateSealosDevboxInstance } from '../sandbox_opensandbox_shared/devboxMigrator';
import { migrateLegacyOpenSandboxVolume } from '../sandbox_opensandbox_shared/openSandboxVolumeMigrator';
import {
  createSealosMigrationClient,
  getSealosWorkDirectory,
  hasSealosMigrationEnv,
  type SealosMigrationClient
} from '../sandbox_opensandbox_shared/sealosClient';
import {
  completeNoopSandboxMigration,
  isSandboxSourceActive,
  loadFailuresClearingPreflight,
  retryFailedSandboxDocs,
  runSandboxDocCursorStage,
  sanitizeMigrationFailureMessage
} from '../sandbox_opensandbox_shared/utils';
import {
  transcodeLegacyZipArchive,
  type SandboxMigrationDoc
} from '../sandbox_opensandbox_shared/zipTranscoder';

const SANDBOX_MIGRATION_CONCURRENCY = 5;
const MAX_FAILURE_RECORDS = 500;

type SandboxStageKey = 'runningDevbox' | 'stoppedDevbox' | 'legacyArchives';

const StageCheckpointSchema = z.object({
  lastId: ObjectIdSchema.nullable(),
  migrated: IntSchema,
  done: z.boolean()
});

const CheckpointSchema = z.object({
  runningDevbox: StageCheckpointSchema,
  stoppedDevbox: StageCheckpointSchema,
  legacyArchives: StageCheckpointSchema
});

type CheckpointState = z.infer<typeof CheckpointSchema>;

const createInitialCheckpoint = (): CheckpointState => ({
  runningDevbox: { lastId: null, migrated: 0, done: false },
  stoppedDevbox: { lastId: null, migrated: 0, done: false },
  legacyArchives: { lastId: null, migrated: 0, done: false }
});

const resolveDocStageKey = (doc: SandboxMigrationDoc): SandboxStageKey => {
  if (doc.provider === SANDBOX_PROVIDER || doc.status === SandboxInstanceStatusEnum.archived) {
    return 'legacyArchives';
  }
  if (doc.status === SandboxInstanceStatusEnum.running) return 'runningDevbox';
  return 'stoppedDevbox';
};

/**
 * 4.18.0 Agent Sandbox 平滑迁移任务（manual: true，由管理员确认升级前提后手动触发执行）。
 *
 * 按活跃优先级分三阶段迁移：
 * 1. `runningDevbox`：对运行中 `sealosdevbox` 执行 5 步静止化断连、打包并直传 S3 `.tar.zst`；
 * 2. `stoppedDevbox`：将已暂停或过渡态 `sealosdevbox` 直转为 OpenSandbox `archived`（`.tar.zst`）；
 * 3. `legacyArchives`：在宿主侧流式将 S3 历史沙盒 `package.zip` 转码为 `workspace/` 前缀 `.tar.zst`，并将 4.18.0 前仍挂载 `/workspace` 的存量 OpenSandbox 持久卷冷归档至同一格式。
 *
 * 全流程保证与在线请求互斥（sandbox 复用生命周期租约），保留原资源供回滚，
 * 并严格保证 `reportFailedRecords` 先于 `saveCheckpoint` 提交。
 */
export const migrateSandboxToOpenSandbox = async (context: SystemMigrationContext) => {
  const collection = MongoSandboxInstance.collection;

  await context.reportProgress({
    key: 'preflight',
    status: SystemMigrationStatusEnum.running
  });
  context.signal.throwIfAborted();
  await context.assertActive();

  let needSealosCount = 0;
  let needLegacyArchiveCount = 0;
  const preflightCursor = collection
    .find<SandboxMigrationDoc>(UNMIGRATED_SANDBOX_FILTER, {
      projection: {
        _id: 1,
        sandboxId: 1,
        sourceType: 1,
        sourceId: 1,
        provider: 1,
        status: 1,
        storage: 1,
        operation: 1
      }
    })
    .batchSize(systemMigrationBatchSize);

  try {
    for await (const doc of preflightCursor) {
      context.signal.throwIfAborted();
      if (isSandboxRecordMigrated(doc)) continue;
      if (!(await isSandboxSourceActive(doc))) continue;
      if (
        doc.provider === LEGACY_DEVBOX_PROVIDER &&
        doc.status !== SandboxInstanceStatusEnum.archived
      ) {
        needSealosCount += 1;
      } else {
        needLegacyArchiveCount += 1;
      }
    }
  } finally {
    await preflightCursor.close().catch(() => undefined);
  }

  if (needSealosCount > 0 && !hasSealosMigrationEnv()) {
    await context.fail({
      message:
        'Missing AGENT_SANDBOX_SEALOS_BASEURL or AGENT_SANDBOX_SEALOS_TOKEN for active Sealos Devbox migration'
    });
  }

  const failures = await loadFailuresClearingPreflight(context);
  const existingCheckpoint = await context.getCheckpoint(CheckpointSchema);

  // 未使用过历史沙盒（或仅有已软删除源的孤儿记录）时直接跳过，不强校验 Sealos / S3 环境变量。
  if (needSealosCount === 0 && needLegacyArchiveCount === 0 && failures.size === 0) {
    const runningDevbox = existingCheckpoint?.runningDevbox.migrated ?? 0;
    const stoppedDevbox = existingCheckpoint?.stoppedDevbox.migrated ?? 0;
    const legacyArchives = existingCheckpoint?.legacyArchives.migrated ?? 0;

    return await completeNoopSandboxMigration({
      context,
      stages: [
        { key: 'runningDevbox', current: runningDevbox },
        { key: 'stoppedDevbox', current: stoppedDevbox },
        { key: 'legacyArchives', current: legacyArchives }
      ],
      result: { runningDevbox, stoppedDevbox, legacyArchives }
    });
  }

  let sealosClientCache: SealosMigrationClient | undefined;
  const getSealosClient = () => {
    if (!sealosClientCache) {
      sealosClientCache = createSealosMigrationClient();
    }
    return sealosClientCache;
  };
  const workDirectory = getSealosWorkDirectory();

  await context.reportProgress({
    key: 'preflight',
    status: SystemMigrationStatusEnum.succeeded
  });

  const checkpoint = existingCheckpoint ?? createInitialCheckpoint();
  await context.saveCheckpoint(checkpoint);

  const migrateOneDoc = async (doc: SandboxMigrationDoc, stageKey: SandboxStageKey) => {
    context.signal.throwIfAborted();
    await context.assertActive();
    const recordId = String(doc._id);
    try {
      if (isSandboxRecordMigrated(doc) || !(await isSandboxSourceActive(doc))) {
        failures.delete(recordId);
        return;
      }

      const outcome =
        stageKey === 'legacyArchives'
          ? !needsLegacyZipTranscode(doc) && isLegacyOpenSandboxVolumeLayout(doc)
            ? await migrateLegacyOpenSandboxVolume({
                sandboxId: doc.sandboxId,
                signal: context.signal
              })
            : await transcodeLegacyZipArchive({
                sandboxId: doc.sandboxId,
                signal: context.signal
              })
          : await migrateSealosDevboxInstance({
              sandboxId: doc.sandboxId,
              sealosClient: getSealosClient,
              workDirectory,
              signal: context.signal
            });

      failures.delete(recordId);
      if (outcome === 'migrated') {
        checkpoint[stageKey].migrated += 1;
      }
    } catch (error) {
      context.signal.throwIfAborted();
      failures.set(recordId, {
        stageKey,
        data: {
          id: recordId,
          sandboxId: doc.sandboxId
        },
        reason: {
          message: sanitizeMigrationFailureMessage(error, 'Sandbox migration failed')
        }
      });
    }
  };

  const runStage = async ({
    stageKey,
    filter
  }: {
    stageKey: SandboxStageKey;
    filter: Record<string, unknown>;
  }) =>
    await runSandboxDocCursorStage({
      collection,
      context,
      failures,
      stageKey,
      filter,
      concurrency: SANDBOX_MIGRATION_CONCURRENCY,
      maxFailures: MAX_FAILURE_RECORDS,
      failMessage: 'Too many sandbox migration failures; resolve errors before retrying',
      isDone: () => checkpoint[stageKey].done,
      getLastId: () => checkpoint[stageKey].lastId,
      onBatchCommitted: (lastId) => {
        checkpoint[stageKey] = {
          ...checkpoint[stageKey],
          lastId,
          done: false
        };
      },
      onStageMarkedDone: () => {
        checkpoint[stageKey] = {
          ...checkpoint[stageKey],
          done: true
        };
      },
      getProgressCurrent: () => checkpoint[stageKey].migrated,
      processDoc: (doc) => migrateOneDoc(doc, stageKey),
      saveCheckpoint: () => context.saveCheckpoint(checkpoint)
    });

  await runStage({
    stageKey: 'runningDevbox',
    filter: {
      provider: LEGACY_DEVBOX_PROVIDER,
      status: SandboxInstanceStatusEnum.running
    }
  });

  await runStage({
    stageKey: 'stoppedDevbox',
    filter: {
      provider: LEGACY_DEVBOX_PROVIDER,
      status: { $nin: [SandboxInstanceStatusEnum.running, SandboxInstanceStatusEnum.archived] }
    }
  });

  await runStage({
    stageKey: 'legacyArchives',
    filter: LEGACY_ARCHIVE_MIGRATION_FILTER
  });

  await retryFailedSandboxDocs({
    collection,
    context,
    failures,
    stageKeys: ['validation'],
    concurrency: SANDBOX_MIGRATION_CONCURRENCY,
    processDoc: (doc) => migrateOneDoc(doc, resolveDocStageKey(doc)),
    saveCheckpoint: () => context.saveCheckpoint(checkpoint)
  });

  if (failures.size > 0) {
    await context.fail({
      message: 'Some sandbox instances failed to migrate; inspect failed records and retry',
      failedRecords: [...failures.values()]
    });
  }

  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.running
  });
  await context.assertActive();

  const remainingFailures: SystemMigrationFailedRecord[] = [];
  const validationCursor = collection
    .find<SandboxMigrationDoc>(UNMIGRATED_SANDBOX_FILTER)
    .sort({ _id: 1 })
    .batchSize(systemMigrationBatchSize);
  try {
    for await (const doc of validationCursor) {
      context.signal.throwIfAborted();
      if (isSandboxRecordMigrated(doc)) continue;
      if (!(await isSandboxSourceActive(doc))) continue;
      remainingFailures.push({
        stageKey: 'validation',
        data: {
          id: String(doc._id),
          sandboxId: doc.sandboxId
        },
        reason: {
          message: 'Active sandbox record remains unmigrated after migration stages completed'
        }
      });
      if (remainingFailures.length >= systemMigrationBatchSize) break;
    }
  } finally {
    await validationCursor.close().catch(() => undefined);
  }

  if (remainingFailures.length > 0) {
    await context.fail({
      message: 'Sandbox migration validation failed with remaining unmigrated records',
      failedRecords: remainingFailures
    });
  }

  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.succeeded
  });

  return {
    runningDevbox: checkpoint.runningDevbox.migrated,
    stoppedDevbox: checkpoint.stoppedDevbox.migrated,
    legacyArchives: checkpoint.legacyArchives.migrated
  };
};
