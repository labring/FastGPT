/**
 * Chat 级 Legacy Sandbox 到用户级 v2 Sandbox 的核心 migration。
 *
 * 旧表阶段是迁移进度事实；v2 目标通过 legacyMigrating operation 建立发布屏障。
 */
import { createHash, randomUUID } from 'node:crypto';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxStatusEnum, generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { batchRun } from '@fastgpt/global/common/system/utils';
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import pLimit from 'p-limit';
import { subMinutes } from 'date-fns';
import { pushTrack } from '../../../../common/middle/tracks/utils';
import { getS3SandboxSource } from '../../../../common/s3/sources/sandbox';
import {
  LegacySandboxInstanceZodSchema,
  MongoLegacySandboxInstance,
  type LegacySandboxInstanceSchemaType
} from '../infrastructure/instance/legacySchema';
import {
  advanceSandboxOperation,
  claimAppSandboxMigrationTarget,
  claimSkillSandboxMigrationTarget,
  completeSandboxOperation,
  findSandboxInstanceBySource,
  markSandboxOperationFailed
} from '../infrastructure/instance/repository';
import { SandboxInstanceStatusEnum, SandboxMetadataSchema, SandboxProviderSchema } from '../type';
import { getConfiguredSandboxProvider } from '../infrastructure/provider/config';
import {
  buildRuntimeSandboxAdapter,
  buildSandboxResourceAdapter
} from '../infrastructure/provider/adapter';
import { ensureConnectedSandboxRunning } from '../infrastructure/provider/lifecycle';
import { getSandboxRuntimeProfile } from '../infrastructure/provider/runtimeProfile';
import { deleteSessionVolume, getSessionVolumeConfig } from '../infrastructure/volume/service';
import { getSandboxRuntimePaths, getSandboxSessionPathSegment, joinSandboxPath } from '../utils';
import {
  SANDBOX_STALE_ARCHIVING_MINUTES,
  getSandboxWorkspaceArchiveForMigration,
  restoreArchivedSandboxBeforeUse,
  restoreSandboxWorkspaceArchiveForMigration
} from './archive';
import {
  deleteAppSandboxes as deleteCurrentAppSandboxes,
  deleteSkillEditSandboxes as deleteCurrentSkillSandboxes
} from './resource';
import {
  withLegacySandboxMigrationJobLease,
  withSandboxLifecycleLease,
  withSandboxSourceMutationLease
} from './lease';
import { assertSandboxSourceActive, assertSandboxSourceDeleted } from './sourceGuard';
import { getAgentSandboxArchiveMaxBytes } from '../interface/config';

const LEGACY_SKILL_VERSION_DIRECTORY_NAME_LENGTH = 24;
const MIGRATION_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const APP_SANDBOX_MIGRATION_CONCURRENCY = 5;
const SKILL_SANDBOX_MIGRATION_CONCURRENCY = 20;

type UserSandboxMigrationParams = { dryRun?: boolean };
type LegacyMigrationPhase =
  | 'pending'
  | 'archiveReady'
  | 'installed'
  | 'cleanupPending'
  | 'completed';
type LegacySandboxCleanupStep =
  | 'delete_sandbox'
  | 'delete_volume'
  | 'verify_archive'
  | 'complete_legacy_record'
  | 'delete_archive'
  | 'delete_legacy_record';
type UserSandboxMigrationTrackData = Parameters<typeof pushTrack.userSandboxMigration>[0];

type ResolvedLegacySkill = { doc: LegacySandboxInstanceSchemaType; sourceId: string };
type ResolvedLegacyApp = {
  doc: LegacySandboxInstanceSchemaType;
  sourceId: string;
  userId: string;
  chatId: string;
};

type MigrationTarget = {
  provider: ISandbox;
  getRuntimePaths: () => ReturnType<typeof getSandboxRuntimePaths>;
  storage?: NonNullable<Awaited<ReturnType<typeof getSessionVolumeConfig>>>['storage'];
};

class LegacySandboxCleanupError extends Error {
  constructor(
    readonly step: LegacySandboxCleanupStep,
    error: unknown
  ) {
    super(getErrText(error));
    this.name = 'LegacySandboxCleanupError';
  }
}

export type UserSandboxMigrationFailure = { sandboxId: string; error: string };
export type UserSandboxMigrationResult = {
  dryRun: boolean;
  completedLegacyCount: number;
  legacySkillCount: number;
  migratedSkillCount: number;
  legacyAppCount: number;
  migratedAppCount: number;
  appGroupCount: number;
  completedAppGroupCount: number;
  failedCount: number;
  failures: UserSandboxMigrationFailure[];
};

const recordMigrationTrack = async (data: UserSandboxMigrationTrackData) => {
  await Promise.resolve(pushTrack.userSandboxMigration(data)).catch(() => undefined);
};

/** 在产生任何迁移副作用前校验整张 Legacy 表。 */
const parseLegacySandboxInstances = (rawDocs: unknown[]): LegacySandboxInstanceSchemaType[] => {
  const parsedDocs: LegacySandboxInstanceSchemaType[] = [];
  const failures: string[] = [];
  for (const rawDoc of rawDocs) {
    const parsed = LegacySandboxInstanceZodSchema.safeParse(rawDoc);
    if (parsed.success) {
      parsedDocs.push(parsed.data);
      continue;
    }
    const doc = rawDoc && typeof rawDoc === 'object' ? (rawDoc as Record<string, unknown>) : {};
    failures.push(
      `_id=${String(doc._id ?? 'unknown')}, sandboxId=${String(doc.sandboxId ?? 'unknown')} [${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('; ')}]`
    );
  }
  if (failures.length) {
    throw new Error(
      [
        `Legacy Sandbox preflight validation failed for ${failures.length} record(s)`,
        ...failures
      ].join('\n')
    );
  }
  return parsedDocs;
};

const getLegacyMigrationPhase = (doc: LegacySandboxInstanceSchemaType): LegacyMigrationPhase =>
  doc.metadata?.userLevelMigration?.phase ?? 'pending';

/** 持久化单条 Legacy 迁移阶段，目录存在不能替代这个提交。 */
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
  await MongoLegacySandboxInstance.updateOne(
    { _id: params.doc._id },
    { $set: { 'metadata.userLevelMigration': state } }
  );
  params.doc.metadata = { ...(params.doc.metadata ?? {}), userLevelMigration: state };
};

const toV2Metadata = (metadata?: LegacySandboxInstanceSchemaType['metadata']) => {
  const {
    archive: _archive,
    migration: _migration,
    provider: _provider,
    skillId: _skillId,
    userLevelMigration: _userLevelMigration,
    ...stableMetadata
  } = metadata ?? {};
  return SandboxMetadataSchema.parse(stableMetadata);
};

/** migration 创建了当前 provider 的新物理资源，v2 metadata 必须记录对应运行时镜像。 */
const getMigrationTargetMetadata = (
  metadata: LegacySandboxInstanceSchemaType['metadata'],
  provider: ReturnType<typeof SandboxProviderSchema.parse>
) => {
  const stableMetadata = toV2Metadata(metadata);
  const image = getSandboxRuntimeProfile(provider).defaultImage;
  return SandboxMetadataSchema.parse({
    ...stableMetadata,
    ...(image ? { image } : {})
  });
};

const toLegacyResource = (doc: LegacySandboxInstanceSchemaType) => ({
  provider: SandboxProviderSchema.parse(doc.provider),
  sandboxId: doc.sandboxId,
  status: doc.status ?? SandboxStatusEnum.stopped,
  lastActiveAt: doc.lastActiveAt ?? new Date(0),
  metadata: doc.metadata
});

const isStableSandboxStatus = (status?: string) =>
  status === SandboxInstanceStatusEnum.running ||
  status === SandboxInstanceStatusEnum.stopped ||
  status === SandboxInstanceStatusEnum.archived;

/** 创建 migration 专用 target，不经过普通 runtime client。 */
const createMigrationTarget = async (params: {
  provider: ReturnType<typeof SandboxProviderSchema.parse>;
  sandboxId: string;
  sourceType: ChatSourceTypeEnum.app | ChatSourceTypeEnum.skillEdit;
  chatId?: string;
  limit?: LegacySandboxInstanceSchemaType['limit'];
}) => {
  const vmConfig =
    params.provider === 'opensandbox' ? await getSessionVolumeConfig(params.sandboxId) : undefined;
  const provider = buildRuntimeSandboxAdapter(params.provider, params.sandboxId, {
    vmConfig,
    resourceLimits: params.limit
  });
  await ensureConnectedSandboxRunning(provider);
  const runtimePaths = getSandboxRuntimePaths({
    sourceType: params.sourceType,
    workDirectory: getSandboxRuntimeProfile(params.provider).workDirectory,
    chatId: params.chatId
  });
  return {
    provider,
    getRuntimePaths: () => runtimePaths,
    storage: vmConfig?.storage
  } satisfies MigrationTarget;
};

/**
 * 把 Legacy Workspace 从 staging 合并到目标目录。
 *
 * 目标现有文件始终优先；Legacy 只补充缺失文件，避免升级后已经产生的新内容被旧归档覆盖。
 */
async function mergeLegacyWorkspaceArchive(params: {
  target: MigrationTarget;
  legacySandboxId: string;
  archiveBody: Buffer;
  targetDirectory: string;
  removeAppRuntimeSkillCaches: boolean;
}) {
  const { target, legacySandboxId, archiveBody, targetDirectory } = params;
  const { workspaceRoot } = target.getRuntimePaths();
  const stagingName = createHash('sha256').update(legacySandboxId).digest('hex').slice(0, 40);
  const stagingDirectory = joinSandboxPath(
    joinSandboxPath(workspaceRoot, '.migration'),
    stagingName
  );
  await restoreSandboxWorkspaceArchiveForMigration({
    sandbox: target.provider,
    workDirectory: stagingDirectory,
    sandboxId: legacySandboxId,
    archiveBody
  });

  const removeRuntimeSkillCacheCommands = params.removeAppRuntimeSkillCaches
    ? [
        'projects="$source/projects"',
        'if [ -d "$projects" ]; then',
        '  find "$projects" -mindepth 1 -maxdepth 1 -type d -exec sh -c \'',
        '    for dir; do',
        '      name=${dir##*/}',
        '      case "$name" in ""|*[!0-9a-fA-F]*) continue ;; esac',
        `      [ "\${#name}" -eq ${LEGACY_SKILL_VERSION_DIRECTORY_NAME_LENGTH} ] && rm -rf -- "$dir"`,
        '    done',
        "  ' sh {} +",
        'fi'
      ]
    : [];
  const result = await target.provider.execute(
    [
      'set -e',
      `source=${shellQuote(stagingDirectory)}`,
      `target=${shellQuote(targetDirectory)}`,
      ...removeRuntimeSkillCacheCommands,
      'merge_without_overwrite() {',
      '  source_root=$1; target_root=$2',
      '  for source_path in "$source_root"/* "$source_root"/.[!.]* "$source_root"/..?*; do',
      '    [ -e "$source_path" ] || [ -L "$source_path" ] || continue',
      '    name=${source_path##*/}; target_path="$target_root/$name"',
      '    if [ ! -e "$target_path" ] && [ ! -L "$target_path" ]; then',
      '      mv -- "$source_path" "$target_path"',
      '    elif [ -d "$source_path" ] && [ ! -L "$source_path" ] && [ -d "$target_path" ] && [ ! -L "$target_path" ]; then',
      '      merge_without_overwrite "$source_path" "$target_path"',
      '    fi',
      '  done',
      '}',
      'if [ -d "$target" ]; then',
      '  merge_without_overwrite "$source" "$target"; rm -rf -- "$source"; exit 0',
      'fi',
      'if [ -e "$target" ]; then echo "Migration target exists but is not a directory" >&2; exit 1; fi',
      'mkdir -p "$(dirname "$target")"',
      'mv -- "$source" "$target"',
      'test -d "$target"'
    ].join('\n'),
    { timeoutMs: MIGRATION_COMMAND_TIMEOUT_MS, maxOutputBytes: 8 * 1024 }
  );
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || 'Failed to commit workspace');
  }
}

/** 把一条旧 App Workspace 归档幂等安装到目标 Chat session。 */
export async function installLegacyWorkspaceArchive(params: {
  target: MigrationTarget;
  legacySandboxId: string;
  chatId: string;
  archiveBody: Buffer;
}) {
  const { workspaceRoot } = params.target.getRuntimePaths();
  return mergeLegacyWorkspaceArchive({
    target: params.target,
    legacySandboxId: params.legacySandboxId,
    archiveBody: params.archiveBody,
    targetDirectory: joinSandboxPath(
      joinSandboxPath(workspaceRoot, 'sessions'),
      getSandboxSessionPathSegment(params.chatId)
    ),
    removeAppRuntimeSkillCaches: true
  });
}

/** 把旧 Skill Workspace 合并到编辑目标，保留升级后已经产生的文件。 */
const installLegacySkillWorkspaceArchive = (params: {
  target: MigrationTarget;
  legacySandboxId: string;
  archiveBody: Buffer;
}) =>
  mergeLegacyWorkspaceArchive({
    ...params,
    targetDirectory: params.target.getRuntimePaths().workspaceRoot,
    removeAppRuntimeSkillCaches: false
  });

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
async function deleteLegacyPhysicalResources(
  doc: LegacySandboxInstanceSchemaType,
  assertLeaseValid: () => void
) {
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

/** 完成迁移后的旧资源退休，保留可追溯的 Mongo 记录和 Legacy S3 归档。 */
async function retainLegacyInstanceAfterMigration(params: {
  doc: LegacySandboxInstanceSchemaType;
  targetSandboxId: string;
  assertLeaseValid: () => void;
}) {
  const { doc, targetSandboxId, assertLeaseValid } = params;
  await deleteLegacyPhysicalResources(doc, assertLeaseValid);
  await runLegacyCleanupStep({
    step: 'verify_archive',
    assertLeaseValid,
    fn: async () => {
      const exists = await getS3SandboxSource().isLegacyWorkspaceArchiveExists({
        sandboxId: doc.sandboxId
      });
      if (!exists) throw new Error(`Legacy Sandbox workspace archive is missing: ${doc.sandboxId}`);
    }
  });
  await runLegacyCleanupStep({
    step: 'complete_legacy_record',
    assertLeaseValid,
    fn: async () => {
      const now = new Date();
      const archive = {
        state: 'archived' as const,
        ...(doc.metadata?.archive?.startedAt ? { startedAt: doc.metadata.archive.startedAt } : {}),
        archivedAt: doc.metadata?.archive?.archivedAt ?? now
      };
      const userLevelMigration = {
        phase: 'completed' as const,
        targetSandboxId,
        updatedAt: now
      };
      await MongoLegacySandboxInstance.updateOne(
        { _id: doc._id },
        {
          $set: {
            status: SandboxStatusEnum.stopped,
            'metadata.archive': archive,
            'metadata.userLevelMigration': userLevelMigration
          }
        }
      );
      doc.status = SandboxStatusEnum.stopped;
      doc.metadata = { ...(doc.metadata ?? {}), archive, userLevelMigration };
    }
  });
}

/** Source 删除时最终清理保留的 Legacy 归档和 Mongo 记录。 */
async function cleanupLegacyInstanceForSourceDeletion(
  doc: LegacySandboxInstanceSchemaType,
  assertLeaseValid: () => void
) {
  await deleteLegacyPhysicalResources(doc, assertLeaseValid);
  await runLegacyCleanupStep({
    step: 'delete_archive',
    assertLeaseValid,
    fn: () => getS3SandboxSource().deleteLegacyWorkspaceArchiveNow({ sandboxId: doc.sandboxId })
  });
  await runLegacyCleanupStep({
    step: 'delete_legacy_record',
    assertLeaseValid,
    fn: () => MongoLegacySandboxInstance.deleteOne({ _id: doc._id })
  });
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
      const legacy = await MongoLegacySandboxInstance.find({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId
      }).lean<LegacySandboxInstanceSchemaType[]>();
      await batchRun(
        legacy,
        (doc) => cleanupLegacyInstanceForSourceDeletion(doc, assertValid),
        APP_SANDBOX_MIGRATION_CONCURRENCY,
        {
          waitForAll: true
        }
      );
    }
  });
}

/** Skill 删除按 source 串行清理 v2 和 Legacy 资源。 */
export async function deleteSkillEditSandboxesForSkillDeletion(skillIds: string[]) {
  await batchRun(
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
          const legacy = await MongoLegacySandboxInstance.find({
            sourceType: ChatSourceTypeEnum.skillEdit,
            sourceId: skillId
          }).lean<LegacySandboxInstanceSchemaType[]>();
          await batchRun(
            legacy,
            (doc) => cleanupLegacyInstanceForSourceDeletion(doc, assertValid),
            10,
            {
              waitForAll: true
            }
          );
        }
      });
    },
    10,
    { waitForAll: true }
  );
}

/** 把 Legacy Skill Workspace 搬到使用新确定性 ID 的物理 Sandbox。 */
const migrateLegacySkill = async (item: ResolvedLegacySkill) => {
  const targetSandboxId = generateSandboxId({
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: item.sourceId,
    userId: ChatSourceTypeEnum.skillEdit
  });

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

      const archiveState = item.doc.metadata?.archive?.state;
      if (archiveState === 'failed') {
        throw new Error(`Legacy Skill sandbox ${item.doc.sandboxId} archive is failed`);
      }
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
      const cleanupOnly = targetIsStable && (phase === 'installed' || phase === 'cleanupPending');

      if ((phase === 'installed' || phase === 'cleanupPending') && !existing) {
        throw new Error('Published Skill migration target is missing before Legacy cleanup');
      }
      if (phase === 'cleanupPending' && !targetIsStable) {
        throw new Error(`Published Skill migration target is still ${existing?.status}`);
      }
      if (
        !cleanupOnly &&
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

      if (!cleanupOnly) {
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

              let body: Buffer | undefined;
              if (phase === 'pending') {
                assertLeasesValid();
                body = await getSandboxWorkspaceArchiveForMigration(toLegacyResource(item.doc));
                assertLeasesValid();
                await setLegacyMigrationPhase({
                  doc: item.doc,
                  phase: 'archiveReady',
                  targetSandboxId
                });
                phase = 'archiveReady';
              }
              if (phase === 'archiveReady') {
                assertLeasesValid();
                body ??= await getS3SandboxSource().downloadLegacyWorkspaceArchive({
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

      if (phase === 'installed') {
        await setLegacyMigrationPhase({
          doc: item.doc,
          phase: 'cleanupPending',
          targetSandboxId
        });
      }
      await retainLegacyInstanceAfterMigration({
        doc: item.doc,
        targetSandboxId,
        assertLeaseValid: sourceLease.assertValid
      });
    }
  });
};

const migrateAppGroup = async (params: {
  group: ResolvedLegacyApp[];
  result: UserSandboxMigrationResult;
  runId: string;
  failedLegacyApps: Map<string, LegacySandboxInstanceSchemaType>;
}) => {
  const { group, result, runId, failedLegacyApps } = params;
  const first = group[0];
  const targetSandboxId = generateSandboxId({
    sourceType: ChatSourceTypeEnum.app,
    sourceId: first.sourceId,
    userId: first.userId
  });

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
      const cleanupOnly = phases.every(
        (phase) => phase === 'installed' || phase === 'cleanupPending'
      );
      const targetIsStable = isStableSandboxStatus(existing?.status);
      if (cleanupOnly && !existing) {
        throw new Error('Published migration target is missing before Legacy cleanup');
      }
      if (cleanupOnly && existing && !targetIsStable) {
        throw new Error(`Published migration target is still ${existing.status}`);
      }
      if (
        !cleanupOnly &&
        existing &&
        (existing.status === SandboxInstanceStatusEnum.archived ||
          existing.status === SandboxInstanceStatusEnum.restoring)
      ) {
        // 仅 ensureRunning 会得到空资源；先走正式 restore 状态机恢复 v2 自身归档，
        // 再由 migration 以目标内容优先的规则合并 Legacy Workspace。
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
      if (!cleanupOnly) {
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
                let phase = getLegacyMigrationPhase(item.doc);
                let body: Buffer | undefined;
                if (phase === 'pending') {
                  assertLeasesValid();
                  body = await getSandboxWorkspaceArchiveForMigration(toLegacyResource(item.doc));
                  assertLeasesValid();
                  await setLegacyMigrationPhase({
                    doc: item.doc,
                    phase: 'archiveReady',
                    targetSandboxId
                  });
                  phase = 'archiveReady';
                }
                if (phase === 'archiveReady') {
                  assertLeasesValid();
                  body ??= await getS3SandboxSource().downloadLegacyWorkspaceArchive({
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
          throw new Error(`Legacy record cannot be cleaned from phase ${phase}`);
        }
        if (phase === 'installed') {
          sourceLease.assertValid();
          await setLegacyMigrationPhase({
            doc: item.doc,
            phase: 'cleanupPending',
            targetSandboxId
          });
        }
        await retainLegacyInstanceAfterMigration({
          doc: item.doc,
          targetSandboxId,
          assertLeaseValid: sourceLease.assertValid
        });
        result.migratedAppCount += 1;
      }
    }
  }).catch(async (error) => {
    const errorText = getErrText(error);
    for (const item of group) {
      failedLegacyApps.set(String(item.doc._id), item.doc);
    }
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

/** 真实迁移结束后暂停失败且仍存在的 Legacy App Sandbox，避免继续产生资源成本。 */
async function stopFailedLegacyAppSandboxes(params: {
  docs: LegacySandboxInstanceSchemaType[];
  runId: string;
}) {
  await batchRun(
    params.docs,
    async (doc) => {
      const current = await MongoLegacySandboxInstance.findById(doc._id).lean();
      if (!current) return;

      const parsed = LegacySandboxInstanceZodSchema.parse(current);
      try {
        if (
          parsed.status === SandboxStatusEnum.running &&
          parsed.metadata?.archive?.state !== 'archived'
        ) {
          await buildSandboxResourceAdapter(toLegacyResource(parsed)).stop();
        }
        await MongoLegacySandboxInstance.updateOne(
          { _id: parsed._id },
          { $set: { status: SandboxStatusEnum.stopped } }
        );
      } catch (error) {
        await recordMigrationTrack({
          runId: params.runId,
          phase: 'failure',
          dryRun: false,
          sandboxId: parsed.sandboxId,
          step: 'stop_failed_legacy',
          error: getErrText(error)
        });
      }
    },
    APP_SANDBOX_MIGRATION_CONCURRENCY,
    { waitForAll: true }
  );
}

/** 执行 Legacy Sandbox 到用户级 Sandbox 的管理员 migration。 */
const runLegacySandboxMigration = async (
  params: UserSandboxMigrationParams,
  runId: string
): Promise<UserSandboxMigrationResult> => {
  const dryRun = params.dryRun ?? true;
  const startedAt = Date.now();
  const raw = await MongoLegacySandboxInstance.collection
    .find({})
    .sort({ lastActiveAt: -1, _id: 1 })
    .toArray();
  const docs = parseLegacySandboxInstances(raw);
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
    const failedLegacyApps = new Map<string, LegacySandboxInstanceSchemaType>();
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
          for (const group of groups) {
            await migrateAppGroup({ group, result, runId, failedLegacyApps });
          }
        })
      )
    );
    await stopFailedLegacyAppSandboxes({
      docs: Array.from(failedLegacyApps.values()),
      runId
    });
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
