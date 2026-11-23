import { randomUUID } from 'node:crypto';
import type { RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import {
  buildSandboxArchiveObjectKey,
  getS3SandboxSource
} from '@fastgpt/service/common/s3/sources/sandbox';
import {
  assertSandboxSourceActive,
  SandboxSourceMissingError
} from '@fastgpt/service/core/ai/sandbox/application/sourceGuard';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import {
  type getLegacySandboxInstanceCollection,
  MongoSandboxInstance
} from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { LEGACY_DEVBOX_PROVIDER } from '@fastgpt/service/core/ai/sandbox/legacy';
import {
  SANDBOX_PROVIDER,
  type SandboxArchiveInfoType,
  type SandboxInstanceStatusType,
  type SandboxResourceLimitsType,
  type SandboxSourceType,
  type SandboxStorageType
} from '@fastgpt/service/core/ai/sandbox/type';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';

type LegacySandboxProviderType = typeof SANDBOX_PROVIDER | typeof LEGACY_DEVBOX_PROVIDER;

export type SandboxMigrationDoc = {
  _id: Types.ObjectId;
  sandboxId: string;
  sourceType: SandboxSourceType;
  sourceId: string;
  userId: string;
  teamId?: string | null;
  provider: LegacySandboxProviderType;
  status: SandboxInstanceStatusType;
  createdAt?: Date;
  lastActiveAt?: Date;
  limit?: SandboxResourceLimitsType | null;
  versionId?: string | null;
  storage?: SandboxStorageType | null;
  operation?: {
    type?: string;
    phase?: string;
    previousStatus?: string;
  } & Record<string, unknown>;
};

export type SandboxCursorStageState = {
  lastId: string | null;
  done: boolean;
};

type SandboxMigrationCollection = ReturnType<typeof getLegacySandboxInstanceCollection>;
type SandboxDocFilter = NonNullable<Parameters<SandboxMigrationCollection['find']>[0]>;

export const SANDBOX_MIGRATION_PROJECTION = {
  _id: 1,
  sandboxId: 1,
  sourceType: 1,
  sourceId: 1,
  userId: 1,
  teamId: 1,
  provider: 1,
  status: 1,
  createdAt: 1,
  lastActiveAt: 1,
  limit: 1,
  versionId: 1,
  storage: 1,
  operation: 1
} as const;

/** 判断 4.17.x Devbox 记录是否应以已有 S3 `package.zip` 为权威源（`archived`/`restoring` 或已越过上传阶段的 `archiving`）。 */
export const isDevboxArchiveAuthoritative = (
  doc: Pick<SandboxMigrationDoc, 'status' | 'operation'>
): boolean =>
  doc.status === SandboxInstanceStatusEnum.archived ||
  doc.status === SandboxInstanceStatusEnum.restoring ||
  (doc.status === SandboxInstanceStatusEnum.archiving &&
    (doc.operation?.type !== 'archive' || doc.operation?.phase !== 'claimed'));

/** 判断旧版 `v2` OpenSandbox 记录是否应以历史 S3 `package.zip` 为权威源（非可回滚活跃归档态）。 */
export const isLegacyOpenSandboxArchiveAuthoritative = (
  doc: Pick<SandboxMigrationDoc, 'status' | 'storage' | 'operation'>
): boolean =>
  doc.status === SandboxInstanceStatusEnum.archived ||
  doc.status === SandboxInstanceStatusEnum.restoring ||
  (doc.status === SandboxInstanceStatusEnum.archiving &&
    (!doc.storage?.volumes?.length ||
      doc.operation?.type !== 'archive' ||
      doc.operation?.phase !== 'claimed'));

/** 检查 `v3` 集合是否已存在对应逻辑实例（任意唯一键命中即视为已迁移，避免重复写入或覆盖在线状态）。 */
export const hasMigratedV3Record = async (
  doc: Pick<SandboxMigrationDoc, 'sourceType' | 'sourceId' | 'userId' | 'sandboxId'>
): Promise<boolean> => {
  const existing = await MongoSandboxInstance.collection.findOne(
    {
      $or: [
        { sourceType: doc.sourceType, sourceId: doc.sourceId, userId: doc.userId },
        { provider: SANDBOX_PROVIDER, sandboxId: doc.sandboxId }
      ]
    },
    { projection: { _id: 1 } }
  );
  return Boolean(existing);
};

/** 校验 Sandbox 归属的 App / Skill 是否仍处于未删除活跃状态，并按单轮缓存避免重复查库。 */
export const isSandboxSourceActive = async (
  doc: Pick<SandboxMigrationDoc, 'sourceType' | 'sourceId'>,
  activeSourceCache?: Map<string, boolean>
): Promise<boolean> => {
  const cacheKey = `${doc.sourceType}:${doc.sourceId}`;
  const cached = activeSourceCache?.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    await assertSandboxSourceActive({
      sourceType: doc.sourceType,
      sourceId: doc.sourceId
    });
    activeSourceCache?.set(cacheKey, true);
    return true;
  } catch (error) {
    if (error instanceof SandboxSourceMissingError) {
      activeSourceCache?.set(cacheKey, false);
      return false;
    }
    throw error;
  }
};

/** 脱敏并截断迁移失败日志文本，避免在 checkpoint/failure 记录中泄露 Token 或内网地址。 */
export const sanitizeMigrationFailureMessage = (
  error: unknown,
  fallbackMessage = 'Sandbox migration failed'
): string => {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const cleaned = raw
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/https?:\/\/[^\s]+/gi, '[URL]')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallbackMessage).slice(0, 240);
};

/** `v2` 中所有可迁移沙盒的通用过滤条件（`deleting` 墓碑行由迁移跳过，交由清理任务回收）。 */
export const LEGACY_MIGRATABLE_SANDBOX_FILTER: SandboxDocFilter = {
  status: { $ne: SandboxInstanceStatusEnum.deleting }
};

/** `v2` `runningDevbox` 阶段过滤条件。 */
export const LEGACY_RUNNING_DEVBOX_FILTER: SandboxDocFilter = {
  provider: LEGACY_DEVBOX_PROVIDER,
  status: SandboxInstanceStatusEnum.running
};

/** `v2` `stoppedDevbox` 阶段过滤条件（包含 `stopped`、`stopping`、`provisioning`、`archiving`、`restoring`，排除 `deleting`）。 */
export const LEGACY_STOPPED_DEVBOX_FILTER: SandboxDocFilter = {
  provider: LEGACY_DEVBOX_PROVIDER,
  status: {
    $nin: [
      SandboxInstanceStatusEnum.running,
      SandboxInstanceStatusEnum.archived,
      SandboxInstanceStatusEnum.deleting
    ]
  }
};

/** `v2` `legacyArchives` 阶段过滤条件（已归档 Devbox 及所有非 `deleting` 存量 OpenSandbox 记录）。 */
export const LEGACY_ARCHIVE_MIGRATION_FILTER: SandboxDocFilter = {
  $or: [
    {
      provider: LEGACY_DEVBOX_PROVIDER,
      status: SandboxInstanceStatusEnum.archived
    },
    {
      provider: SANDBOX_PROVIDER,
      status: { $ne: SandboxInstanceStatusEnum.deleting }
    }
  ]
};

/** 构造 `.tar.zst` 归档元数据对象，统一迁移任务对归档键和格式的写入约定。 */
export const buildTarZstArchiveInfo = (params: {
  sandboxId: string;
  generation: string;
  sizeBytes: number;
}): SandboxArchiveInfoType => ({
  objectKey: buildSandboxArchiveObjectKey(params.sandboxId, params.generation),
  generation: params.generation,
  format: 'tar.zst',
  sizeBytes: params.sizeBytes,
  archivedAt: new Date()
});

const isMongoDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 11000;

/**
 * 将已迁移或转码完成的沙盒记录幂等插入 `agent_sandbox_instances_v3`（`archived` + `.tar.zst`）。
 *
 * 严格保持 `agent_sandbox_instances_v2` 只读；若因租约失效/中止或 `v3` 唯一键冲突未插入新文档，立即清理本次上传的 `.tar.zst` 对象。
 */
export async function commitMigratedSandboxArchive(params: {
  current: SandboxMigrationDoc;
  archive: SandboxArchiveInfoType;
  lease?: RedisLeaseContext;
  signal?: AbortSignal;
}): Promise<boolean> {
  const { current, archive, lease, signal } = params;
  const deleteUploadedArchive = async () => {
    if (archive.sizeBytes > 0) {
      await getS3SandboxSource()
        .deleteArchiveObject({ key: archive.objectKey })
        .catch(() => undefined);
    }
  };

  try {
    signal?.throwIfAborted();
    lease?.assertValid();
  } catch (error) {
    await deleteUploadedArchive();
    throw error;
  }

  const normalizedLimit =
    current.limit !== null && current.limit !== undefined
      ? {
          ...(current.limit.cpuCount !== null && current.limit.cpuCount !== undefined
            ? { cpuCount: current.limit.cpuCount }
            : {}),
          ...(current.limit.memoryMiB !== null && current.limit.memoryMiB !== undefined
            ? { memoryMiB: current.limit.memoryMiB }
            : {})
        }
      : undefined;

  const insertDoc = {
    _id: current._id,
    provider: SANDBOX_PROVIDER,
    sandboxId: current.sandboxId,
    sourceType: current.sourceType,
    sourceId: current.sourceId,
    userId: current.userId,
    ...(current.teamId !== null && current.teamId !== undefined && current.teamId !== ''
      ? { teamId: current.teamId }
      : {}),
    status: SandboxInstanceStatusEnum.archived,
    createdAt: current.createdAt instanceof Date ? current.createdAt : new Date(),
    lastActiveAt: current.lastActiveAt instanceof Date ? current.lastActiveAt : new Date(),
    ...(normalizedLimit && Object.keys(normalizedLimit).length > 0
      ? { limit: normalizedLimit }
      : {}),
    ...(current.versionId !== null && current.versionId !== undefined && current.versionId !== ''
      ? { versionId: current.versionId }
      : {}),
    storage: {
      archive
    }
  };

  try {
    const result = await MongoSandboxInstance.collection.updateOne(
      {
        sourceType: current.sourceType,
        sourceId: current.sourceId,
        userId: current.userId
      },
      {
        $setOnInsert: insertDoc
      },
      {
        upsert: true
      }
    );
    if (result.upsertedCount === 0) {
      await deleteUploadedArchive();
      return false;
    }
    return true;
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      await deleteUploadedArchive();
      return false;
    }
    throw error;
  }
}

/** 读取历史失败快照并剥离上一轮 `preflight` 阻断记录，由调用方按实际是否继续决定何时回写快照。 */
export async function loadNonPreflightFailures(
  context: SystemMigrationContext
): Promise<{ failures: Map<string, SystemMigrationFailedRecord>; hadPreflight: boolean }> {
  const existingFailures = await context.getFailedRecords();
  const failures = new Map<string, SystemMigrationFailedRecord>();
  let hadPreflight = false;

  for (const record of existingFailures) {
    if (record.stageKey === 'preflight') {
      hadPreflight = true;
      continue;
    }
    const key =
      record.data.id !== undefined
        ? String(record.data.id)
        : String(record.data.key ?? record.data.sandboxId);
    failures.set(key, record);
  }

  return { failures, hadPreflight };
}

/** 在无待处理数据时依次补全各阶段进度并结束迁移任务。 */
export async function completeNoopSandboxMigration<T>(params: {
  context: SystemMigrationContext;
  stages: Array<{ key: string; current: number }>;
  result: T;
}): Promise<T> {
  const { context, stages, result } = params;
  await context.reportProgress({
    key: 'preflight',
    status: SystemMigrationStatusEnum.succeeded
  });
  for (const stage of stages) {
    await context.reportProgress({
      key: stage.key,
      status: SystemMigrationStatusEnum.running,
      current: stage.current
    });
    await context.reportProgress({
      key: stage.key,
      status: SystemMigrationStatusEnum.succeeded,
      current: stage.current
    });
  }
  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.running
  });
  await context.reportProgress({
    key: 'validation',
    status: SystemMigrationStatusEnum.succeeded
  });
  return result;
}

/** 迁移 `provisioning` 过渡态旧沙盒：若 S3 已存在 `package.zip` 则转码，否则以空工作区写入 `v3` `archived`。 */
export async function migrateProvisioningSandboxFallback(params: {
  current: SandboxMigrationDoc;
  hasLegacyZip: boolean;
  transcodeLegacyZip: () => Promise<'migrated' | 'skipped'>;
  lease: RedisLeaseContext;
  signal: AbortSignal;
}): Promise<'migrated' | 'skipped'> {
  const { current, hasLegacyZip, transcodeLegacyZip, lease, signal } = params;
  if (hasLegacyZip) {
    return await transcodeLegacyZip();
  }

  const generation = randomUUID().replaceAll('-', '').slice(0, 12);
  const committed = await commitMigratedSandboxArchive({
    current,
    archive: buildTarZstArchiveInfo({
      sandboxId: current.sandboxId,
      generation,
      sizeBytes: 0
    }),
    lease,
    signal
  });
  return committed ? 'migrated' : 'skipped';
}

/** 按批次上限分片重跑指定阶段的历史失败文档，缺失文档从失败列表摘除后持久化失败快照与 checkpoint。 */
export async function retryFailedSandboxDocs(params: {
  context: SystemMigrationContext;
  collection: SandboxMigrationCollection;
  failures: Map<string, SystemMigrationFailedRecord>;
  stageKeys: string[];
  concurrency: number;
  processDoc: (doc: SandboxMigrationDoc) => Promise<void>;
  saveCheckpoint: () => Promise<void>;
}): Promise<void> {
  const { context, collection, failures, stageKeys, concurrency, processDoc, saveCheckpoint } =
    params;
  const stageSet = new Set(stageKeys);
  const retryIdSet = new Set<string>();

  for (const item of failures.values()) {
    if (!stageSet.has(item.stageKey)) continue;
    if (typeof item.data.id !== 'string' || !Types.ObjectId.isValid(item.data.id)) continue;
    retryIdSet.add(item.data.id);
  }

  const retryIds = [...retryIdSet];

  for (let i = 0; i < retryIds.length; i += systemMigrationBatchSize) {
    context.signal.throwIfAborted();
    await context.assertActive();

    const chunkIds = retryIds.slice(i, i + systemMigrationBatchSize);
    const retryFilter: SandboxDocFilter = {
      _id: { $in: chunkIds.map((id) => new Types.ObjectId(id)) }
    };
    const retryDocs = await collection
      .find<SandboxMigrationDoc>(retryFilter, { projection: SANDBOX_MIGRATION_PROJECTION })
      .toArray();
    const foundIds = new Set(retryDocs.map((doc) => String(doc._id)));
    for (const id of chunkIds) {
      if (!foundIds.has(id)) {
        failures.delete(id);
      }
    }
    await batchRun(retryDocs, processDoc, concurrency);
    await context.reportFailedRecords([...failures.values()]);
    await saveCheckpoint();
  }
}

/** 按 `_id` 游标分批执行迁移或清理阶段，直接推进统一形态 `{ lastId, done }` stage 状态。 */
export async function runSandboxDocCursorStage(params: {
  context: SystemMigrationContext;
  collection: SandboxMigrationCollection;
  failures: Map<string, SystemMigrationFailedRecord>;
  stageKey: string;
  retryStageKeys?: string[];
  filter: SandboxDocFilter;
  stage: SandboxCursorStageState;
  concurrency: number;
  maxFailures: number;
  failMessage: string;
  getProgressCurrent: () => number;
  processDoc: (doc: SandboxMigrationDoc) => Promise<void>;
  saveCheckpoint: () => Promise<void>;
}): Promise<void> {
  const {
    context,
    collection,
    failures,
    stageKey,
    retryStageKeys,
    filter,
    stage,
    concurrency,
    maxFailures,
    failMessage,
    getProgressCurrent,
    processDoc,
    saveCheckpoint
  } = params;

  await context.reportProgress({
    key: stageKey,
    status: SystemMigrationStatusEnum.running,
    current: getProgressCurrent()
  });

  await retryFailedSandboxDocs({
    context,
    collection,
    failures,
    stageKeys: retryStageKeys ?? [stageKey],
    concurrency,
    processDoc,
    saveCheckpoint
  });

  while (!stage.done) {
    context.signal.throwIfAborted();
    await context.assertActive();

    const batchFilter: SandboxDocFilter = {
      ...filter,
      ...(stage.lastId ? { _id: { $gt: new Types.ObjectId(stage.lastId) } } : {})
    };
    const batch = await collection
      .find<SandboxMigrationDoc>(batchFilter, { projection: SANDBOX_MIGRATION_PROJECTION })
      .sort({ _id: 1 })
      .limit(systemMigrationBatchSize)
      .toArray();

    if (batch.length === 0) {
      stage.done = true;
      await context.reportFailedRecords([...failures.values()]);
      await saveCheckpoint();
      break;
    }

    await batchRun(batch, processDoc, concurrency);

    if (failures.size >= maxFailures) {
      await context.fail({
        message: failMessage,
        failedRecords: [...failures.values()]
      });
    }

    // 必须在推进 checkpoint 游标前原子覆盖失败快照。
    await context.reportFailedRecords([...failures.values()]);
    stage.lastId = String(batch.at(-1)!._id);
    await saveCheckpoint();
    await context.reportProgress({
      key: stageKey,
      status: SystemMigrationStatusEnum.running,
      current: getProgressCurrent()
    });
  }

  const stageHasFailures = [...failures.values()].some((item) => item.stageKey === stageKey);
  if (!stageHasFailures) {
    await context.reportProgress({
      key: stageKey,
      status: SystemMigrationStatusEnum.succeeded,
      current: getProgressCurrent()
    });
  }
}
