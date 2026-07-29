/** Legacy Sandbox 归档前清理和 Source 删除清理。 */
import { getErrText } from '@fastgpt/global/common/error/utils';
import { batchRunSettled } from '@fastgpt/global/common/system/utils';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { getS3SandboxSource } from '../../../../../common/s3/sources/sandbox';
import {
  completeLegacySandboxArchive,
  deleteLegacySandboxInstanceRecord,
  findLegacySandboxInstancesBySource,
  updateLegacySandboxArchiveState
} from '../../infrastructure/instance/legacyRepository';
import type { LegacySandboxInstanceSchemaType } from '../../infrastructure/instance/legacySchema';
import { buildSandboxResourceAdapter } from '../../infrastructure/provider/adapter';
import { deleteSessionVolume } from '../../infrastructure/volume/service';
import { getSandboxWorkspaceArchiveForMigration } from '../archive';
import {
  deleteAppSandboxes as deleteCurrentAppSandboxes,
  deleteSkillEditSandboxes as deleteCurrentSkillSandboxes
} from '../resource';
import { withSandboxSourceMutationLease } from '../lease';
import { assertSandboxSourceDeleted } from '../sourceGuard';
import type { LegacySandboxCleanupStep } from './types';
import { getLegacyMigrationPhase, toLegacyResource } from './utils';

const APP_SANDBOX_MIGRATION_CONCURRENCY = 5;
const SOURCE_DELETE_CONCURRENCY = 10;
const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

export class LegacySandboxCleanupError extends Error {
  constructor(
    readonly step: LegacySandboxCleanupStep,
    error: unknown
  ) {
    super(getErrText(error));
    this.name = 'LegacySandboxCleanupError';
  }
}

const runLegacyCleanupStep = async (params: {
  step: LegacySandboxCleanupStep;
  assertLeaseValid: () => void;
  fn: () => Promise<unknown>;
}) => {
  try {
    params.assertLeaseValid();
    await params.fn();
    params.assertLeaseValid();
  } catch (error) {
    throw new LegacySandboxCleanupError(params.step, error);
  }
};

/** 删除旧物理 Sandbox 和 volume，但保留迁移备份与 Legacy 记录。 */
async function deleteLegacyPhysicalResources(params: {
  doc: LegacySandboxInstanceSchemaType;
  assertLeaseValid: () => void;
}) {
  const { doc, assertLeaseValid } = params;
  const resource = toLegacyResource(doc);
  await runLegacyCleanupStep({
    step: 'delete_sandbox',
    assertLeaseValid,
    fn: async () => {
      if (doc.metadata?.archive?.state === 'archived') return;
      await buildSandboxResourceAdapter(resource).delete();
    }
  });
  if (resource.provider === 'opensandbox') {
    await runLegacyCleanupStep({
      step: 'delete_volume',
      assertLeaseValid,
      fn: () => deleteSessionVolume(resource.sandboxId)
    });
  }
}

/**
 * 在创建任何 v2 目标前完成一条 Legacy 记录的归档和物理资源删除。
 *
 * `deleting` 必须先于远端删除持久化，保证删除后的重试只复用 S3 归档。
 */
export async function archiveLegacyInstanceBeforeMigration(params: {
  doc: LegacySandboxInstanceSchemaType;
  targetSandboxId: string;
  assertLeaseValid: () => void;
}) {
  const { doc, targetSandboxId, assertLeaseValid } = params;
  const phase = getLegacyMigrationPhase(doc);
  const migrationState = doc.metadata?.userLevelMigration;
  if (migrationState && migrationState.targetSandboxId !== targetSandboxId) {
    throw new Error(
      `Legacy migration target mismatch for ${doc.sandboxId}: expected ${targetSandboxId}, received ${migrationState.targetSandboxId}`
    );
  }
  if (phase === 'completed') return;

  if (phase === 'pending') {
    await runLegacyCleanupStep({
      step: 'archive_workspace',
      assertLeaseValid,
      fn: () => getSandboxWorkspaceArchiveForMigration(toLegacyResource(doc))
    });
  }

  const assertArchiveExists = () =>
    runLegacyCleanupStep({
      step: 'verify_archive',
      assertLeaseValid,
      fn: async () => {
        const exists = await getS3SandboxSource().isLegacyWorkspaceArchiveExists({
          sandboxId: doc.sandboxId
        });
        if (!exists) {
          throw new Error(`Legacy Sandbox workspace archive is missing: ${doc.sandboxId}`);
        }
      }
    });

  // phase 越过 pending 后，S3 归档是持久事实，缺失时不能回退到旧实例重新推断。
  await assertArchiveExists();
  if (doc.metadata?.archive?.state !== 'archived') {
    await runLegacyCleanupStep({
      step: 'mark_archive_deleting',
      assertLeaseValid,
      fn: async () => {
        const now = new Date();
        const currentArchive = doc.metadata?.archive;
        const archive = {
          state: 'deleting' as const,
          startedAt: currentArchive?.startedAt ?? now,
          deleteStartedAt: currentArchive?.deleteStartedAt ?? now,
          ...(currentArchive?.archivedAt ? { archivedAt: currentArchive.archivedAt } : {})
        };
        await updateLegacySandboxArchiveState({ id: doc._id, archive });
        doc.metadata = { ...(doc.metadata ?? {}), archive };
      }
    });
  }

  await deleteLegacyPhysicalResources({ doc, assertLeaseValid });
  await assertArchiveExists();
  await runLegacyCleanupStep({
    step: 'complete_legacy_archive',
    assertLeaseValid,
    fn: async () => {
      const now = new Date();
      const archive = {
        state: 'archived' as const,
        ...(doc.metadata?.archive?.startedAt ? { startedAt: doc.metadata.archive.startedAt } : {}),
        archivedAt: doc.metadata?.archive?.archivedAt ?? now
      };
      const migration = {
        phase: phase === 'pending' ? ('archiveReady' as const) : phase,
        targetSandboxId,
        updatedAt: now
      };
      await completeLegacySandboxArchive({
        id: doc._id,
        status: SandboxStatusEnum.stopped,
        archive,
        migration
      });
      doc.status = SandboxStatusEnum.stopped;
      doc.metadata = { ...(doc.metadata ?? {}), archive, userLevelMigration: migration };
    }
  });
}

/** Source 删除时最终清理保留的 Legacy 归档和 Mongo 记录。 */
async function cleanupLegacyInstanceForSourceDeletion(params: {
  doc: LegacySandboxInstanceSchemaType;
  assertLeaseValid: () => void;
}) {
  const { doc, assertLeaseValid } = params;
  await deleteLegacyPhysicalResources({ doc, assertLeaseValid });
  await runLegacyCleanupStep({
    step: 'delete_archive',
    assertLeaseValid,
    fn: () => getS3SandboxSource().deleteLegacyWorkspaceArchiveNow({ sandboxId: doc.sandboxId })
  });
  await runLegacyCleanupStep({
    step: 'delete_legacy_record',
    assertLeaseValid,
    fn: () => deleteLegacySandboxInstanceRecord(doc._id)
  });
}

/** 清理同一 Source 的 Legacy 资源；全部任务收敛后记录每个失败实例。 */
async function cleanupLegacyInstancesForSourceDeletion(params: {
  legacy: LegacySandboxInstanceSchemaType[];
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  assertLeaseValid: () => void;
  concurrency: number;
}) {
  const { legacy, sourceType, sourceId, assertLeaseValid, concurrency } = params;
  const results = await batchRunSettled(
    legacy,
    (doc) => cleanupLegacyInstanceForSourceDeletion({ doc, assertLeaseValid }),
    concurrency
  );
  const failures = results.flatMap((result, index) => {
    if (result.success) return [];
    return [
      {
        sandboxId: legacy[index].sandboxId,
        ...(result.error instanceof LegacySandboxCleanupError ? { step: result.error.step } : {}),
        error: getErrText(result.error, 'Unknown Legacy Sandbox cleanup error')
      }
    ];
  });
  if (failures.length === 0) return;

  logger.error('Failed to clean up Legacy Sandbox resources', {
    sourceType,
    sourceId,
    failureCount: failures.length,
    failures
  });
  throw new Error(`Failed to clean up ${failures.length} Legacy Sandbox resources`);
}

/** App 删除在 Source Lease 内同时清理 v2 和 Legacy 资源。 */
export async function deleteAppSandboxesForAppDeletion(appId: string): Promise<void> {
  await withSandboxSourceMutationLease({
    sourceType: ChatSourceTypeEnum.app,
    sourceId: appId,
    label: `delete-app-sandboxes:${appId}`,
    fn: async ({ assertValid }) => {
      await assertSandboxSourceDeleted({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId
      });
      assertValid();
      await deleteCurrentAppSandboxes(appId);
      const legacy = await findLegacySandboxInstancesBySource({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId
      });
      await cleanupLegacyInstancesForSourceDeletion({
        legacy,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
        assertLeaseValid: assertValid,
        concurrency: APP_SANDBOX_MIGRATION_CONCURRENCY
      });
    }
  });
}

/** Skill 删除按 source 串行清理 v2 和 Legacy 资源。 */
export async function deleteSkillEditSandboxesForSkillDeletion(skillIds: string[]) {
  const results = await batchRunSettled(
    skillIds,
    async (skillId) => {
      await withSandboxSourceMutationLease({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        label: `delete-skill-sandbox:${skillId}`,
        fn: async ({ assertValid }) => {
          await assertSandboxSourceDeleted({
            sourceType: ChatSourceTypeEnum.skillEdit,
            sourceId: skillId
          });
          assertValid();
          await deleteCurrentSkillSandboxes([skillId]);
          const legacy = await findLegacySandboxInstancesBySource({
            sourceType: ChatSourceTypeEnum.skillEdit,
            sourceId: skillId
          });
          await cleanupLegacyInstancesForSourceDeletion({
            legacy,
            sourceType: ChatSourceTypeEnum.skillEdit,
            sourceId: skillId,
            assertLeaseValid: assertValid,
            concurrency: SOURCE_DELETE_CONCURRENCY
          });
        }
      });
    },
    SOURCE_DELETE_CONCURRENCY
  );

  const failures = results.flatMap((result, index) => {
    if (result.success) return [];
    return [
      {
        skillId: skillIds[index],
        error: getErrText(result.error, 'Unknown Skill Sandbox cleanup error')
      }
    ];
  });
  if (failures.length === 0) return;

  logger.error('Failed to clean up Skill Sandbox sources', {
    failureCount: failures.length,
    failures
  });
  throw new Error(`Failed to clean up ${failures.length} Skill Sandbox sources`);
}
