/**
 * Chat 级 Legacy Sandbox 到用户级 v2 Sandbox 的核心 migration。
 *
 * 旧表阶段是单条记录进度事实；目标 aggregate 的占用和发布由 Durable Saga 负责。
 */
import { createHash, randomUUID } from 'node:crypto';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxStatusEnum, generateSandboxId } from '@fastgpt/global/core/ai/sandbox/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { batchRun } from '@fastgpt/global/common/system/utils';
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import pLimit from 'p-limit';
import { pushTrack } from '../../../../common/middle/tracks/utils';
import { getS3SandboxSource } from '../../../../common/s3/sources/sandbox';
import {
  LegacySandboxInstanceZodSchema,
  MongoLegacySandboxInstance,
  type LegacySandboxInstanceSchemaType
} from '../infrastructure/instance/legacySchema';
import { findSandboxInstanceBySource } from '../infrastructure/instance/repository';
import {
  SandboxInstanceStatusEnum,
  SandboxMetadataSchema,
  SandboxProviderSchema,
  type SandboxMetadataType,
  type SandboxProviderType
} from '../type';
import { getConfiguredSandboxProvider } from '../infrastructure/provider/config';
import {
  buildRuntimeSandboxAdapter,
  buildSandboxResourceAdapter
} from '../infrastructure/provider/adapter';
import {
  disconnectSandbox,
  ensureConnectedSandboxRunning
} from '../infrastructure/provider/lifecycle';
import { getSandboxRuntimeProfile } from '../infrastructure/provider/runtimeProfile';
import { deleteSessionVolume, getSessionVolumeConfig } from '../infrastructure/volume/service';
import { getSandboxRuntimePaths, getSandboxSessionPathSegment, joinSandboxPath } from '../utils';
import {
  getSandboxWorkspaceArchiveForMigration,
  restoreSandboxWorkspaceArchiveForMigration
} from './archive';
import {
  deleteAppSandboxes as deleteCurrentAppSandboxes,
  deleteSkillEditSandboxes as deleteCurrentSkillSandboxes,
  settleActiveSandboxSagasBySource
} from './resource';
import { withLegacySandboxMigrationJobLease, withSandboxSourceMutationLease } from './lease';
import { assertSandboxSourceActive, assertSandboxSourceDeleted } from './sourceGuard';
import { getAgentSandboxArchiveMaxBytes } from '../interface/config';

const LEGACY_SKILL_VERSION_DIRECTORY_NAME_LENGTH = 24;
const MIGRATION_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
const APP_SANDBOX_MIGRATION_CONCURRENCY = 5;
const SKILL_SANDBOX_MIGRATION_CONCURRENCY = 20;

type UserSandboxMigrationParams = { dryRun?: boolean };
type LegacyMigrationPhase = 'pending' | 'archiveReady' | 'installed' | 'cleanupPending';
type LegacySandboxCleanupStep =
  | 'delete_sandbox'
  | 'delete_volume'
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

export type FrozenLegacyMigrationRecord = {
  recordId: string;
  sandboxId: string;
  chatId?: string;
};

export type FrozenLegacyMigrationGroup = {
  kind: 'app' | 'skill';
  sourceId: string;
  userId?: string;
  targetSandboxId: string;
  targetSagaId: string;
  manifestHash: string;
  provider: SandboxProviderType;
  targetMetadata: SandboxMetadataType;
  limit?: LegacySandboxInstanceSchemaType['limit'];
  records: FrozenLegacyMigrationRecord[];
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
  const previousPhase = getLegacyMigrationPhase(params.doc);
  const previousState = params.doc.metadata?.userLevelMigration;
  const state = {
    phase: params.phase,
    targetSandboxId: params.targetSandboxId,
    ...(previousState?.targetSagaId ? { targetSagaId: previousState.targetSagaId } : {}),
    ...(previousState?.manifestHash ? { manifestHash: previousState.manifestHash } : {}),
    ...(previousState?.recordIndex !== undefined ? { recordIndex: previousState.recordIndex } : {}),
    updatedAt: new Date()
  };
  const updated = await MongoLegacySandboxInstance.updateOne(
    {
      _id: params.doc._id,
      ...(previousPhase === 'pending'
        ? {
            $or: [
              { 'metadata.userLevelMigration': { $exists: false } },
              { 'metadata.userLevelMigration.phase': 'pending' }
            ]
          }
        : { 'metadata.userLevelMigration.phase': previousPhase }),
      ...(!previousState?.targetSandboxId
        ? {}
        : { 'metadata.userLevelMigration.targetSandboxId': previousState.targetSandboxId }),
      ...(!previousState?.targetSagaId
        ? {}
        : { 'metadata.userLevelMigration.targetSagaId': previousState.targetSagaId })
    },
    { $set: { 'metadata.userLevelMigration': state } }
  );
  if (updated.matchedCount !== 1) {
    throw new Error(
      `Legacy migration phase CAS failed for ${params.doc.sandboxId}: expected ${previousPhase}`
    );
  }
  params.doc.metadata = { ...(params.doc.metadata ?? {}), userLevelMigration: state };
};

const toV2Metadata = (metadata?: LegacySandboxInstanceSchemaType['metadata']) => {
  const {
    archive: _archive,
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

/** 把一条旧 Workspace 归档幂等安装到目标 Chat session。 */
export async function installLegacyWorkspaceArchive(params: {
  target: MigrationTarget;
  legacySandboxId: string;
  chatId: string;
  archiveBody: Buffer;
}) {
  const { target, legacySandboxId, chatId, archiveBody } = params;
  const { workspaceRoot } = target.getRuntimePaths();
  const sessionWorkDirectory = joinSandboxPath(
    joinSandboxPath(workspaceRoot, 'sessions'),
    getSandboxSessionPathSegment(chatId)
  );
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

  const result = await target.provider.execute(
    [
      'set -e',
      `source=${shellQuote(stagingDirectory)}`,
      `target=${shellQuote(sessionWorkDirectory)}`,
      'projects="$source/projects"',
      'if [ -d "$projects" ]; then',
      '  find "$projects" -mindepth 1 -maxdepth 1 -type d -exec sh -c \'',
      '    for dir; do',
      '      name=${dir##*/}',
      '      case "$name" in ""|*[!0-9a-fA-F]*) continue ;; esac',
      `      [ "\${#name}" -eq ${LEGACY_SKILL_VERSION_DIRECTORY_NAME_LENGTH} ] && rm -rf -- "$dir"`,
      '    done',
      "  ' sh {} +",
      'fi',
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

/** 按步骤清理一条 Legacy 资源；所有关键失败都向上抛出。 */
async function cleanupLegacyInstance(
  doc: LegacySandboxInstanceSchemaType,
  assertActive: () => Promise<void>
) {
  const runStep = async (step: LegacySandboxCleanupStep, fn: () => Promise<unknown>) => {
    try {
      await assertActive();
      await fn();
      await assertActive();
    } catch (error) {
      throw new LegacySandboxCleanupError(step, error);
    }
  };
  const resource = toLegacyResource(doc);
  await runStep('delete_sandbox', async () => {
    if (doc.metadata?.archive?.state === 'archived') return;
    await buildSandboxResourceAdapter(resource).delete();
  });
  if (resource.provider === 'opensandbox') {
    await runStep('delete_volume', () => deleteSessionVolume(resource.sandboxId));
  }
  await runStep('delete_archive', () =>
    getS3SandboxSource().deleteWorkspaceArchiveNow({ sandboxId: resource.sandboxId })
  );
  await runStep('delete_legacy_record', () =>
    MongoLegacySandboxInstance.deleteOne({ _id: doc._id })
  );
}

/** App 删除在 Source Lease 内同时清理 v2 和 Legacy 资源。 */
export async function deleteAppSandboxesForAppDeletion(appId: string): Promise<void> {
  await settleActiveSandboxSagasBySource({
    sourceType: ChatSourceTypeEnum.app,
    sourceId: appId
  });
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
        (doc) => cleanupLegacyInstance(doc, async () => assertValid()),
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
      await settleActiveSandboxSagasBySource({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId
      });
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
            (doc) => cleanupLegacyInstance(doc, async () => assertValid()),
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

/**
 * Executes one frozen Legacy group under an outer durable Saga. Dynamic record progress remains in
 * the Legacy documents, but every transition is fenced by targetSagaId, manifest and expected phase.
 */
export const runFrozenLegacyMigrationGroup = async (
  input: FrozenLegacyMigrationGroup,
  assertExecutionActive: () => Promise<void>
): Promise<{
  migratedCount: number;
  storage?: MigrationTarget['storage'];
  upstreamId: string;
}> => {
  if (new Set(input.records.map((record) => record.recordId)).size !== input.records.length) {
    throw new Error('Frozen Legacy migration manifest contains duplicate record IDs');
  }

  const rawDocs = await MongoLegacySandboxInstance.find({
    _id: { $in: input.records.map((record) => record.recordId) }
  }).lean();
  const parsedDocs = rawDocs.map((doc) => LegacySandboxInstanceZodSchema.parse(doc));
  const docsById = new Map(parsedDocs.map((doc) => [String(doc._id), doc]));
  const targetDoc = await findSandboxInstanceBySource({
    sourceType: input.kind === 'app' ? ChatSourceTypeEnum.app : ChatSourceTypeEnum.skillEdit,
    sourceId: input.sourceId,
    userId: input.kind === 'app' ? (input.userId ?? '') : ChatSourceTypeEnum.skillEdit
  });
  if (
    !targetDoc ||
    targetDoc.sandboxId !== input.targetSandboxId ||
    targetDoc.status !== SandboxInstanceStatusEnum.legacyMigrating ||
    targetDoc.metadata?.activeSaga?.sagaId !== input.targetSagaId
  ) {
    throw new Error('Frozen Legacy migration target is not owned by the active Saga');
  }

  const frozenDocs: LegacySandboxInstanceSchemaType[] = [];
  for (const [recordIndex, record] of input.records.entries()) {
    const doc = docsById.get(record.recordId);
    // Missing records were already removed by an earlier successful cleanup attempt.
    if (!doc) continue;
    if (doc.sandboxId !== record.sandboxId || doc.sourceId !== input.sourceId) {
      throw new Error(`Frozen Legacy record identity changed: ${record.recordId}`);
    }
    if (input.kind === 'app') {
      if (
        doc.sourceType !== ChatSourceTypeEnum.app ||
        doc.userId !== input.userId ||
        doc.chatId !== record.chatId
      ) {
        throw new Error(`Frozen Legacy App record changed grouping: ${record.recordId}`);
      }
    } else if (doc.sourceType !== ChatSourceTypeEnum.skillEdit) {
      throw new Error(`Frozen Legacy Skill record changed grouping: ${record.recordId}`);
    }
    if (doc.metadata?.archive?.state === 'failed') {
      throw new Error(`Legacy sandbox ${doc.sandboxId} archive is failed`);
    }

    const previous = doc.metadata?.userLevelMigration;
    if (previous?.targetSandboxId && previous.targetSandboxId !== input.targetSandboxId) {
      throw new Error(`Legacy record ${record.recordId} points to another target`);
    }
    if (previous?.targetSagaId && previous.targetSagaId !== input.targetSagaId) {
      throw new Error(`Legacy record ${record.recordId} is fenced by another Saga`);
    }
    if (previous?.manifestHash && previous.manifestHash !== input.manifestHash) {
      throw new Error(`Legacy record ${record.recordId} belongs to another frozen manifest`);
    }
    const state = {
      phase: previous?.phase ?? ('pending' as const),
      targetSandboxId: input.targetSandboxId,
      targetSagaId: input.targetSagaId,
      manifestHash: input.manifestHash,
      recordIndex,
      updatedAt: new Date()
    };
    const tagged = await MongoLegacySandboxInstance.updateOne(
      {
        _id: doc._id,
        $and: [
          {
            $or: [
              { 'metadata.userLevelMigration.targetSagaId': { $exists: false } },
              { 'metadata.userLevelMigration.targetSagaId': input.targetSagaId }
            ]
          },
          {
            $or: [
              { 'metadata.userLevelMigration.manifestHash': { $exists: false } },
              { 'metadata.userLevelMigration.manifestHash': input.manifestHash }
            ]
          }
        ]
      },
      { $set: { 'metadata.userLevelMigration': state } }
    );
    if (tagged.matchedCount !== 1) {
      throw new Error(`Failed to fence Legacy record ${record.recordId}`);
    }
    doc.metadata = { ...(doc.metadata ?? {}), userLevelMigration: state };
    frozenDocs.push(doc);
  }

  await assertExecutionActive();
  const target = await createMigrationTarget({
    provider: input.provider,
    sandboxId: input.targetSandboxId,
    sourceType: input.kind === 'app' ? ChatSourceTypeEnum.app : ChatSourceTypeEnum.skillEdit,
    chatId: input.records[0]?.chatId,
    limit: input.limit
  });
  try {
    for (const doc of frozenDocs) {
      let phase = getLegacyMigrationPhase(doc);
      let body: Buffer | undefined;
      if (phase === 'pending') {
        await assertExecutionActive();
        body = await getSandboxWorkspaceArchiveForMigration(toLegacyResource(doc));
        await assertExecutionActive();
        await setLegacyMigrationPhase({
          doc,
          phase: 'archiveReady',
          targetSandboxId: input.targetSandboxId
        });
        phase = 'archiveReady';
      }
      if (phase === 'archiveReady') {
        body ??= await getS3SandboxSource().downloadWorkspaceArchive({
          sandboxId: doc.sandboxId,
          maxBytes: getAgentSandboxArchiveMaxBytes()
        });
        await assertExecutionActive();
        if (input.kind === 'app') {
          if (doc.sourceType !== ChatSourceTypeEnum.app) {
            throw new Error('Frozen Legacy App manifest contains a Skill record');
          }
          await installLegacyWorkspaceArchive({
            target,
            legacySandboxId: doc.sandboxId,
            chatId: doc.chatId,
            archiveBody: body
          });
        } else {
          await restoreSandboxWorkspaceArchiveForMigration({
            sandbox: target.provider,
            workDirectory: target.getRuntimePaths().workspaceRoot,
            sandboxId: doc.sandboxId,
            archiveBody: body
          });
        }
        await assertExecutionActive();
        await setLegacyMigrationPhase({
          doc,
          phase: 'installed',
          targetSandboxId: input.targetSandboxId
        });
        phase = 'installed';
      }
      if (phase !== 'installed' && phase !== 'cleanupPending') {
        throw new Error(`Legacy record cannot be cleaned from phase ${phase}`);
      }
    }

    for (const doc of frozenDocs) {
      if (getLegacyMigrationPhase(doc) === 'installed') {
        await setLegacyMigrationPhase({
          doc,
          phase: 'cleanupPending',
          targetSandboxId: input.targetSandboxId
        });
      }
      await cleanupLegacyInstance(doc, assertExecutionActive);
    }
    const upstreamId = target.provider.id;
    if (!upstreamId) {
      throw new Error('Legacy migration Provider did not return an upstream ID');
    }
    return {
      migratedCount: input.records.length,
      storage: target.storage,
      upstreamId
    };
  } finally {
    await disconnectSandbox(target.provider).catch(() => undefined);
  }
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
  const skillItems: ResolvedLegacySkill[] = [];
  const appGroups = new Map<string, ResolvedLegacyApp[]>();
  for (const doc of docs) {
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
    const provider = getConfiguredSandboxProvider();
    const createFrozenInput = (params: {
      kind: 'app' | 'skill';
      sourceId: string;
      userId?: string;
      targetSandboxId: string;
      legacyMetadata: LegacySandboxInstanceSchemaType['metadata'];
      limit?: LegacySandboxInstanceSchemaType['limit'];
      records: FrozenLegacyMigrationRecord[];
    }): FrozenLegacyMigrationGroup => {
      const targetMetadata = getMigrationTargetMetadata(params.legacyMetadata, provider);
      const manifestHash = createHash('sha256')
        .update(
          JSON.stringify({
            kind: params.kind,
            sourceId: params.sourceId,
            userId: params.userId,
            targetSandboxId: params.targetSandboxId,
            provider,
            targetMetadata,
            limit: params.limit,
            records: params.records
          })
        )
        .digest('hex');
      return {
        kind: params.kind,
        sourceId: params.sourceId,
        userId: params.userId,
        targetSandboxId: params.targetSandboxId,
        records: params.records,
        provider,
        targetMetadata,
        limit: params.limit,
        manifestHash,
        targetSagaId: `sandbox-legacy-migration-${manifestHash}`
      };
    };

    const dispatch = async (input: FrozenLegacyMigrationGroup) => {
      const { migrateFrozenLegacyGroupWithSaga } = await import('./lifecycle/service');
      return migrateFrozenLegacyGroupWithSaga(input);
    };

    const skillGroups = new Map<string, ResolvedLegacySkill[]>();
    for (const item of skillItems) {
      skillGroups.set(item.sourceId, [...(skillGroups.get(item.sourceId) ?? []), item]);
    }
    const skillLimit = pLimit(SKILL_SANDBOX_MIGRATION_CONCURRENCY);
    await Promise.all(
      Array.from(skillGroups.values(), (items) =>
        skillLimit(async () => {
          const first = items[0];
          const targetSandboxId = generateSandboxId({
            sourceType: ChatSourceTypeEnum.skillEdit,
            sourceId: first.sourceId,
            userId: ChatSourceTypeEnum.skillEdit
          });
          const input = createFrozenInput({
            kind: 'skill',
            sourceId: first.sourceId,
            targetSandboxId,
            legacyMetadata: first.doc.metadata,
            limit: first.doc.limit,
            records: items.map((item) => ({
              recordId: String(item.doc._id),
              sandboxId: item.doc.sandboxId
            }))
          });
          try {
            const migrated = await dispatch(input);
            if (migrated.completed) result.migratedSkillCount += migrated.migratedCount;
            else {
              result.failures.push({
                sandboxId: first.doc.sandboxId,
                error: 'Durable Legacy Skill migration is pending retry'
              });
            }
          } catch (error) {
            for (const item of items) {
              result.failures.push({
                sandboxId: item.doc.sandboxId,
                error: getErrText(error)
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
            const first = group[0];
            const targetSandboxId = generateSandboxId({
              sourceType: ChatSourceTypeEnum.app,
              sourceId: first.sourceId,
              userId: first.userId
            });
            const input = createFrozenInput({
              kind: 'app',
              sourceId: first.sourceId,
              userId: first.userId,
              targetSandboxId,
              legacyMetadata: first.doc.metadata,
              limit: first.doc.limit,
              records: group.map((item) => ({
                recordId: String(item.doc._id),
                sandboxId: item.doc.sandboxId,
                chatId: item.chatId
              }))
            });
            try {
              const migrated = await dispatch(input);
              if (migrated.completed) {
                result.migratedAppCount += migrated.migratedCount;
                result.completedAppGroupCount += 1;
              } else {
                for (const item of group) {
                  failedLegacyApps.set(String(item.doc._id), item.doc);
                }
                result.failures.push({
                  sandboxId: first.doc.sandboxId,
                  error: 'Durable Legacy App migration is pending retry'
                });
              }
            } catch (error) {
              for (const item of group) {
                failedLegacyApps.set(String(item.doc._id), item.doc);
              }
              result.failures.push({
                sandboxId: first.doc.sandboxId,
                error: getErrText(error)
              });
            }
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
