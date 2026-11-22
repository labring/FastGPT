import { randomUUID } from 'node:crypto';
import { createTarZstStream } from '@fastgpt/service/common/file/tarZst';
import { iterateRemoteZipAsTarEntries } from '@fastgpt/service/common/file/zip';
import { resolveStorageZipRangeSource } from '@fastgpt/service/common/s3/utils/zipRange';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import type { RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import {
  buildSandboxArchiveObjectKey,
  getS3SandboxSource
} from '@fastgpt/service/common/s3/sources/sandbox';
import { deleteOpenSandboxContainer } from '@fastgpt/service/core/ai/sandbox/application/resource';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import {
  deleteSessionVolume,
  getSessionVolumeClaimName
} from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';
import { SANDBOX_PROVIDER } from '@fastgpt/service/core/ai/sandbox/type';
import {
  buildTarZstArchiveInfo,
  commitMigratedSandboxArchive,
  type SandboxMigrationDoc
} from './utils';

const MAX_LEGACY_ZIP_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_LEGACY_ZIP_ENTRIES = 500_000;
const MAX_LEGACY_ZIP_UNCOMPRESSED_BYTES = 10 * 1024 * 1024 * 1024;

const logger = getLogger(LogCategories.SYSTEM.UPGRADE);

const shouldSkipSandboxArchiveRelPath = (relPath: string): boolean => {
  const segments = relPath.split('/').filter(Boolean);
  if (segments.length === 0) return true;
  if (segments[0] === 'lost+found' || segments[0].startsWith('.fastgpt-sandbox-')) {
    return true;
  }
  return segments.some((name) => name.startsWith('.') && name.includes('.fastgpt-tmp-'));
};

/** 构造历史 `.zip` 冷归档对象键（仅用于 4.18.0 系统升级转码与升级后清理）。 */
export const buildLegacySandboxZipKey = (sandboxId: string): string =>
  `sandbox/archive/${sandboxId}/package.zip`;

/**
 * 仅在当前调用方已持有 `withSandboxLease(sandboxId)` 锁内执行历史 `package.zip` -> `.tar.zst` 转码与 CAS 提交。
 */
export async function transcodeLegacyZipArchiveWithinLease(params: {
  current: SandboxMigrationDoc;
  signal: AbortSignal;
  lease: RedisLeaseContext;
}): Promise<'migrated' | 'skipped'> {
  const { current, signal, lease } = params;

  const s3Source = getS3SandboxSource();
  const legacyKey = buildLegacySandboxZipKey(current.sandboxId);
  const generation = randomUUID().replaceAll('-', '').slice(0, 12);
  const objectKey = buildSandboxArchiveObjectKey(current.sandboxId, generation);

  signal.throwIfAborted();
  // 旧协议即使空工作区也会上传真实的 22 字节 EMPTY_ZIP_BUFFER；源 ZIP 缺失不能证明工作区为空，必须直接失败并保留旧卷与恢复信息。
  const rangeSource = await resolveStorageZipRangeSource({
    bucket: s3Source,
    key: legacyKey,
    maxZipBytes: MAX_LEGACY_ZIP_BYTES,
    label: 'Legacy sandbox zip'
  });
  signal.throwIfAborted();

  const entriesIter = iterateRemoteZipAsTarEntries({
    totalSize: rangeSource.totalSize,
    readRange: rangeSource.readRange,
    signal,
    maxEntries: MAX_LEGACY_ZIP_ENTRIES,
    maxUncompressedBytes: MAX_LEGACY_ZIP_UNCOMPRESSED_BYTES,
    shouldSkip: shouldSkipSandboxArchiveRelPath
  });
  const first = await entriesIter.next();
  let archiveSizeBytes = 0;
  if (!first.done) {
    const body = createTarZstStream(
      (async function* () {
        try {
          yield { ...first.value, path: `workspace/${first.value.path}` };
          for await (const entry of entriesIter) {
            yield { ...entry, path: `workspace/${entry.path}` };
          }
        } finally {
          await entriesIter.return?.(undefined);
        }
      })()
    );
    archiveSizeBytes = (await s3Source.uploadArchiveStream({ key: objectKey, body, signal }))
      .sizeBytes;
  }
  const archive = buildTarZstArchiveInfo({
    sandboxId: current.sandboxId,
    generation,
    sizeBytes: archiveSizeBytes
  });

  const previousClaimName = getSessionVolumeClaimName(current.storage);
  const shouldCleanOpenSandboxRuntime =
    current.provider === SANDBOX_PROVIDER &&
    (Boolean(current.instanceId) ||
      current.status === SandboxInstanceStatusEnum.restoring ||
      current.status === SandboxInstanceStatusEnum.archiving);

  let cleanupDoneBeforeCommit = false;
  try {
    if (current.provider === SANDBOX_PROVIDER) {
      // 必须在 CAS 发布 archived 前完成残留容器与旧 PVC 清理，防止锁失效后继请求唤醒的新容器被旧 worker 误删。
      if (shouldCleanOpenSandboxRuntime) {
        signal.throwIfAborted();
        try {
          await deleteOpenSandboxContainer({
            sandboxId: current.sandboxId,
            instanceId: current.instanceId,
            signal
          });
        } catch (err) {
          if (signal.aborted) throw err;
          logger.warn(
            'Best-effort OpenSandbox container cleanup before zip transcode commit failed',
            { sandboxId: current.sandboxId, error: err }
          );
        }
      }

      if (previousClaimName) {
        signal.throwIfAborted();
        try {
          await deleteSessionVolume(previousClaimName, { allowLegacyUnlabeled: true });
        } catch (err) {
          if (signal.aborted) throw err;
          logger.warn('Best-effort legacy PVC cleanup before zip transcode commit failed', {
            sandboxId: current.sandboxId,
            claimName: previousClaimName,
            error: err
          });
        }
      }
    }

    cleanupDoneBeforeCommit = true;
    // 通过状态机互斥 CAS 原子落库（commitMigratedSandboxArchive 在提交失败或未命中时负责清理 S3 对象）。
    const committed = await commitMigratedSandboxArchive({ current, archive, lease, signal });
    return committed ? 'migrated' : 'skipped';
  } catch (err) {
    if (!cleanupDoneBeforeCommit && archive.sizeBytes > 0) {
      await s3Source.deleteArchiveObject({ key: archive.objectKey }).catch(() => undefined);
    }
    throw err;
  }
}
