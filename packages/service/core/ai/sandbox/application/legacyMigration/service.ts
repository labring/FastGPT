/** Legacy Sandbox 到用户级 v2 Sandbox 的迁移编排。 */
import { randomUUID } from 'node:crypto';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import pLimit from 'p-limit';
import { subMinutes } from 'date-fns';
import { pushTrack } from '../../../../../common/middle/tracks/utils';
import { getS3SandboxSource } from '../../../../../common/s3/sources/sandbox';
import { getAgentSandboxArchiveMaxBytes } from '../../config';
import type { LegacySandboxInstanceSchemaType } from '../../infrastructure/instance/legacySchema';
import {
  findAllLegacySandboxInstanceRecords,
  updateLegacySandboxMigrationState
} from '../../infrastructure/instance/legacyRepository';
import {
  advanceSandboxOperation,
  claimAppSandboxMigrationTarget,
  claimSkillSandboxMigrationTarget,
  completeSandboxOperation,
  findSandboxInstanceBySource,
  markSandboxOperationFailed
} from '../../infrastructure/instance/repository';
import { getConfiguredSandboxProvider } from '../../infrastructure/provider/config';
import { SandboxInstanceStatusEnum } from '../../type';
import { SANDBOX_STALE_ARCHIVING_MINUTES, restoreArchivedSandboxBeforeUse } from '../archive';
import {
  withLegacySandboxMigrationJobLease,
  withSandboxLifecycleLease,
  withSandboxSourceMutationLease
} from '../lease';
import { assertSandboxSourceActive } from '../sourceGuard';
import { archiveLegacyInstanceBeforeMigration, LegacySandboxCleanupError } from './cleanup';
import type {
  LegacyMigrationPhase,
  ResolvedLegacyApp,
  ResolvedLegacySkill,
  UserSandboxMigrationParams,
  UserSandboxMigrationResult
} from './types';
import {
  getLegacyMigrationPhase,
  getLegacyMigrationTargetSandboxId,
  isStableSandboxStatus,
  parseLegacySandboxInstances
} from './utils';
import {
  createMigrationTarget,
  getMigrationTargetMetadata,
  installLegacySkillWorkspaceArchive,
  installLegacyWorkspaceArchive
} from './workspace';

const APP_SANDBOX_MIGRATION_CONCURRENCY = 5;
const SKILL_SANDBOX_MIGRATION_CONCURRENCY = 20;

type UserSandboxMigrationTrackData = Parameters<typeof pushTrack.userSandboxMigration>[0];

const recordMigrationTrack = async (data: UserSandboxMigrationTrackData) => {
  await Promise.resolve(pushTrack.userSandboxMigration(data)).catch(() => undefined);
};

/** 持久化单条 Legacy 迁移阶段；目录存在不能替代阶段提交。 */
const setLegacyMigrationPhase = async (params: {
  doc: LegacySandboxInstanceSchemaType;
  phase: LegacyMigrationPhase;
  targetSandboxId: string;
}) => {
  const state = {
    phase: params.phase,
    targetSandboxId: params.targetSandboxId,
    updatedAt: new Date()
  };
  await updateLegacySandboxMigrationState({ id: params.doc._id, state });
  params.doc.metadata = { ...(params.doc.metadata ?? {}), userLevelMigration: state };
};

/** 第一阶段按 source 串行归档 Legacy 资源；全部成功后才允许创建 v2 目标。 */
async function archiveAllLegacySandboxes(params: {
  docs: LegacySandboxInstanceSchemaType[];
  result: UserSandboxMigrationResult;
  runId: string;
}) {
  const { docs, result, runId } = params;
  const failedIds = new Set<string>();
  const groups = new Map<string, LegacySandboxInstanceSchemaType[]>();
  for (const doc of docs) {
    if (getLegacyMigrationPhase(doc) === 'completed') continue;
    const key = `${doc.sourceType}\u0000${doc.sourceId}`;
    groups.set(key, [...(groups.get(key) ?? []), doc]);
  }

  const recordFailure = async (doc: LegacySandboxInstanceSchemaType, error: unknown) => {
    const id = String(doc._id);
    if (failedIds.has(id)) return;
    failedIds.add(id);
    const errorText = getErrText(error);
    result.failures.push({ sandboxId: doc.sandboxId, error: errorText });
    await recordMigrationTrack({
      runId,
      phase: 'failure',
      dryRun: false,
      sandboxId: doc.sandboxId,
      step: error instanceof LegacySandboxCleanupError ? error.step : 'archive_legacy',
      error: errorText
    });
  };

  const archiveGroup = async (group: LegacySandboxInstanceSchemaType[]) => {
    const first = group[0];
    try {
      await withSandboxSourceMutationLease({
        sourceType: first.sourceType,
        sourceId: first.sourceId,
        label: `archive-legacy-sandboxes:${first.sourceType}:${first.sourceId}`,
        fn: async (sourceLease) => {
          await assertSandboxSourceActive({
            sourceType: first.sourceType,
            sourceId: first.sourceId
          });
          sourceLease.assertValid();
          for (const doc of group) {
            try {
              await archiveLegacyInstanceBeforeMigration({
                doc,
                targetSandboxId: getLegacyMigrationTargetSandboxId(doc),
                assertLeaseValid: sourceLease.assertValid
              });
            } catch (error) {
              await recordFailure(doc, error);
            }
          }
        }
      });
    } catch (error) {
      await Promise.all(group.map((doc) => recordFailure(doc, error)));
    }
  };

  const skillLimit = pLimit(SKILL_SANDBOX_MIGRATION_CONCURRENCY);
  const appLimit = pLimit(APP_SANDBOX_MIGRATION_CONCURRENCY);
  const skillGroups: LegacySandboxInstanceSchemaType[][] = [];
  const appGroups: LegacySandboxInstanceSchemaType[][] = [];
  for (const group of groups.values()) {
    if (group[0].sourceType === ChatSourceTypeEnum.skillEdit) skillGroups.push(group);
    else appGroups.push(group);
  }
  await Promise.all(skillGroups.map((group) => skillLimit(() => archiveGroup(group))));
  await Promise.all(appGroups.map((group) => appLimit(() => archiveGroup(group))));
  return failedIds.size === 0;
}

/** 把单条 Legacy Skill workspace 发布到确定性 v2 Sandbox。 */
const migrateLegacySkill = async (item: ResolvedLegacySkill) => {
  const targetSandboxId = getLegacyMigrationTargetSandboxId(item.doc);

  await withSandboxSourceMutationLease({
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: item.sourceId,
    label: `migrate-skill-sandbox:${item.sourceId}`,
    fn: async (sourceLease) => {
      await assertSandboxSourceActive({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: item.sourceId
      });
      sourceLease.assertValid();

      const migrationState = item.doc.metadata?.userLevelMigration;
      if (migrationState && migrationState.targetSandboxId !== targetSandboxId) {
        throw new Error(
          `Legacy migration target mismatch for ${item.doc.sandboxId}: expected ${targetSandboxId}, received ${migrationState.targetSandboxId}`
        );
      }
      const existing = await findSandboxInstanceBySource({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: item.sourceId,
        userId: ChatSourceTypeEnum.skillEdit
      });
      if (existing && existing.sandboxId !== targetSandboxId) {
        throw new Error('Skill sandbox migration target conflicts with another sandbox');
      }

      let phase = getLegacyMigrationPhase(item.doc);
      const targetIsStable = isStableSandboxStatus(existing?.status);
      const completionOnly =
        targetIsStable && (phase === 'installed' || phase === 'cleanupPending');
      if ((phase === 'installed' || phase === 'cleanupPending') && !existing) {
        throw new Error('Published Skill migration target is missing before Legacy completion');
      }
      if (phase === 'cleanupPending' && !targetIsStable) {
        throw new Error(`Published Skill migration target is still ${existing?.status}`);
      }
      if (
        !completionOnly &&
        existing &&
        (existing.status === SandboxInstanceStatusEnum.archived ||
          existing.status === SandboxInstanceStatusEnum.restoring)
      ) {
        sourceLease.assertValid();
        const provider = getConfiguredSandboxProvider();
        await restoreArchivedSandboxBeforeUse({
          provider,
          sandboxId: targetSandboxId,
          sourceType: ChatSourceTypeEnum.skillEdit,
          sourceId: item.sourceId,
          userId: ChatSourceTypeEnum.skillEdit,
          resourceLimit: existing.limit ?? undefined
        });
        sourceLease.assertValid();
      }

      if (!completionOnly) {
        await withSandboxLifecycleLease({
          sandboxId: targetSandboxId,
          label: `migrate-skill-sandbox-lifecycle:${targetSandboxId}`,
          fn: async (lifecycleLease) => {
            const assertLeasesValid = () => {
              sourceLease.assertValid();
              lifecycleLease.assertValid();
            };
            const provider = getConfiguredSandboxProvider();
            const targetDoc = await claimSkillSandboxMigrationTarget({
              provider,
              sandboxId: targetSandboxId,
              sourceId: item.sourceId,
              metadata: getMigrationTargetMetadata(item.doc.metadata, provider),
              reclaimHeartbeatBefore: subMinutes(new Date(), SANDBOX_STALE_ARCHIVING_MINUTES)
            });
            if (!targetDoc?.metadata?.operation?.id) {
              throw new Error('Skill sandbox migration target is unavailable or busy');
            }

            const operationId = targetDoc.metadata.operation.id;
            let operationPhase = targetDoc.metadata.operation.phase;
            try {
              assertLeasesValid();
              const target = await createMigrationTarget({
                provider: targetDoc.provider,
                sandboxId: targetDoc.sandboxId,
                sourceType: ChatSourceTypeEnum.skillEdit,
                limit: item.doc.limit
              });
              assertLeasesValid();
              if (operationPhase === 'claimed') {
                const ensured = await advanceSandboxOperation({
                  resource: targetDoc,
                  operationId,
                  status: SandboxInstanceStatusEnum.legacyMigrating,
                  phase: 'targetEnsured'
                });
                if (!ensured) {
                  throw new Error('Skill sandbox migration lost ownership after target ensure');
                }
                operationPhase = 'targetEnsured';
              }
              if (operationPhase !== 'targetEnsured') {
                throw new Error(`Unsupported Skill sandbox migration phase: ${operationPhase}`);
              }

              if (phase === 'archiveReady') {
                assertLeasesValid();
                const body = await getS3SandboxSource().downloadLegacyWorkspaceArchive({
                  sandboxId: item.doc.sandboxId,
                  maxBytes: getAgentSandboxArchiveMaxBytes()
                });
                assertLeasesValid();
                await installLegacySkillWorkspaceArchive({
                  target,
                  legacySandboxId: item.doc.sandboxId,
                  archiveBody: body
                });
                assertLeasesValid();
                await setLegacyMigrationPhase({
                  doc: item.doc,
                  phase: 'installed',
                  targetSandboxId
                });
                phase = 'installed';
              }
              if (phase !== 'installed') {
                throw new Error(`Legacy Skill record cannot be published from phase ${phase}`);
              }

              const heartbeat = await advanceSandboxOperation({
                resource: targetDoc,
                operationId,
                status: SandboxInstanceStatusEnum.legacyMigrating,
                phase: 'targetEnsured'
              });
              if (!heartbeat) {
                throw new Error('Skill sandbox migration lost ownership after workspace install');
              }
              const published = await completeSandboxOperation({
                resource: targetDoc,
                operationId,
                fromStatus: SandboxInstanceStatusEnum.legacyMigrating,
                status: SandboxInstanceStatusEnum.running,
                touchActive: true,
                set: {
                  ...(target.storage !== undefined ? { storage: target.storage } : {}),
                  ...(item.doc.limit ? { limit: item.doc.limit } : {})
                }
              });
              if (!published)
                throw new Error('Skill migration target lost ownership before publish');
            } catch (error) {
              await markSandboxOperationFailed({
                resource: targetDoc,
                operationId,
                status: SandboxInstanceStatusEnum.legacyMigrating,
                error: getErrText(error)
              }).catch(() => undefined);
              throw error;
            }
          }
        });
      }

      if (phase !== 'installed' && phase !== 'cleanupPending') {
        throw new Error(`Legacy Skill record cannot be completed from phase ${phase}`);
      }
      await setLegacyMigrationPhase({ doc: item.doc, phase: 'completed', targetSandboxId });
    }
  });
};

/** 把同一 App/user 下的全部 chat workspace 原子发布到一个 v2 Sandbox。 */
const migrateAppGroup = async (params: {
  group: ResolvedLegacyApp[];
  result: UserSandboxMigrationResult;
  runId: string;
}) => {
  const { group, result, runId } = params;
  const first = group[0];
  const targetSandboxId = getLegacyMigrationTargetSandboxId(first.doc);

  await withSandboxSourceMutationLease({
    sourceType: ChatSourceTypeEnum.app,
    sourceId: first.sourceId,
    label: `migrate-app-sandbox:${first.sourceId}:${first.userId}`,
    fn: async (sourceLease) => {
      await assertSandboxSourceActive({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: first.sourceId
      });
      sourceLease.assertValid();
      for (const item of group) {
        const migrationState = item.doc.metadata?.userLevelMigration;
        if (migrationState && migrationState.targetSandboxId !== targetSandboxId) {
          throw new Error(
            `Legacy migration target mismatch for ${item.doc.sandboxId}: expected ${targetSandboxId}, received ${migrationState.targetSandboxId}`
          );
        }
      }

      const existing = await findSandboxInstanceBySource({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: first.sourceId,
        userId: first.userId
      });
      if (existing && existing.sandboxId !== targetSandboxId) {
        throw new Error('App sandbox migration target conflicts with another sandbox');
      }
      const phases = group.map((item) => getLegacyMigrationPhase(item.doc));
      const legacyWorkspacesInstalled = phases.every(
        (phase) => phase === 'installed' || phase === 'cleanupPending'
      );
      const targetIsStable = isStableSandboxStatus(existing?.status);
      if (legacyWorkspacesInstalled && !existing) {
        throw new Error('Published migration target is missing before Legacy completion');
      }
      if (
        legacyWorkspacesInstalled &&
        existing &&
        !targetIsStable &&
        existing.status !== SandboxInstanceStatusEnum.legacyMigrating
      ) {
        throw new Error(`Published migration target is still ${existing.status}`);
      }
      // installed 只表示文件已落盘；非稳定目标仍须接管 operation 完成发布。
      const completionOnly = legacyWorkspacesInstalled && targetIsStable;
      if (
        !completionOnly &&
        existing &&
        (existing.status === SandboxInstanceStatusEnum.archived ||
          existing.status === SandboxInstanceStatusEnum.restoring)
      ) {
        sourceLease.assertValid();
        const provider = getConfiguredSandboxProvider();
        await restoreArchivedSandboxBeforeUse({
          provider,
          sandboxId: targetSandboxId,
          sourceType: ChatSourceTypeEnum.app,
          sourceId: first.sourceId,
          userId: first.userId,
          resourceLimit: existing.limit ?? undefined
        });
        sourceLease.assertValid();
      }

      if (!completionOnly) {
        await withSandboxLifecycleLease({
          sandboxId: targetSandboxId,
          label: `migrate-app-sandbox-lifecycle:${targetSandboxId}`,
          fn: async (lifecycleLease) => {
            const assertLeasesValid = () => {
              sourceLease.assertValid();
              lifecycleLease.assertValid();
            };
            const provider = getConfiguredSandboxProvider();
            const targetDoc = await claimAppSandboxMigrationTarget({
              provider,
              sandboxId: targetSandboxId,
              sourceId: first.sourceId,
              userId: first.userId,
              metadata: getMigrationTargetMetadata(first.doc.metadata, provider),
              reclaimHeartbeatBefore: subMinutes(new Date(), SANDBOX_STALE_ARCHIVING_MINUTES)
            });
            if (!targetDoc?.metadata?.operation?.id) {
              throw new Error('App sandbox migration target is unavailable or busy');
            }
            const operationId = targetDoc.metadata.operation.id;
            let operationPhase = targetDoc.metadata.operation.phase;

            try {
              assertLeasesValid();
              const target = await createMigrationTarget({
                provider: targetDoc.provider,
                sandboxId: targetDoc.sandboxId,
                sourceType: ChatSourceTypeEnum.app,
                chatId: first.chatId,
                limit: first.doc.limit
              });
              assertLeasesValid();
              if (operationPhase === 'claimed') {
                const ensured = await advanceSandboxOperation({
                  resource: targetDoc,
                  operationId,
                  status: SandboxInstanceStatusEnum.legacyMigrating,
                  phase: 'targetEnsured'
                });
                if (!ensured) {
                  throw new Error('App sandbox migration lost ownership after target ensure');
                }
                operationPhase = 'targetEnsured';
              }
              if (operationPhase !== 'targetEnsured') {
                throw new Error(`Unsupported App sandbox migration phase: ${operationPhase}`);
              }

              for (const item of group) {
                if (getLegacyMigrationPhase(item.doc) === 'archiveReady') {
                  assertLeasesValid();
                  const body = await getS3SandboxSource().downloadLegacyWorkspaceArchive({
                    sandboxId: item.doc.sandboxId,
                    maxBytes: getAgentSandboxArchiveMaxBytes()
                  });
                  assertLeasesValid();
                  await installLegacyWorkspaceArchive({
                    target,
                    legacySandboxId: item.doc.sandboxId,
                    chatId: item.chatId,
                    archiveBody: body
                  });
                  assertLeasesValid();
                  await setLegacyMigrationPhase({
                    doc: item.doc,
                    phase: 'installed',
                    targetSandboxId
                  });
                }
                assertLeasesValid();
                const heartbeat = await advanceSandboxOperation({
                  resource: targetDoc,
                  operationId,
                  status: SandboxInstanceStatusEnum.legacyMigrating,
                  phase: 'targetEnsured'
                });
                if (!heartbeat) {
                  throw new Error(
                    `App sandbox migration lost ownership after installing ${item.doc.sandboxId}`
                  );
                }
              }

              const allInstalled = group.every((item) =>
                ['installed', 'cleanupPending'].includes(getLegacyMigrationPhase(item.doc))
              );
              if (!allInstalled) throw new Error('Not all Legacy workspaces were installed');
              lifecycleLease.assertValid();
              const published = await completeSandboxOperation({
                resource: targetDoc,
                operationId,
                fromStatus: SandboxInstanceStatusEnum.legacyMigrating,
                status: SandboxInstanceStatusEnum.running,
                touchActive: true
              });
              if (!published) throw new Error('Migration target lost ownership before publish');
              result.completedAppGroupCount += 1;
            } catch (error) {
              await markSandboxOperationFailed({
                resource: targetDoc,
                operationId,
                status: SandboxInstanceStatusEnum.legacyMigrating,
                error: getErrText(error)
              }).catch(() => undefined);
              throw error;
            }
          }
        });
      }

      for (const item of group) {
        const phase = getLegacyMigrationPhase(item.doc);
        if (phase !== 'installed' && phase !== 'cleanupPending') {
          throw new Error(`Legacy record cannot be completed from phase ${phase}`);
        }
        sourceLease.assertValid();
        await setLegacyMigrationPhase({ doc: item.doc, phase: 'completed', targetSandboxId });
        result.migratedAppCount += 1;
      }
    }
  }).catch(async (error) => {
    const errorText = getErrText(error);
    result.failures.push({ sandboxId: first.doc.sandboxId, error: errorText });
    await recordMigrationTrack({
      runId,
      phase: 'failure',
      dryRun: false,
      sandboxId: first.doc.sandboxId,
      step: error instanceof LegacySandboxCleanupError ? error.step : 'migrate_app',
      error: errorText
    });
  });
};

/** 执行 Legacy Sandbox 到用户级 Sandbox 的管理员 migration。 */
const runLegacySandboxMigration = async (
  params: UserSandboxMigrationParams,
  runId: string
): Promise<UserSandboxMigrationResult> => {
  const dryRun = params.dryRun ?? true;
  const startedAt = Date.now();
  const docs = parseLegacySandboxInstances(await findAllLegacySandboxInstanceRecords());
  const completedLegacyCount = docs.filter(
    (doc) => getLegacyMigrationPhase(doc) === 'completed'
  ).length;
  const skillItems: ResolvedLegacySkill[] = [];
  const appGroups = new Map<string, ResolvedLegacyApp[]>();
  for (const doc of docs) {
    if (getLegacyMigrationPhase(doc) === 'completed') continue;
    if (doc.sourceType === ChatSourceTypeEnum.skillEdit) {
      skillItems.push({ doc, sourceId: doc.sourceId });
    } else {
      const item = { doc, sourceId: doc.sourceId, userId: doc.userId, chatId: doc.chatId };
      const key = `${item.sourceId}\u0000${item.userId}`;
      appGroups.set(key, [...(appGroups.get(key) ?? []), item]);
    }
  }
  const result: UserSandboxMigrationResult = {
    dryRun,
    completedLegacyCount,
    legacySkillCount: skillItems.length,
    migratedSkillCount: 0,
    legacyAppCount: Array.from(appGroups.values()).reduce((sum, group) => sum + group.length, 0),
    migratedAppCount: 0,
    appGroupCount: appGroups.size,
    completedAppGroupCount: 0,
    failedCount: 0,
    failures: []
  };
  await recordMigrationTrack({ runId, phase: 'started', dryRun });
  if (!dryRun) {
    const archiveCompleted = await archiveAllLegacySandboxes({ docs, result, runId });
    if (archiveCompleted) {
      const skillLimit = pLimit(SKILL_SANDBOX_MIGRATION_CONCURRENCY);
      const skillGroups = new Map<string, ResolvedLegacySkill[]>();
      for (const item of skillItems) {
        skillGroups.set(item.sourceId, [...(skillGroups.get(item.sourceId) ?? []), item]);
      }
      await Promise.all(
        Array.from(skillGroups.values(), (items) =>
          skillLimit(async () => {
            for (const item of items) {
              try {
                await migrateLegacySkill(item);
                result.migratedSkillCount += 1;
              } catch (error) {
                const errorText = getErrText(error);
                result.failures.push({ sandboxId: item.doc.sandboxId, error: errorText });
                await recordMigrationTrack({
                  runId,
                  phase: 'failure',
                  dryRun,
                  sandboxId: item.doc.sandboxId,
                  step: 'migrate_skill',
                  error: errorText
                });
              }
            }
          })
        )
      );

      const appSourceGroups = new Map<string, ResolvedLegacyApp[][]>();
      for (const group of appGroups.values()) {
        const sourceId = group[0]?.sourceId;
        if (!sourceId) continue;
        appSourceGroups.set(sourceId, [...(appSourceGroups.get(sourceId) ?? []), group]);
      }
      const appLimit = pLimit(APP_SANDBOX_MIGRATION_CONCURRENCY);
      await Promise.all(
        Array.from(appSourceGroups.values(), (groups) =>
          appLimit(async () => {
            for (const group of groups) await migrateAppGroup({ group, result, runId });
          })
        )
      );
    }
  }
  result.failedCount = result.failures.length;
  await recordMigrationTrack({
    runId,
    phase: 'completed',
    dryRun,
    successCount: result.migratedSkillCount + result.migratedAppCount,
    failureCount: result.failedCount,
    durationMs: Date.now() - startedAt
  });
  return result;
};

/** dry-run 只读；真实 migration 的 job lease 只防止重复管理员调度。 */
export async function migrateLegacySandboxesToUserLevel(
  params: UserSandboxMigrationParams = {}
): Promise<UserSandboxMigrationResult> {
  const runId = randomUUID();
  if (params.dryRun ?? true) return runLegacySandboxMigration(params, runId);
  return withLegacySandboxMigrationJobLease({
    label: 'user-level-sandbox-migration',
    fn: () => runLegacySandboxMigration(params, runId)
  });
}
