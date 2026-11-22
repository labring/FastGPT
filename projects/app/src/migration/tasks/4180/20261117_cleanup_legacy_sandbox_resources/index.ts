import { z } from 'zod';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { IntSchema } from '@fastgpt/global/common/zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { getS3SandboxSource } from '@fastgpt/service/common/s3/sources/sandbox';
import { withSandboxLease } from '@fastgpt/service/core/ai/sandbox/application/lease';
import { deleteSandboxResourceWithinLease } from '@fastgpt/service/core/ai/sandbox/application/resource';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import type { SandboxResourceDoc } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  buildLegacySandboxProviderFilter,
  isSandboxRecordMigrated,
  LEGACY_DEVBOX_PROVIDER
} from '@fastgpt/service/core/ai/sandbox/legacy';
import { SANDBOX_PROVIDER } from '@fastgpt/service/core/ai/sandbox/type';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  createSealosMigrationClient,
  hasSealosMigrationEnv
} from '../sandbox_opensandbox_shared/sealosClient';
import {
  completeNoopSandboxMigration,
  isSandboxSourceActive,
  loadNonPreflightFailures,
  runSandboxDocCursorStage,
  SANDBOX_MIGRATION_PROJECTION,
  sanitizeMigrationFailureMessage,
  UNMIGRATED_SANDBOX_FILTER,
  type SandboxCursorStageState,
  type SandboxMigrationDoc
} from '../sandbox_opensandbox_shared/utils';

const CLEANUP_CONCURRENCY = 5;
const MAX_FAILURE_RECORDS = 500;
const LEGACY_ZIP_KEY_REGEX = /^sandbox\/archive\/([^/]+)\/package\.zip$/;

const CheckpointSchema = z.object({
  lastDocId: ObjectIdSchema.nullable(),
  devboxesDone: z.boolean(),
  lastZipKey: z.string().nullable(),
  zipsDone: z.boolean(),
  deletedDevboxes: IntSchema,
  deletedZips: IntSchema,
  deletedOrphans: IntSchema
});

type CheckpointState = z.infer<typeof CheckpointSchema>;

const createInitialCheckpoint = (): CheckpointState => ({
  lastDocId: null,
  devboxesDone: false,
  lastZipKey: null,
  zipsDone: false,
  deletedDevboxes: 0,
  deletedZips: 0,
  deletedOrphans: 0
});

/**
 * 4.18.0 历史沙盒 S3 遗留资源核验清理任务（`manual: true`，强依赖 `20261117_migrate_sandbox_to_opensandbox`）。
 *
 * - 前置强校验：发现任何活跃源未迁移沙盒记录时立即 `context.fail`，零删除放行前绝不触碰远端资源；
 * - 对全部已迁移沙盒记录（含用户已唤醒进入 `running`/`stopped` 的记录）幂等回收对应远端 Sealos Devbox；
 * - 逐一核验目标 `.tar.zst` 真实存在后才删除 S3 旧沙盒 `package.zip`；
 * - 同时回收所属应用/Skill 已软删除的孤儿 DB 记录及其残余远端 Devbox 与 S3 归档。
 */
export const cleanupLegacySandboxResources = async (context: SystemMigrationContext) => {
  const collection = MongoSandboxInstance.collection;
  const s3Source = getS3SandboxSource();
  const activeSourceCache = new Map<string, boolean>();
  const listLegacyZipKeys = async () =>
    (await s3Source.client.listObjects({ prefix: 'sandbox/archive/' })).keys
      .filter((key) => LEGACY_ZIP_KEY_REGEX.test(key))
      .sort();

  await context.reportProgress({
    key: 'preflight',
    status: SystemMigrationStatusEnum.running
  });
  context.signal.throwIfAborted();
  await context.assertActive();

  // 先加载历史失败记录：保留 cleanupDevboxes / cleanupLegacyZips / validation 失败快照，仅在 preflight 阻断消除后清理旧 preflight 记录。
  const { failures, hadPreflight: hadPreflightFailures } = await loadNonPreflightFailures(context);

  const unmigratedActiveFailures: SystemMigrationFailedRecord[] = [];
  let hasSealosOrphan = false;
  const guardCursor = collection
    .find<SandboxMigrationDoc>(UNMIGRATED_SANDBOX_FILTER, {
      projection: SANDBOX_MIGRATION_PROJECTION
    })
    .batchSize(systemMigrationBatchSize);

  try {
    for await (const doc of guardCursor) {
      context.signal.throwIfAborted();
      if (isSandboxRecordMigrated(doc)) continue;
      if (await isSandboxSourceActive(doc, activeSourceCache)) {
        if (unmigratedActiveFailures.length < systemMigrationBatchSize) {
          unmigratedActiveFailures.push({
            stageKey: 'preflight',
            data: { id: String(doc._id), sandboxId: doc.sandboxId },
            reason: { message: 'Sandbox record is not migrated to opensandbox tar.zst yet' }
          });
        }
      } else if (doc.provider === LEGACY_DEVBOX_PROVIDER) {
        hasSealosOrphan = true;
      }
    }
  } finally {
    await guardCursor.close().catch(() => undefined);
  }

  if (unmigratedActiveFailures.length > 0) {
    await context.fail({
      message: 'Active unmigrated sandbox records found; complete migration before cleanup',
      failedRecords: [...failures.values(), ...unmigratedActiveFailures]
    });
  }

  const hasPendingDevboxCleanup =
    hasSealosOrphan ||
    (await collection.countDocuments(
      { 'storage.legacyDevboxPendingCleanup': true },
      { limit: 1 }
    )) > 0;

  if (hasPendingDevboxCleanup && !hasSealosMigrationEnv()) {
    await context.fail({
      message:
        'Missing AGENT_SANDBOX_SEALOS_BASEURL or AGENT_SANDBOX_SEALOS_TOKEN to cleanup legacy Sealos Devbox resources',
      ...(failures.size > 0 ? { failedRecords: [...failures.values()] } : {})
    });
  }

  if (hadPreflightFailures) {
    await context.reportFailedRecords([...failures.values()]);
  }

  const totalDocs = await collection.countDocuments({});
  const preflightZipKeys =
    totalDocs === 0 && !hasSealosMigrationEnv() ? await listLegacyZipKeys() : undefined;
  const existingCheckpoint = await context.getCheckpoint(CheckpointSchema);

  if (
    totalDocs === 0 &&
    !hasSealosMigrationEnv() &&
    (preflightZipKeys?.length ?? 0) === 0 &&
    failures.size === 0
  ) {
    const deletedDevboxes = existingCheckpoint?.deletedDevboxes ?? 0;
    const deletedZips = existingCheckpoint?.deletedZips ?? 0;
    const deletedOrphans = existingCheckpoint?.deletedOrphans ?? 0;

    return await completeNoopSandboxMigration({
      context,
      stages: [
        { key: 'cleanupDevboxes', current: deletedDevboxes + deletedOrphans },
        { key: 'cleanupLegacyZips', current: deletedZips }
      ],
      result: { deletedDevboxes, deletedZips, deletedOrphans }
    });
  }

  const sealosClient = hasSealosMigrationEnv() ? createSealosMigrationClient() : undefined;

  await context.reportProgress({
    key: 'preflight',
    status: SystemMigrationStatusEnum.succeeded
  });

  const checkpoint = existingCheckpoint ?? createInitialCheckpoint();
  const docStage: SandboxCursorStageState = {
    lastId: checkpoint.lastDocId,
    done: checkpoint.devboxesDone
  };
  const saveCleanupCheckpoint = () => {
    checkpoint.lastDocId = docStage.lastId;
    checkpoint.devboxesDone = docStage.done;
    return context.saveCheckpoint(checkpoint);
  };

  const cleanupDevboxOrOrphanRow = async (doc: SandboxMigrationDoc) => {
    context.signal.throwIfAborted();
    await context.assertActive();
    const recordId = String(doc._id);

    try {
      if (
        doc.provider === SANDBOX_PROVIDER &&
        isSandboxRecordMigrated(doc) &&
        !doc.storage?.legacyDevboxPendingCleanup &&
        (await isSandboxSourceActive(doc, activeSourceCache))
      ) {
        failures.delete(recordId);
        return;
      }

      await withSandboxLease({
        sandboxId: doc.sandboxId,
        label: `cleanup-legacy:${doc.sandboxId}`,
        signal: context.signal,
        fn: async (lease) => {
          const effectiveSignal = AbortSignal.any([context.signal, lease.signal]);
          effectiveSignal.throwIfAborted();
          const latest = await collection.findOne<SandboxMigrationDoc>({ _id: doc._id });
          if (!latest) {
            failures.delete(recordId);
            return;
          }

          const active = await isSandboxSourceActive(latest, activeSourceCache);
          const hasLegacyDevboxTarget =
            latest.provider === LEGACY_DEVBOX_PROVIDER ||
            Boolean(latest.storage?.legacyDevboxPendingCleanup);

          if (!active) {
            if (sealosClient && hasLegacyDevboxTarget) {
              if (await sealosClient.deleteDevbox(latest.sandboxId, effectiveSignal)) {
                checkpoint.deletedDevboxes += 1;
              }
            }
            lease.assertValid();
            if (latest.provider === SANDBOX_PROVIDER) {
              await deleteSandboxResourceWithinLease({
                current: latest as unknown as SandboxResourceDoc,
                lease,
                allowDeleteLegacyDevboxPointer: Boolean(sealosClient)
              });
              // 仅当删除真实移除 Mongo 文档（未写入墓碑）时才计入已删孤儿数。
              if ((await collection.countDocuments({ _id: latest._id }, { limit: 1 })) === 0) {
                checkpoint.deletedOrphans += 1;
              }
            } else {
              await s3Source.deleteSandboxArchives({
                sandboxId: latest.sandboxId,
                currentObjectKey: latest.storage?.archive?.objectKey
              });
              lease.assertValid();
              const deleteRes = await collection.deleteOne({ _id: latest._id });
              if (deleteRes.deletedCount > 0) {
                checkpoint.deletedOrphans += 1;
              }
            }
            failures.delete(recordId);
            return;
          }

          if (!isSandboxRecordMigrated(latest)) {
            throw new Error('Active sandbox record regressed to unmigrated state during cleanup');
          }

          // 即使记录已唤醒为 opensandbox running/stopped，仍按同名 sandboxId 幂等回收历史暂停态 Devbox。
          if (sealosClient && latest.storage?.legacyDevboxPendingCleanup) {
            if (await sealosClient.deleteDevbox(latest.sandboxId, effectiveSignal)) {
              checkpoint.deletedDevboxes += 1;
            }
            lease.assertValid();
            await collection.updateOne(
              { _id: latest._id },
              { $unset: { 'storage.legacyDevboxPendingCleanup': '' } }
            );
          }
          failures.delete(recordId);
        }
      });
    } catch (error) {
      context.signal.throwIfAborted();
      failures.set(recordId, {
        stageKey: 'cleanupDevboxes',
        data: { id: recordId, sandboxId: doc.sandboxId },
        reason: {
          message: sanitizeMigrationFailureMessage(error, 'Legacy sandbox resource cleanup failed')
        }
      });
    }
  };

  await runSandboxDocCursorStage({
    context,
    failures,
    stageKey: 'cleanupDevboxes',
    retryStageKeys: ['cleanupDevboxes', 'validation'],
    filter: {},
    stage: docStage,
    concurrency: CLEANUP_CONCURRENCY,
    maxFailures: MAX_FAILURE_RECORDS,
    failMessage: 'Too many legacy Devbox cleanup failures; inspect failed records before retrying',
    getProgressCurrent: () => checkpoint.deletedDevboxes + checkpoint.deletedOrphans,
    processDoc: cleanupDevboxOrOrphanRow,
    saveCheckpoint: saveCleanupCheckpoint
  });

  // ---- Stage: cleanupLegacyZips ----
  const validateTargetTarZstArchive = async (
    targetRow: SandboxMigrationDoc
  ): Promise<{ missingObjectKey?: string }> => {
    if (!isSandboxRecordMigrated(targetRow)) {
      throw new Error('Active sandbox record is not migrated to opensandbox tar.zst yet');
    }
    const archive = targetRow.storage?.archive;
    if (
      Boolean(archive) ||
      targetRow.status === SandboxInstanceStatusEnum.archived ||
      targetRow.status === SandboxInstanceStatusEnum.restoring
    ) {
      if (!archive || archive.format !== 'tar.zst') {
        throw new Error('Sandbox record lacks validated tar.zst archive metadata');
      }
      if (archive.sizeBytes > 0 && !(await s3Source.isObjectExists(archive.objectKey))) {
        return { missingObjectKey: archive.objectKey };
      }
    }
    return {};
  };

  const cleanupLegacyZipKey = async (key: string) => {
    context.signal.throwIfAborted();
    await context.assertActive();
    const match = LEGACY_ZIP_KEY_REGEX.exec(key);
    if (!match) return;
    const sandboxId = match[1];

    try {
      const row = await collection.findOne<SandboxMigrationDoc>({
        provider: buildLegacySandboxProviderFilter(),
        sandboxId
      });

      if (row && (await isSandboxSourceActive(row, activeSourceCache))) {
        const { missingObjectKey } = await validateTargetTarZstArchive(row);
        if (missingObjectKey) {
          await withSandboxLease({
            sandboxId: row.sandboxId,
            label: `verify-legacy-zip:${row.sandboxId}`,
            signal: context.signal,
            fn: async (lease) => {
              AbortSignal.any([context.signal, lease.signal]).throwIfAborted();
              const latestRow = await collection.findOne<SandboxMigrationDoc>({ _id: row._id });
              if (latestRow && (await isSandboxSourceActive(latestRow, activeSourceCache))) {
                const recheck = await validateTargetTarZstArchive(latestRow);
                if (recheck.missingObjectKey) {
                  throw new Error(
                    'Target tar.zst archive object is missing in S3; preserving package.zip'
                  );
                }
              }
              lease.assertValid();
            }
          });
        }
      }

      await s3Source.deleteArchiveObject({ key });
      checkpoint.deletedZips += 1;
      failures.delete(key);
    } catch (error) {
      context.signal.throwIfAborted();
      failures.set(key, {
        stageKey: 'cleanupLegacyZips',
        data: { key, sandboxId },
        reason: {
          message: sanitizeMigrationFailureMessage(error, 'Legacy sandbox resource cleanup failed')
        }
      });
    }
  };

  await context.reportProgress({
    key: 'cleanupLegacyZips',
    status: SystemMigrationStatusEnum.running,
    current: checkpoint.deletedZips
  });

  const allRemainingZipKeys =
    totalDocs === 0 && preflightZipKeys ? preflightZipKeys : await listLegacyZipKeys();
  const existingZipSet = new Set(allRemainingZipKeys);
  const seenRetryKeys = new Set<string>();
  const activeZipRetries: string[] = [];
  let clearedMissingZips = false;

  for (const item of failures.values()) {
    if (
      (item.stageKey !== 'cleanupLegacyZips' && item.stageKey !== 'validation') ||
      typeof item.data.key !== 'string'
    ) {
      continue;
    }
    const key = String(item.data.key);
    if (seenRetryKeys.has(key)) continue;
    seenRetryKeys.add(key);
    if (existingZipSet.has(key)) {
      activeZipRetries.push(key);
    } else {
      failures.delete(key);
      clearedMissingZips = true;
    }
  }

  const activeZipRetrySet = new Set(activeZipRetries);
  if (activeZipRetries.length > 0) {
    await batchRun(activeZipRetries, cleanupLegacyZipKey, CLEANUP_CONCURRENCY);
    await context.reportFailedRecords([...failures.values()]);
    await saveCleanupCheckpoint();
  } else if (clearedMissingZips) {
    await context.reportFailedRecords([...failures.values()]);
  }

  if (!checkpoint.zipsDone) {
    const keysToProcess = allRemainingZipKeys.filter(
      (key) =>
        (!checkpoint.lastZipKey || key > checkpoint.lastZipKey) && !activeZipRetrySet.has(key)
    );

    for (let i = 0; i < keysToProcess.length; i += systemMigrationBatchSize) {
      context.signal.throwIfAborted();
      await context.assertActive();

      const batch = keysToProcess.slice(i, i + systemMigrationBatchSize);
      await batchRun(batch, cleanupLegacyZipKey, CLEANUP_CONCURRENCY);

      if (failures.size >= MAX_FAILURE_RECORDS) {
        await context.fail({
          message: 'Too many legacy package.zip cleanup failures; inspect failed records',
          failedRecords: [...failures.values()]
        });
      }

      await context.reportFailedRecords([...failures.values()]);
      checkpoint.lastZipKey = batch[batch.length - 1];
      await saveCleanupCheckpoint();
      await context.reportProgress({
        key: 'cleanupLegacyZips',
        status: SystemMigrationStatusEnum.running,
        current: checkpoint.deletedZips
      });
    }

    checkpoint.zipsDone = true;
    await context.reportFailedRecords([...failures.values()]);
    await saveCleanupCheckpoint();
  }

  const zipFailureCount = [...failures.values()].filter(
    (item) =>
      item.stageKey === 'cleanupLegacyZips' ||
      (item.stageKey === 'validation' && typeof item.data.key === 'string')
  ).length;
  if (zipFailureCount === 0) {
    await context.reportProgress({
      key: 'cleanupLegacyZips',
      status: SystemMigrationStatusEnum.succeeded,
      current: checkpoint.deletedZips
    });
  }

  if (failures.size > 0) {
    await context.fail({
      message: 'Some legacy sandbox resources failed safety verification or cleanup',
      failedRecords: [...failures.values()]
    });
  }

  // ---- Stage: validation ----
  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.running
  });
  await context.assertActive();

  const residualZips = await listLegacyZipKeys();
  if (residualZips.length > 0) {
    // 若校验阶段发现残留旧 ZIP，重置游标以确保下次重跑从头扫清。
    checkpoint.lastZipKey = null;
    checkpoint.zipsDone = false;
    await saveCleanupCheckpoint();
    await context.fail({
      message: 'Legacy package.zip objects remain in S3 after cleanup',
      failedRecords: residualZips.slice(0, systemMigrationBatchSize).map((key) => ({
        stageKey: 'validation',
        data: { key },
        reason: { message: 'Legacy package.zip object still present after cleanup' }
      }))
    });
  }

  const residualDocFailures: SystemMigrationFailedRecord[] = [];
  const validationCursor = collection
    .find<SandboxMigrationDoc>(
      { $or: [UNMIGRATED_SANDBOX_FILTER, { 'storage.legacyDevboxPendingCleanup': true }] },
      { projection: SANDBOX_MIGRATION_PROJECTION }
    )
    .sort({ _id: 1 })
    .batchSize(systemMigrationBatchSize);
  try {
    for await (const doc of validationCursor) {
      context.signal.throwIfAborted();
      if (doc.storage?.legacyDevboxPendingCleanup) {
        residualDocFailures.push({
          stageKey: 'validation',
          data: { id: String(doc._id), sandboxId: doc.sandboxId },
          reason: { message: 'Legacy Sealos Devbox cleanup flag still pending after cleanup' }
        });
      } else if (
        !isSandboxRecordMigrated(doc) &&
        (await isSandboxSourceActive(doc, activeSourceCache))
      ) {
        residualDocFailures.push({
          stageKey: 'validation',
          data: { id: String(doc._id), sandboxId: doc.sandboxId },
          reason: { message: 'Active sandbox record remains unmigrated after cleanup' }
        });
      }
      if (residualDocFailures.length >= systemMigrationBatchSize) break;
    }
  } finally {
    await validationCursor.close().catch(() => undefined);
  }

  if (residualDocFailures.length > 0) {
    // 重置 cleanupDevboxes 游标，使重跑既能重放失败快照也能覆盖期间新增的残留记录。
    docStage.lastId = null;
    docStage.done = false;
    await saveCleanupCheckpoint();
    await context.fail({
      message: 'Legacy sandbox resource cleanup validation failed with remaining records',
      failedRecords: residualDocFailures
    });
  }

  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.succeeded
  });

  return {
    deletedDevboxes: checkpoint.deletedDevboxes,
    deletedZips: checkpoint.deletedZips,
    deletedOrphans: checkpoint.deletedOrphans
  };
};
