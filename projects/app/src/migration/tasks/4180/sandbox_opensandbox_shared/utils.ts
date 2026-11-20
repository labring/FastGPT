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
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  LEGACY_DEVBOX_PROVIDER,
  UNMIGRATED_SANDBOX_FILTER
} from '@fastgpt/service/core/ai/sandbox/legacy';
import {
  SANDBOX_PROVIDER,
  type SandboxArchiveInfoType
} from '@fastgpt/service/core/ai/sandbox/type';
import { systemMigrationBatchSize } from '@/migration/constants';
import type { SystemMigrationContext } from '@/migration/registry';
import type { SandboxMigrationDoc } from './zipTranscoder';

type SandboxDocFilter = NonNullable<Parameters<typeof MongoSandboxInstance.collection.find>[0]>;

const isAtomicTmpFileName = (name: string): boolean =>
  name.startsWith('.') && name.includes('.fastgpt-tmp-');

/**
 * 判断工作区相对 POSIX 路径是否应从迁移归档中剔除（仅跳过根目录保留条目与原子写临时文件，保留依赖和缓存目录）。
 */
export const shouldSkipSandboxArchiveRelPath = (relPath: string): boolean => {
  const segments = relPath.split('/').filter(Boolean);
  if (segments.length === 0) return true;
  if (segments[0] === 'lost+found' || segments[0].startsWith('.fastgpt-sandbox-')) {
    return true;
  }
  return segments.some(isAtomicTmpFileName);
};

/** 校验 Sandbox 归属的 App / Skill 是否仍处于未删除活跃状态。 */
export const isSandboxSourceActive = async (
  doc: Pick<SandboxMigrationDoc, 'sourceType' | 'sourceId'>
): Promise<boolean> => {
  try {
    await assertSandboxSourceActive({
      sourceType: doc.sourceType,
      sourceId: doc.sourceId
    });
    return true;
  } catch (error) {
    if (error instanceof SandboxSourceMissingError) {
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

/** 将已迁移或转码完成的沙盒实例原子 CAS 提交为 OpenSandbox `.tar.zst` 冷归档状态。 */
export async function commitMigratedSandboxArchive(params: {
  current: SandboxMigrationDoc;
  archive: SandboxArchiveInfoType;
  lease?: RedisLeaseContext;
}): Promise<boolean> {
  const { current, archive, lease } = params;
  lease?.assertValid();
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
    if (archive.sizeBytes > 0) {
      await getS3SandboxSource()
        .deleteArchiveObject({ key: archive.objectKey })
        .catch(() => undefined);
    }
    return false;
  }
  return true;
}

/** 读取历史失败快照并清理已失效的 `preflight` 阻断记录（前置检查通过后调用）。 */
export async function loadFailuresClearingPreflight(
  context: SystemMigrationContext
): Promise<Map<string, SystemMigrationFailedRecord>> {
  const existingFailures = await context.getFailedRecords();
  const failures = new Map<string, SystemMigrationFailedRecord>();
  let removedPreflight = false;

  for (const record of existingFailures) {
    if (record.stageKey === 'preflight') {
      removedPreflight = true;
      continue;
    }
    failures.set(String(record.data.id ?? record.data.key ?? record.data.sandboxId), record);
  }

  if (removedPreflight) {
    await context.reportFailedRecords([...failures.values()]);
  }
  return failures;
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

/** 优先重跑指定阶段的历史失败文档，缺失文档从失败列表摘除后持久化失败快照与 checkpoint。 */
export async function retryFailedSandboxDocs<
  TDoc extends { _id: unknown } = SandboxMigrationDoc
>(params: {
  collection: {
    find: typeof MongoSandboxInstance.collection.find;
  };
  context: SystemMigrationContext;
  failures: Map<string, SystemMigrationFailedRecord>;
  stageKeys: string[];
  concurrency: number;
  processDoc: (doc: TDoc) => Promise<void>;
  saveCheckpoint: () => Promise<void>;
}): Promise<void> {
  const { collection, context, failures, stageKeys, concurrency, processDoc, saveCheckpoint } =
    params;
  const stageSet = new Set(stageKeys);
  const retryIds = [...failures.values()]
    .filter(
      (item) =>
        stageSet.has(item.stageKey) &&
        typeof item.data.id === 'string' &&
        Types.ObjectId.isValid(String(item.data.id))
    )
    .map((item) => String(item.data.id));

  if (retryIds.length === 0) return;

  const retryFilter: SandboxDocFilter = {
    _id: { $in: retryIds.map((id) => new Types.ObjectId(id)) }
  };
  const retryDocs = await collection.find<TDoc>(retryFilter).toArray();
  const foundIds = new Set(retryDocs.map((doc) => String(doc._id)));
  for (const id of retryIds) {
    if (!foundIds.has(id)) {
      failures.delete(id);
    }
  }
  await batchRun(retryDocs, processDoc, concurrency);
  await context.reportFailedRecords([...failures.values()]);
  await saveCheckpoint();
}

/** 按 `_id` 游标分批执行迁移或清理阶段，支持失败优先重跑、熔断与 checkpoint 断点续传。 */
export async function runSandboxDocCursorStage<
  TDoc extends { _id: unknown } = SandboxMigrationDoc
>(params: {
  collection: {
    find: typeof MongoSandboxInstance.collection.find;
  };
  context: SystemMigrationContext;
  failures: Map<string, SystemMigrationFailedRecord>;
  stageKey: string;
  retryStageKeys?: string[];
  filter: SandboxDocFilter;
  concurrency: number;
  maxFailures: number;
  failMessage: string;
  isDone: () => boolean;
  getLastId: () => string | null;
  onBatchCommitted: (lastId: string) => void;
  onStageMarkedDone: () => void;
  getProgressCurrent: () => number;
  processDoc: (doc: TDoc) => Promise<void>;
  saveCheckpoint: () => Promise<void>;
}): Promise<void> {
  const {
    collection,
    context,
    failures,
    stageKey,
    retryStageKeys,
    filter,
    concurrency,
    maxFailures,
    failMessage,
    isDone,
    getLastId,
    onBatchCommitted,
    onStageMarkedDone,
    getProgressCurrent,
    processDoc,
    saveCheckpoint
  } = params;

  await context.reportProgress({
    key: stageKey,
    status: SystemMigrationStatusEnum.running,
    current: getProgressCurrent()
  });

  await retryFailedSandboxDocs<TDoc>({
    collection,
    context,
    failures,
    stageKeys: retryStageKeys ?? [stageKey],
    concurrency,
    processDoc,
    saveCheckpoint
  });

  while (!isDone()) {
    context.signal.throwIfAborted();
    await context.assertActive();

    const lastId = getLastId();
    const batchFilter: SandboxDocFilter = {
      ...filter,
      ...(lastId ? { _id: { $gt: new Types.ObjectId(lastId) } } : {})
    };
    const batch = await collection
      .find<TDoc>(batchFilter)
      .sort({ _id: 1 })
      .limit(systemMigrationBatchSize)
      .toArray();

    if (batch.length === 0) {
      onStageMarkedDone();
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
    onBatchCommitted(String(batch.at(-1)!._id));
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
