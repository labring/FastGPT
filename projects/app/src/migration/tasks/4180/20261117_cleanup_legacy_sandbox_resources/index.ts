import { z } from 'zod';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { IntSchema } from '@fastgpt/global/common/zod';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import {
  getS3SandboxSource,
  LEGACY_SANDBOX_ARCHIVE_PREFIX,
  SANDBOX_ARCHIVE_PREFIX
} from '@fastgpt/service/common/s3/sources/sandbox';
import { withSandboxLease } from '@fastgpt/service/core/ai/sandbox/application/lease';
import { deleteOpenSandboxContainer } from '@fastgpt/service/core/ai/sandbox/application/resource';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import {
  getLegacySandboxInstanceCollection,
  MongoSandboxInstance
} from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  deleteSessionVolume,
  getSessionVolumeClaimName
} from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';
import { LEGACY_DEVBOX_PROVIDER } from '@fastgpt/service/core/ai/sandbox/legacy';
import { SANDBOX_PROVIDER } from '@fastgpt/service/core/ai/sandbox/type';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import {
  createSealosMigrationClient,
  hasSealosMigrationEnv
} from '../sandbox_opensandbox_shared/sealosClient';
import {
  completeNoopSandboxMigration,
  createStageProgressReporter,
  hasMigratedV3Record,
  isSandboxSourceActive,
  loadNonPreflightFailures,
  runSandboxDocCursorStage,
  SANDBOX_MIGRATION_PROJECTION,
  sanitizeMigrationFailureMessage,
  type SandboxCursorStageState,
  type SandboxMigrationDoc
} from '../sandbox_opensandbox_shared/utils';

const CLEANUP_CONCURRENCY = 5;
const MAX_FAILURE_RECORDS = 500;
const LEGACY_ZIP_KEY_REGEX = new RegExp(`^${LEGACY_SANDBOX_ARCHIVE_PREFIX}/([^/]+)/package\\.zip$`);

const CheckpointSchema = z.object({
  lastDocId: ObjectIdSchema.nullable(),
  devboxesDone: z.boolean(),
  lastZipKey: z.string().nullable(),
  zipsDone: z.boolean(),
  deletedDevboxes: IntSchema,
  deletedVolumes: IntSchema,
  deletedZips: IntSchema,
  deletedOrphans: IntSchema,
  processedDocs: IntSchema,
  totalDocs: IntSchema.optional(),
  processedZips: IntSchema,
  totalZips: IntSchema.optional()
});

type CheckpointState = z.infer<typeof CheckpointSchema>;

const createInitialCheckpoint = (): CheckpointState => ({
  lastDocId: null,
  devboxesDone: false,
  lastZipKey: null,
  zipsDone: false,
  deletedDevboxes: 0,
  deletedVolumes: 0,
  deletedZips: 0,
  deletedOrphans: 0,
  processedDocs: 0,
  processedZips: 0
});

/**
 * 4.18.0 历史沙盒遗留资源核验与永久清理任务（`manual: true`，强依赖 `20261117_migrate_sandbox_to_opensandbox`）。
 *
 * - 前置安全门禁：扫描 `agent_sandbox_instances_v2`，发现任何非 `deleting` 且源活跃、却尚未在 `v3` 落库的记录立即阻断，零删除放行；
 * - 阶段 `cleanupDevboxes`：扫描 `agent_sandbox_instances_v2`，对每条 `v2` 记录在 `withSandboxLease` 锁内确认活跃实例已存在 `v3` 记录且对应 `sandbox/archive-v2/*.tar.zst` 归档真实存在（若 `v3` 含归档元数据或处于 `archived`/`restoring`），随后回收远端 Sealos Devbox 与仅属于 `v2` 的孤儿/已替代容器及旧持久卷（绝不触碰 `targetV3` 的活容器或仍在 `v3` 使用中的持久卷），最后删除 `v2` 文档（源已软删除的孤儿行与 `deleting` 行计入 `deletedOrphans`）；
 * - 阶段 `cleanupLegacyZips`：扫描 `sandbox/archive/<sandboxId>/package.zip`，确认无非 `deleting` 活跃 `v2` 行且 `v3` 归档（若含归档元数据或处于 `archived`/`restoring`）已在 `sandbox/archive-v2/` 真实存在后删除旧 `package.zip`；
 * - 阶段 `validation`：校验 S3 `sandbox/archive/<sandboxId>/package.zip` 与 `agent_sandbox_instances_v2` 均已彻底清零。
 */
export const cleanupLegacySandboxResources = async (context: SystemMigrationContext) => {
  const legacyCollection = getLegacySandboxInstanceCollection();
  const targetCollection = MongoSandboxInstance.collection;
  const s3Source = getS3SandboxSource();
  const activeSourceCache = new Map<string, boolean>();
  const listLegacyZipKeys = async () =>
    (await s3Source.client.listObjects({ prefix: `${LEGACY_SANDBOX_ARCHIVE_PREFIX}/` })).keys
      .filter((key) => LEGACY_ZIP_KEY_REGEX.test(key))
      .sort();

  await context.reportProgress({
    key: 'preflight',
    status: SystemMigrationStatusEnum.running
  });
  context.signal.throwIfAborted();
  await context.assertActive();

  // 先加载历史失败记录：保留业务阶段失败快照，仅在 preflight 阻断消除后清理旧 preflight 记录。
  const { failures, hadPreflight: hadPreflightFailures } = await loadNonPreflightFailures(context);

  const unmigratedActiveFailures: SystemMigrationFailedRecord[] = [];
  let hasLegacyDevbox = false;
  const guardCursor = legacyCollection
    .find<SandboxMigrationDoc>({}, { projection: SANDBOX_MIGRATION_PROJECTION })
    .batchSize(systemMigrationBatchSize);

  try {
    for await (const doc of guardCursor) {
      context.signal.throwIfAborted();
      if (doc.provider === LEGACY_DEVBOX_PROVIDER) {
        hasLegacyDevbox = true;
      }
      if (
        doc.status !== SandboxInstanceStatusEnum.deleting &&
        (await isSandboxSourceActive(doc, activeSourceCache)) &&
        !(await hasMigratedV3Record(doc))
      ) {
        if (unmigratedActiveFailures.length < systemMigrationBatchSize) {
          unmigratedActiveFailures.push({
            stageKey: 'preflight',
            data: { id: String(doc._id), sandboxId: doc.sandboxId },
            reason: { message: 'Sandbox record is not migrated to v3 opensandbox tar.zst yet' }
          });
        }
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

  if (hasLegacyDevbox && !hasSealosMigrationEnv()) {
    await context.fail({
      message:
        'Missing AGENT_SANDBOX_SEALOS_BASEURL or AGENT_SANDBOX_SEALOS_TOKEN to cleanup legacy Sealos Devbox resources',
      ...(failures.size > 0 ? { failedRecords: [...failures.values()] } : {})
    });
  }

  if (hadPreflightFailures) {
    await context.reportFailedRecords([...failures.values()]);
  }

  const legacyCount = await legacyCollection.countDocuments({});
  const preflightZipKeys = legacyCount === 0 ? await listLegacyZipKeys() : undefined;
  const existingCheckpoint = await context.getCheckpoint(CheckpointSchema);

  if (legacyCount === 0 && (preflightZipKeys?.length ?? 0) === 0 && failures.size === 0) {
    const deletedDevboxes = existingCheckpoint?.deletedDevboxes ?? 0;
    const deletedVolumes = existingCheckpoint?.deletedVolumes ?? 0;
    const deletedZips = existingCheckpoint?.deletedZips ?? 0;
    const deletedOrphans = existingCheckpoint?.deletedOrphans ?? 0;

    return await completeNoopSandboxMigration({
      context,
      stages: [
        {
          key: 'cleanupDevboxes',
          current: existingCheckpoint?.processedDocs ?? 0
        },
        {
          key: 'cleanupLegacyZips',
          current: existingCheckpoint?.processedZips ?? 0
        }
      ],
      result: { deletedDevboxes, deletedVolumes, deletedZips, deletedOrphans }
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
    done: checkpoint.devboxesDone,
    processed: checkpoint.processedDocs,
    total: checkpoint.totalDocs
  };
  const saveCleanupCheckpoint = () => {
    checkpoint.lastDocId = docStage.lastId;
    checkpoint.devboxesDone = docStage.done;
    checkpoint.processedDocs = docStage.processed;
    checkpoint.totalDocs = docStage.total;
    return context.saveCheckpoint(checkpoint);
  };

  const validateTargetTarZstArchive = async (
    targetRow: SandboxMigrationDoc
  ): Promise<{ missingObjectKey?: string }> => {
    const archive = targetRow.storage?.archive;
    if (
      Boolean(archive) ||
      targetRow.status === SandboxInstanceStatusEnum.archived ||
      targetRow.status === SandboxInstanceStatusEnum.restoring
    ) {
      if (!archive || archive.format !== 'tar.zst') {
        throw new Error('Sandbox record lacks validated tar.zst archive metadata');
      }
      if (!archive.objectKey.startsWith(`${SANDBOX_ARCHIVE_PREFIX}/`)) {
        throw new Error(`Sandbox archive objectKey must reside under ${SANDBOX_ARCHIVE_PREFIX}/`);
      }
      if (archive.sizeBytes > 0 && !(await s3Source.isObjectExists(archive.objectKey))) {
        return { missingObjectKey: archive.objectKey };
      }
    }
    return {};
  };

  const cleanupLegacyV2Row = async (doc: SandboxMigrationDoc) => {
    context.signal.throwIfAborted();
    await context.assertActive();
    const recordId = String(doc._id);
    const failureKey = recordId;

    try {
      await withSandboxLease({
        sandboxId: doc.sandboxId,
        label: `cleanup-legacy:${doc.sandboxId}`,
        signal: context.signal,
        fn: async (lease) => {
          const effectiveSignal = AbortSignal.any([context.signal, lease.signal]);
          effectiveSignal.throwIfAborted();

          const latest = await legacyCollection.findOne<SandboxMigrationDoc>(
            { _id: doc._id },
            { projection: SANDBOX_MIGRATION_PROJECTION }
          );
          if (!latest) {
            failures.delete(failureKey);
            return;
          }

          const active = await isSandboxSourceActive(latest, activeSourceCache);
          const targetV3 = await targetCollection.findOne<SandboxMigrationDoc>(
            {
              $or: [
                { sourceType: latest.sourceType, sourceId: latest.sourceId, userId: latest.userId },
                { provider: SANDBOX_PROVIDER, sandboxId: latest.sandboxId }
              ]
            },
            { projection: SANDBOX_MIGRATION_PROJECTION }
          );

          if (active && latest.status !== SandboxInstanceStatusEnum.deleting) {
            if (!targetV3) {
              throw new Error('Active sandbox record is missing migrated v3 record during cleanup');
            }
            const { missingObjectKey } = await validateTargetTarZstArchive(targetV3);
            if (missingObjectKey) {
              throw new Error(
                'Target tar.zst archive object is missing in S3; preserving legacy sandbox resource'
              );
            }
          }

          lease.assertValid();

          if (latest.provider === LEGACY_DEVBOX_PROVIDER) {
            if (!sealosClient) {
              throw new Error(
                'Missing AGENT_SANDBOX_SEALOS_BASEURL or AGENT_SANDBOX_SEALOS_TOKEN to delete legacy Sealos Devbox'
              );
            }
            if (await sealosClient.deleteDevbox(latest.sandboxId, effectiveSignal)) {
              checkpoint.deletedDevboxes += 1;
            }
          } else if (latest.provider === SANDBOX_PROVIDER) {
            // 仅在 v3 不存在对应逻辑实例且旧状态可能存在运行容器时才调用容器删除，严禁误杀已激活的 v3 在线容器。
            const hasPossibleContainer =
              latest.status !== SandboxInstanceStatusEnum.archived &&
              !(
                latest.status === SandboxInstanceStatusEnum.deleting &&
                latest.operation?.previousStatus === SandboxInstanceStatusEnum.archived
              );
            if (!targetV3 && hasPossibleContainer) {
              await deleteOpenSandboxContainer({
                sandboxId: latest.sandboxId,
                allowLegacyUnlabeled: true,
                signal: effectiveSignal
              });
            }

            const legacyClaimName = getSessionVolumeClaimName(latest.storage);
            const isReferencedByTargetV3 = Boolean(
              legacyClaimName &&
              targetV3?.storage?.volumes?.some((volume) => volume.claimName === legacyClaimName)
            );
            if (legacyClaimName && !isReferencedByTargetV3) {
              await deleteSessionVolume(legacyClaimName, {
                allowLegacyUnlabeled: true,
                signal: effectiveSignal
              });
              checkpoint.deletedVolumes += 1;
            }
          }

          lease.assertValid();
          const deleteRes = await legacyCollection.deleteOne({ _id: latest._id });
          if (
            (!active || latest.status === SandboxInstanceStatusEnum.deleting) &&
            deleteRes.deletedCount > 0
          ) {
            checkpoint.deletedOrphans += 1;
          }
          failures.delete(failureKey);
        }
      });
    } catch (error) {
      context.signal.throwIfAborted();
      failures.set(failureKey, {
        stageKey: 'cleanupDevboxes',
        data: { id: recordId, sandboxId: doc.sandboxId },
        reason: {
          message: sanitizeMigrationFailureMessage(error, 'Legacy sandbox resource cleanup failed')
        }
      });
    }
  };

  // 清理所有 v2 记录、远端 Devbox、未被 v3 引用的旧 PVC 以及 v2 孤儿/deleting 行。
  await runSandboxDocCursorStage({
    context,
    collection: legacyCollection,
    failures,
    stageKey: 'cleanupDevboxes',
    retryStageKeys: ['cleanupDevboxes', 'validation'],
    filter: {},
    stage: docStage,
    concurrency: CLEANUP_CONCURRENCY,
    maxFailures: MAX_FAILURE_RECORDS,
    failMessage: 'Too many legacy Devbox cleanup failures; inspect failed records before retrying',
    processDoc: cleanupLegacyV2Row,
    saveCheckpoint: saveCleanupCheckpoint
  });

  // ---- Stage: cleanupLegacyZips ----
  const cleanupLegacyZipKey = async (key: string) => {
    context.signal.throwIfAborted();
    await context.assertActive();
    const match = LEGACY_ZIP_KEY_REGEX.exec(key);
    if (!match) return;
    const rawSandboxId = match[1];

    try {
      const legacyRow = await legacyCollection.findOne<SandboxMigrationDoc>(
        {
          sandboxId: rawSandboxId,
          status: { $ne: SandboxInstanceStatusEnum.deleting }
        },
        { projection: SANDBOX_MIGRATION_PROJECTION }
      );
      if (legacyRow && (await isSandboxSourceActive(legacyRow, activeSourceCache))) {
        throw new Error(
          'Active legacy sandbox row still exists in v2; preserving legacy package.zip'
        );
      }

      const targetRow = await targetCollection.findOne<SandboxMigrationDoc>(
        {
          provider: SANDBOX_PROVIDER,
          sandboxId: rawSandboxId
        },
        { projection: SANDBOX_MIGRATION_PROJECTION }
      );

      if (targetRow && (await isSandboxSourceActive(targetRow, activeSourceCache))) {
        const { missingObjectKey } = await validateTargetTarZstArchive(targetRow);
        if (missingObjectKey) {
          await withSandboxLease({
            sandboxId: targetRow.sandboxId,
            label: `verify-legacy-zip:${targetRow.sandboxId}`,
            signal: context.signal,
            fn: async (lease) => {
              AbortSignal.any([context.signal, lease.signal]).throwIfAborted();
              const latestRow = await targetCollection.findOne<SandboxMigrationDoc>(
                { _id: targetRow._id },
                { projection: SANDBOX_MIGRATION_PROJECTION }
              );
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
        data: { key, sandboxId: rawSandboxId },
        reason: {
          message: sanitizeMigrationFailureMessage(error, 'Legacy sandbox resource cleanup failed')
        }
      });
    }
  };

  const allRemainingZipKeys = preflightZipKeys ?? (await listLegacyZipKeys());
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
    const key = item.data.key;
    if (seenRetryKeys.has(key)) continue;
    seenRetryKeys.add(key);
    if (existingZipSet.has(key)) {
      if (checkpoint.zipsDone || (checkpoint.lastZipKey !== null && key <= checkpoint.lastZipKey)) {
        activeZipRetries.push(key);
      }
    } else {
      failures.delete(key);
      clearedMissingZips = true;
    }
  }

  const keysToProcess = checkpoint.zipsDone
    ? []
    : allRemainingZipKeys.filter((key) => !checkpoint.lastZipKey || key > checkpoint.lastZipKey);

  checkpoint.totalZips = Math.max(
    checkpoint.totalZips ?? 0,
    checkpoint.processedZips + activeZipRetries.length + keysToProcess.length
  );

  const zipProgressReporter = createStageProgressReporter({
    context,
    stageKey: 'cleanupLegacyZips',
    getProgress: () => ({
      current: checkpoint.processedZips,
      total: Math.max(checkpoint.totalZips ?? 0, checkpoint.processedZips)
    })
  });
  await zipProgressReporter.reportStart();

  const cleanupAndTrackZipKey = async (key: string) => {
    await cleanupLegacyZipKey(key);
    if (!failures.has(key)) {
      checkpoint.processedZips += 1;
      checkpoint.totalZips = Math.max(checkpoint.totalZips ?? 0, checkpoint.processedZips);
      await zipProgressReporter.reportIfDue();
    }
  };

  if (activeZipRetries.length > 0) {
    await batchRun(activeZipRetries, cleanupAndTrackZipKey, CLEANUP_CONCURRENCY);
    await context.reportFailedRecords([...failures.values()]);
    await saveCleanupCheckpoint();
    await zipProgressReporter.flush();
  } else if (clearedMissingZips) {
    await context.reportFailedRecords([...failures.values()]);
  }

  if (!checkpoint.zipsDone) {
    for (let i = 0; i < keysToProcess.length; i += systemMigrationBatchSize) {
      context.signal.throwIfAborted();
      await context.assertActive();

      const batch = keysToProcess.slice(i, i + systemMigrationBatchSize);
      await batchRun(batch, cleanupAndTrackZipKey, CLEANUP_CONCURRENCY);

      if (failures.size >= MAX_FAILURE_RECORDS) {
        await zipProgressReporter.flush();
        await context.fail({
          message: 'Too many legacy package.zip cleanup failures; inspect failed records',
          failedRecords: [...failures.values()]
        });
      }

      await context.reportFailedRecords([...failures.values()]);
      checkpoint.lastZipKey = batch[batch.length - 1];
      await saveCleanupCheckpoint();
      await zipProgressReporter.flush();
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
    if (checkpoint.totalZips !== checkpoint.processedZips) {
      checkpoint.totalZips = checkpoint.processedZips;
      await saveCleanupCheckpoint();
    }
    await zipProgressReporter.reportSucceeded();
  } else {
    await zipProgressReporter.flush();
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
    checkpoint.processedZips = 0;
    checkpoint.totalZips = undefined;
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

  const residualV2Docs = await legacyCollection
    .find<SandboxMigrationDoc>({}, { projection: SANDBOX_MIGRATION_PROJECTION })
    .sort({ _id: 1 })
    .limit(systemMigrationBatchSize)
    .toArray();
  if (residualV2Docs.length > 0) {
    // 重置 v2 清理游标，使重跑既能重放失败快照也能覆盖期间新增的残留记录。
    docStage.lastId = null;
    docStage.done = false;
    docStage.processed = 0;
    docStage.total = undefined;
    await saveCleanupCheckpoint();
    await context.fail({
      message: 'Legacy sandbox resource cleanup validation failed with remaining v2 records',
      failedRecords: residualV2Docs.map((doc) => ({
        stageKey: 'validation',
        data: { id: String(doc._id), sandboxId: doc.sandboxId },
        reason: { message: 'Legacy v2 sandbox record still remains after cleanup' }
      }))
    });
  }

  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.succeeded
  });

  return {
    deletedDevboxes: checkpoint.deletedDevboxes,
    deletedVolumes: checkpoint.deletedVolumes,
    deletedZips: checkpoint.deletedZips,
    deletedOrphans: checkpoint.deletedOrphans
  };
};
