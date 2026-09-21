import type { Readable, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import archiver from 'archiver';
import {
  LeaseCache,
  RedisLeaseUnavailableError,
  isRedisLeaseError
} from '@fastgpt/dal/redis/caches';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { DatasetArchiveManifest } from '@fastgpt/service/core/dataset/collection/archive/service';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  buildDatasetArchivePlan,
  prepareDatasetArchiveManifest
} from '@fastgpt/service/core/dataset/collection/archive/service';
import { findArchiveCollectionPermissionItems } from '@fastgpt/service/core/dataset/collection/archive/entity';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { serviceEnv } from '@fastgpt/service/env';
import {
  canShortCircuitCollectionPermission,
  getReadableCollectionIds
} from '@fastgpt/service/support/permission/collection/auth';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import type { NextApiResponse } from 'next';

const DATASET_ARCHIVE_LEASE_TTL_MS = 60_000;
const DATASET_ARCHIVE_LEASE_RENEW_INTERVAL_MS = 10_000;
const archiveLeaseCache = new LeaseCache({ logger: getLogger(LogCategories.INFRA.REDIS) });

type LeaseCacheLike = Pick<LeaseCache, 'withLease'>;

/**
 * 确认归档清单中的每个 Collection 都对当前成员可读。Collection 权限开启时，文件夹递归
 * 不能仅验证入口目录，否则受限后代会绕过 ACL 被归档。
 */
export const assertDatasetArchiveCollectionsReadable = async ({
  teamId,
  datasetId,
  tmbId,
  isRoot,
  collectionIds
}: {
  teamId: string;
  datasetId: string;
  tmbId: string;
  isRoot: boolean;
  collectionIds: string[];
}) => {
  const uniqueCollectionIds = [...new Set(collectionIds)];
  if (isRoot || uniqueCollectionIds.length === 0) return;

  const canShortCircuit = await canShortCircuitCollectionPermission({
    teamId,
    datasetIds: [datasetId],
    tmbId
  });
  if (canShortCircuit) return;

  const [groupIds, orgIds] = await Promise.all([
    getGroupsByTmbId({ tmbId, teamId }).then((list) => list.map((item) => String(item._id))),
    getOrgIdSetWithParentByTmbId({ tmbId, teamId }).then((ids) => Array.from(ids))
  ]);
  const permissionCollections = await findArchiveCollectionPermissionItems({
    teamId,
    datasetId,
    collectionIds: uniqueCollectionIds
  });
  if (permissionCollections.length !== uniqueCollectionIds.length) {
    throw DatasetErrEnum.unAuthDatasetCollection;
  }
  // 上面的新鲜查询已确认不能短路，必须按 Collection 权限开启态计算，避免复用旧开关值。
  const readableCollectionIds = await getReadableCollectionIds({
    collections: permissionCollections,
    teamId,
    tmbId,
    groupIds,
    orgIds,
    datasetPermission: ReadPermissionVal,
    collectionPermissionEnabled: true
  });
  if (new Set(readableCollectionIds).size !== uniqueCollectionIds.length) {
    throw DatasetErrEnum.unAuthDatasetCollection;
  }
};

/**
 * 创建知识库归档资源执行器。先获取成员互斥 Lease，再依次尝试集群槽位；两层 Lease 均覆盖
 * 预检和完整 HTTP 流生命周期，并把资源竞争映射为稳定的业务错误。
 */
export const createDatasetArchiveResourceRunner = ({
  leaseCache = archiveLeaseCache
}: { leaseCache?: LeaseCacheLike } = {}) => {
  return async function runWithDatasetArchiveResources<T>({
    tmbId,
    concurrency,
    fn
  }: {
    tmbId: string;
    concurrency: number;
    fn: (context: { signals: AbortSignal[]; assertValid: () => void }) => Promise<T>;
  }): Promise<T> {
    try {
      return await leaseCache.withLease({
        key: `dataset-archive:member:${tmbId}`,
        label: 'dataset archive member',
        ttlMs: DATASET_ARCHIVE_LEASE_TTL_MS,
        renewIntervalMs: DATASET_ARCHIVE_LEASE_RENEW_INTERVAL_MS,
        fn: async (memberLease) => {
          for (let slot = 0; slot < concurrency; slot += 1) {
            try {
              return await leaseCache.withLease({
                key: `dataset-archive:slot:${slot}`,
                label: 'dataset archive cluster slot',
                ttlMs: DATASET_ARCHIVE_LEASE_TTL_MS,
                renewIntervalMs: DATASET_ARCHIVE_LEASE_RENEW_INTERVAL_MS,
                fn: (slotLease) =>
                  fn({
                    signals: [memberLease.signal, slotLease.signal],
                    assertValid: () => {
                      memberLease.assertValid();
                      slotLease.assertValid();
                    }
                  })
              });
            } catch (error) {
              if (error instanceof RedisLeaseUnavailableError) continue;
              if (isRedisLeaseError(error)) throw DatasetErrEnum.archiveUnavailable;
              throw error;
            }
          }

          throw DatasetErrEnum.archiveUnavailable;
        }
      });
    } catch (error) {
      if (error === DatasetErrEnum.archiveUnavailable) throw error;
      if (error instanceof RedisLeaseUnavailableError) {
        throw DatasetErrEnum.archiveMemberBusy;
      }
      if (isRedisLeaseError(error)) throw DatasetErrEnum.archiveUnavailable;
      throw error;
    }
  };
};

export const withDatasetArchiveResources = createDatasetArchiveResourceRunner();

/**
 * 在统一期限和取消信号下预检集合树与 S3 metadata。不可取消的外部请求可自然结束，
 * 但本执行器立即退出，迟到结果通过 assertActive 阻止继续调度下一层或下一项。
 */
export const prepareDatasetArchive = async ({
  teamId,
  datasetId,
  datasetName,
  collectionIds,
  signal,
  assertCollectionsReadable
}: {
  teamId: string;
  datasetId: string;
  datasetName: string;
  collectionIds: string[];
  signal: AbortSignal;
  assertCollectionsReadable?: (collectionIds: string[]) => Promise<void>;
}) => {
  const prepareDeadlineAt = Date.now() + serviceEnv.DATASET_ARCHIVE_PREPARE_TIMEOUT_SECONDS * 1000;
  const assertActive = () => {
    signal.throwIfAborted();
    if (Date.now() >= prepareDeadlineAt) throw DatasetErrEnum.archiveUnavailable;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(
      () => reject(DatasetErrEnum.archiveUnavailable),
      Math.max(0, prepareDeadlineAt - Date.now())
    );
    timer.unref?.();
  });
  void interrupted.catch(() => undefined);
  try {
    assertActive();
    const prepare = async () => {
      const plan = await buildDatasetArchivePlan({
        teamId,
        datasetId,
        datasetName,
        collectionIds,
        assertActive
      });
      assertActive();
      await assertCollectionsReadable?.(plan.permissionCollectionIds);
      assertActive();
      const datasetSource = getS3DatasetSource();
      return prepareDatasetArchiveManifest({
        plan,
        assertActive,
        getFileMetadata: (key) => datasetSource.getFileMetadata(key),
        limits: {
          maxFiles: serviceEnv.DATASET_ARCHIVE_MAX_FILES,
          maxSourceSizeBytes: serviceEnv.DATASET_ARCHIVE_MAX_SOURCE_SIZE_MB * 1024 * 1024,
          prepareDeadlineAt
        }
      });
    };
    const preparation = prepare();
    // 取消或超时先返回后，外部读取仍可能迟到失败；其拒绝必须始终有人消费。
    void preparation.catch(() => undefined);
    return await Promise.race([preparation, interrupted]);
  } finally {
    if (timer) clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
};

const getAbortReason = (signal: AbortSignal) =>
  signal.reason instanceof Error ? signal.reason : new Error('Dataset archive aborted');

/**
 * 将预检完成的归档清单写入目标流。目录使用空 ZIP entry；文件流严格顺序打开，等待当前
 * Readable 完成后才请求下一个对象，从而把 HTTP 背压传递到 S3。
 */
export const writeDatasetArchive = async ({
  destination,
  manifest,
  signal,
  getFileStream
}: {
  destination: Writable;
  manifest: DatasetArchiveManifest;
  signal: AbortSignal;
  getFileStream: (key: string, signal: AbortSignal) => Promise<Readable | undefined>;
}) => {
  const archive = archiver('zip', { store: true, forceZip64: true });
  let currentStream: Readable | undefined;
  let stopped = false;
  let rejectFailure!: (error: unknown) => void;
  const failure = new Promise<never>((_, reject) => {
    rejectFailure = reject;
  });
  void failure.catch(() => undefined);
  // 取消事件必须同步停止读取，不能等待 Promise.race 的拒绝传播后才释放当前流。
  const fail = (error: unknown) => {
    if (stopped) return;
    stopped = true;
    rejectFailure(error);
    currentStream?.destroy();
    archive.unpipe(destination);
    archive.destroy();
  };
  const onAbort = () => fail(getAbortReason(signal));
  signal.addEventListener('abort', onAbort, { once: true });
  archive.on('error', fail);
  archive.on('warning', fail);
  const destinationFinished = finished(destination, { cleanup: true, readable: false });
  // 目标流可能在打开 S3 或 finalize 之前失败；立即处理拒绝，并让所有等待共享失败出口。
  void destinationFinished.catch(fail);

  try {
    if (signal.aborted) throw getAbortReason(signal);
    archive.pipe(destination);

    manifest.directories.forEach((path) => {
      archive.append('', { name: `${path}/` });
    });

    for (const file of manifest.files) {
      if (signal.aborted) throw getAbortReason(signal);

      currentStream = await Promise.race([
        getFileStream(file.key, signal).then((stream) => {
          // 先接管流，确保 await 恢复前发生取消时也能同步销毁。
          currentStream = stream;
          // 不可取消的打开请求可能晚于本次写入返回；销毁迟到流，避免后台继续读取。
          if (stopped || signal.aborted) stream?.destroy();
          return stream;
        }),
        failure
      ]);
      if (!currentStream) throw DatasetErrEnum.archiveInvalidFile;
      if (signal.aborted) throw getAbortReason(signal);

      const sourceFinished = finished(currentStream, { cleanup: true });
      void sourceFinished.catch(fail);
      archive.append(currentStream, { name: file.path, store: true });
      await Promise.race([sourceFinished, failure]);
      currentStream = undefined;
    }

    const finalized = archive.finalize();
    void finalized.catch(fail);
    await Promise.race([finalized, failure]);
    await Promise.race([destinationFinished, failure]);
  } catch (error) {
    fail(error);
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
    archive.off('error', fail);
    archive.off('warning', fail);
  }
};

/** 将归档写入 Next.js 响应，并把客户端断开和 Lease 丢失统一传递给当前 S3 文件流。 */
export const streamDatasetArchiveResponse = async ({
  res,
  manifest,
  signal,
  assertLeaseValid
}: {
  res: NextApiResponse;
  manifest: DatasetArchiveManifest;
  signal: AbortSignal;
  assertLeaseValid: () => void;
}) => {
  const datasetSource = getS3DatasetSource();

  assertLeaseValid();
  await writeDatasetArchive({
    destination: res,
    manifest,
    signal,
    getFileStream: async (key, streamSignal) => {
      assertLeaseValid();
      return datasetSource.getFileStream(key, { abortSignal: streamSignal });
    }
  });
  assertLeaseValid();
};
