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
  processed: number;
  total?: number;
};

export const SANDBOX_MIGRATION_PROGRESS_REPORT_INTERVAL_MS = 2_000;

/**
 * 序列化并按时间节流上报单阶段进度（`current`/`total`），避免并发工作协程竞争乱序写库。
 */
export const createStageProgressReporter = (params: {
  context: SystemMigrationContext;
  stageKey: string;
  getProgress: () => { current: number; total: number };
  minIntervalMs?: number;
}) => {
  const {
    context,
    stageKey,
    getProgress,
    minIntervalMs = SANDBOX_MIGRATION_PROGRESS_REPORT_INTERVAL_MS
  } = params;
  let lastReportedAt = 0;
  let lastReportedCurrent = -1;
  let lastReportedTotal = -1;
  let inFlight: Promise<void> | undefined;

  const writeProgress = async (
    status: SystemMigrationStatusEnum.running | SystemMigrationStatusEnum.succeeded,
    force: boolean
  ) => {
    while (inFlight !== undefined) {
      await inFlight;
    }

    const { current, total } = getProgress();
    const normalizedTotal = Math.max(total, current);
    if (!force && current === lastReportedCurrent && normalizedTotal === lastReportedTotal) {
      return;
    }

    const task = (async () => {
      await context.reportProgress({
        key: stageKey,
        status,
        current,
        total: normalizedTotal
      });
      lastReportedAt = Date.now();
      lastReportedCurrent = current;
      lastReportedTotal = normalizedTotal;
    })();

    inFlight = task;
    try {
      await task;
    } finally {
      if (inFlight === task) {
        inFlight = undefined;
      }
    }
  };

  return {
    reportStart: () => writeProgress(SystemMigrationStatusEnum.running, true),
    reportIfDue: async () => {
      if (inFlight !== undefined || Date.now() - lastReportedAt < minIntervalMs) {
        return;
      }
      await writeProgress(SystemMigrationStatusEnum.running, false);
    },
    flush: () => writeProgress(SystemMigrationStatusEnum.running, false),
    reportSucceeded: () => writeProgress(SystemMigrationStatusEnum.succeeded, true)
  };
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
      current: stage.current,
      total: stage.current
    });
    await context.reportProgress({
      key: stage.key,
      status: SystemMigrationStatusEnum.succeeded,
      current: stage.current,
      total: stage.current
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
  excludeIds?: ReadonlySet<string>;
  concurrency: number;
  processDoc: (doc: SandboxMigrationDoc) => Promise<void>;
  saveCheckpoint: () => Promise<void>;
  onChunkComplete?: () => Promise<void>;
}): Promise<void> {
  const {
    context,
    collection,
    failures,
    stageKeys,
    excludeIds,
    concurrency,
    processDoc,
    saveCheckpoint,
    onChunkComplete
  } = params;
  const stageSet = new Set(stageKeys);
  const retryIdSet = new Set<string>();

  for (const item of failures.values()) {
    if (!stageSet.has(item.stageKey)) continue;
    if (typeof item.data.id !== 'string' || !Types.ObjectId.isValid(item.data.id)) continue;
    const hexId = new Types.ObjectId(item.data.id).toHexString();
    if (excludeIds?.has(hexId)) continue;
    retryIdSet.add(hexId);
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
    const foundIds = new Set(retryDocs.map((doc) => doc._id.toHexString()));
    for (const id of chunkIds) {
      if (!foundIds.has(id)) {
        failures.delete(id);
      }
    }
    await batchRun(retryDocs, processDoc, concurrency);
    await context.reportFailedRecords([...failures.values()]);
    await saveCheckpoint();
    await onChunkComplete?.();
  }
}

/** 按 `_id` 游标分批执行迁移或清理阶段，推进 `{ lastId, done, processed, total }` 状态并节流同步阶段进度。 */
export async function runSandboxDocCursorStage(params: {
  context: SystemMigrationContext;
  collection: SandboxMigrationCollection;
  failures: Map<string, SystemMigrationFailedRecord>;
  stageKey: string;
  filter: SandboxDocFilter;
  stage: SandboxCursorStageState;
  concurrency: number;
  maxFailures: number;
  failMessage: string;
  processDoc: (doc: SandboxMigrationDoc) => Promise<void>;
  saveCheckpoint: () => Promise<void>;
}): Promise<void> {
  const {
    context,
    collection,
    failures,
    stageKey,
    filter,
    stage,
    concurrency,
    maxFailures,
    failMessage,
    processDoc,
    saveCheckpoint
  } = params;

  const lastIdHex = stage.lastId ? new Types.ObjectId(stage.lastId).toHexString() : null;

  const remainingFilter: SandboxDocFilter = stage.lastId
    ? { ...filter, _id: { $gt: new Types.ObjectId(stage.lastId) } }
    : filter;
  const remainingCount = stage.done ? 0 : await collection.countDocuments(remainingFilter);

  const retryIdSet = new Set<string>();
  const aheadFailureIdSet = new Set<string>();
  for (const item of failures.values()) {
    if (item.stageKey !== stageKey) continue;
    if (typeof item.data.id !== 'string' || !Types.ObjectId.isValid(item.data.id)) continue;
    const itemHex = new Types.ObjectId(item.data.id).toHexString();
    if (stage.done || (lastIdHex !== null && itemHex <= lastIdHex)) {
      retryIdSet.add(itemHex);
    } else {
      aheadFailureIdSet.add(itemHex);
    }
  }

  // 游标尚未经过且仍满足当前阶段 filter 的失败文档，已在 remainingCount 中计入并将在后续批扫描内按序执行；
  // 仅将已从库中删除或已不满足当前 filter 的 ahead 失败项纳入补跑，避免提前推进 processed 与重启重复计数。
  const cursorCoveredFailureIds = new Set<string>();
  const aheadFailureIds = [...aheadFailureIdSet];
  for (let i = 0; i < aheadFailureIds.length; i += systemMigrationBatchSize) {
    context.signal.throwIfAborted();
    const chunkIds = aheadFailureIds.slice(i, i + systemMigrationBatchSize);
    const matchedDocs = await collection
      .find<{
        _id: Types.ObjectId;
      }>(
        { ...filter, _id: { $in: chunkIds.map((id) => new Types.ObjectId(id)) } },
        { projection: { _id: 1 } }
      )
      .toArray();
    const matchedSet = new Set(matchedDocs.map((doc) => doc._id.toHexString()));
    for (const id of chunkIds) {
      if (matchedSet.has(id)) {
        cursorCoveredFailureIds.add(id);
      } else {
        retryIdSet.add(id);
      }
    }
  }

  stage.total = Math.max(stage.total ?? 0, stage.processed + remainingCount + retryIdSet.size);

  const progressReporter = createStageProgressReporter({
    context,
    stageKey,
    getProgress: () => ({
      current: stage.processed,
      total: Math.max(stage.total ?? 0, stage.processed)
    })
  });

  await progressReporter.reportStart();

  const runAndTrackDoc = async (doc: SandboxMigrationDoc) => {
    const recordId = String(doc._id);
    await processDoc(doc);
    if (!failures.has(recordId)) {
      stage.processed += 1;
      stage.total = Math.max(stage.total ?? 0, stage.processed);
      await progressReporter.reportIfDue();
    }
  };

  if (retryIdSet.size > 0) {
    await retryFailedSandboxDocs({
      context,
      collection,
      failures,
      stageKeys: [stageKey],
      excludeIds: cursorCoveredFailureIds,
      concurrency,
      processDoc: runAndTrackDoc,
      saveCheckpoint,
      onChunkComplete: () => progressReporter.flush()
    });
  }

  const hasStageFailures = () => [...failures.values()].some((item) => item.stageKey === stageKey);

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
      if (!hasStageFailures()) {
        stage.total = stage.processed;
      }
      await context.reportFailedRecords([...failures.values()]);
      await saveCheckpoint();
      break;
    }

    await batchRun(batch, runAndTrackDoc, concurrency);

    if (failures.size >= maxFailures) {
      await progressReporter.flush();
      await context.fail({
        message: failMessage,
        failedRecords: [...failures.values()]
      });
    }

    // 必须在推进 checkpoint 游标前原子覆盖失败快照。
    await context.reportFailedRecords([...failures.values()]);
    stage.lastId = String(batch.at(-1)!._id);
    await saveCheckpoint();
    await progressReporter.flush();
  }

  if (!hasStageFailures()) {
    if (stage.total !== stage.processed) {
      stage.total = stage.processed;
      await saveCheckpoint();
    }
    await progressReporter.reportSucceeded();
  } else {
    await progressReporter.flush();
  }
}
