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
import { OPEN_SANDBOX_DEFAULT_HOME_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  SANDBOX_ARCHIVING_ROLLBACK_PHASES,
  SandboxInstanceStatusEnum
} from '@fastgpt/service/core/ai/sandbox/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { LEGACY_DEVBOX_PROVIDER } from '@fastgpt/service/core/ai/sandbox/legacy';
import {
  SANDBOX_PROVIDER,
  type SandboxArchiveInfoType,
  type SandboxInstanceStatusType,
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
  teamId?: string;
  provider: LegacySandboxProviderType;
  instanceId?: string;
  status: SandboxInstanceStatusType;
  storage?: SandboxStorageType | null;
  operation?: {
    type?: string;
    phase?: string;
  } & Record<string, unknown>;
};

export type SandboxCursorStageState = {
  lastId: string | null;
  done: boolean;
};

type SandboxDocFilter = NonNullable<Parameters<typeof MongoSandboxInstance.collection.find>[0]>;

export const SANDBOX_MIGRATION_PROJECTION = {
  _id: 1,
  sandboxId: 1,
  sourceType: 1,
  sourceId: 1,
  provider: 1,
  status: 1,
  storage: 1,
  operation: 1
} as const;

/** 判断 Devbox 记录是否应以已有 S3 `package.zip` 为权威源（`archived`/`restoring` 或已越过上传阶段的 `archiving`）。 */
export const isDevboxArchiveAuthoritative = (
  doc: Pick<SandboxMigrationDoc, 'status' | 'operation'>
): boolean =>
  doc.status === SandboxInstanceStatusEnum.archived ||
  doc.status === SandboxInstanceStatusEnum.restoring ||
  (doc.status === SandboxInstanceStatusEnum.archiving &&
    doc.operation?.phase === 'archiveUploaded');

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

/** 未携带 `.tar.zst` 的 `archiving` 记录仅在活跃可恢复阶段免于迁移拦截的 Mongo 筛选子句。 */
const legacyArchivingUnmigratedCondition = {
  status: SandboxInstanceStatusEnum.archiving,
  'storage.archive.format': { $ne: 'tar.zst' },
  $or: [
    { 'storage.volumes.0': { $exists: false } },
    { 'operation.type': { $ne: 'archive' } },
    {
      'operation.phase': {
        $nin: [...SANDBOX_ARCHIVING_ROLLBACK_PHASES]
      }
    }
  ]
};

/** 4.18.0 前存量 OpenSandbox 持久卷仍挂载在旧 `/workspace` 布局的 Mongo 筛选条件。 */
const LEGACY_OPENSANDBOX_VOLUME_MIGRATION_FILTER = {
  provider: SANDBOX_PROVIDER,
  status: { $ne: SandboxInstanceStatusEnum.archived },
  'storage.volumes.0': { $exists: true },
  $or: [
    { 'storage.mountPath': { $exists: true, $ne: OPEN_SANDBOX_DEFAULT_HOME_PATH } },
    { 'storage.volumes.0.mountPath': { $exists: true, $ne: OPEN_SANDBOX_DEFAULT_HOME_PATH } }
  ]
};

/** 尚未迁移到 `opensandbox + /home/sandbox 布局 + .tar.zst` 的存量 Sandbox 实例通用 Mongo 筛选条件。 */
export const UNMIGRATED_SANDBOX_FILTER = {
  $or: [
    { provider: { $ne: SANDBOX_PROVIDER } },
    {
      status: {
        $in: [SandboxInstanceStatusEnum.archived, SandboxInstanceStatusEnum.restoring]
      },
      'storage.archive.format': { $ne: 'tar.zst' }
    },
    legacyArchivingUnmigratedCondition,
    LEGACY_OPENSANDBOX_VOLUME_MIGRATION_FILTER
  ]
};

/** 4.18.0 迁移任务 `legacyArchives` 阶段的 Mongo 查询筛选（包含所有历史 `.zip` 归档及旧 `/workspace` 挂卷）。 */
export const LEGACY_ARCHIVE_MIGRATION_FILTER = {
  $or: [
    {
      status: SandboxInstanceStatusEnum.archived,
      'storage.archive.format': { $ne: 'tar.zst' }
    },
    {
      provider: SANDBOX_PROVIDER,
      status: SandboxInstanceStatusEnum.restoring,
      'storage.archive.format': { $ne: 'tar.zst' }
    },
    {
      provider: SANDBOX_PROVIDER,
      ...legacyArchivingUnmigratedCondition
    },
    LEGACY_OPENSANDBOX_VOLUME_MIGRATION_FILTER
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

/** 将已迁移或转码完成的沙盒实例原子 CAS 提交为 OpenSandbox `.tar.zst` 冷归档状态；提交前取消或未命中时清理已上传对象。 */
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

  const pendingCleanup =
    current.provider === LEGACY_DEVBOX_PROVIDER ||
    Boolean(current.storage?.legacyDevboxPendingCleanup);

  const filter: SandboxDocFilter = {
    _id: current._id,
    ...UNMIGRATED_SANDBOX_FILTER
  };
  const result = await MongoSandboxInstance.collection.updateOne(filter, {
    $set: {
      provider: SANDBOX_PROVIDER,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive,
        ...(pendingCleanup ? { legacyDevboxPendingCleanup: true } : {})
      }
    },
    $unset: {
      operation: '',
      instanceId: ''
    }
  });
  if (result.matchedCount === 0) {
    await deleteUploadedArchive();
    return false;
  }
  return true;
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
    failures.set(String(record.data.id ?? record.data.key ?? record.data.sandboxId), record);
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

/** 按批次上限分片重跑指定阶段的历史失败文档，缺失文档从失败列表摘除后持久化失败快照与 checkpoint。 */
export async function retryFailedSandboxDocs(params: {
  context: SystemMigrationContext;
  failures: Map<string, SystemMigrationFailedRecord>;
  stageKeys: string[];
  concurrency: number;
  processDoc: (doc: SandboxMigrationDoc) => Promise<void>;
  saveCheckpoint: () => Promise<void>;
}): Promise<void> {
  const { context, failures, stageKeys, concurrency, processDoc, saveCheckpoint } = params;
  const collection = MongoSandboxInstance.collection;
  const stageSet = new Set(stageKeys);
  const retryIds = [...failures.values()]
    .filter(
      (item) =>
        stageSet.has(item.stageKey) &&
        typeof item.data.id === 'string' &&
        Types.ObjectId.isValid(String(item.data.id))
    )
    .map((item) => String(item.data.id));

  for (let i = 0; i < retryIds.length; i += systemMigrationBatchSize) {
    context.signal.throwIfAborted();
    await context.assertActive();

    const chunkIds = retryIds.slice(i, i + systemMigrationBatchSize);
    const retryFilter: SandboxDocFilter = {
      _id: { $in: chunkIds.map((id) => new Types.ObjectId(id)) }
    };
    const retryDocs = await collection.find<SandboxMigrationDoc>(retryFilter).toArray();
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
  const collection = MongoSandboxInstance.collection;

  await context.reportProgress({
    key: stageKey,
    status: SystemMigrationStatusEnum.running,
    current: getProgressCurrent()
  });

  await retryFailedSandboxDocs({
    context,
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
      .find<SandboxMigrationDoc>(batchFilter)
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
