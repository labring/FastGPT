import { randomUUID } from 'node:crypto';
import type { RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import { createTarZstStream } from '@fastgpt/service/common/file/tarZst';
import { iterateRemoteZipAsTarEntries } from '@fastgpt/service/common/file/zip';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  buildSandboxArchiveObjectKey,
  getS3SandboxSource,
  LEGACY_SANDBOX_ARCHIVE_PREFIX
} from '@fastgpt/service/common/s3/sources/sandbox';
import { resolveStorageZipRangeSource } from '@fastgpt/service/common/s3/utils/zipRange';
import { deleteOpenSandboxContainer } from '@fastgpt/service/core/ai/sandbox/application/resource';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
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
  `${LEGACY_SANDBOX_ARCHIVE_PREFIX}/${sandboxId}/package.zip`;

/**
 * 在已持有 `withSandboxLease(sandboxId)` 锁内执行历史 `package.zip` -> `sandbox/archive-v2/.../*.tar.zst` 转码并写入 `v3`。
 *
 * 严格保留源 `package.zip` 与旧 PVC（若有），待独立清理任务完成核验后再销毁。
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

  const shouldCleanOpenSandboxRuntime =
    current.provider === SANDBOX_PROVIDER &&
    (current.status === SandboxInstanceStatusEnum.restoring ||
      current.status === SandboxInstanceStatusEnum.archiving);

  let cleanupDoneBeforeCommit = false;
  try {
    if (shouldCleanOpenSandboxRuntime) {
      signal.throwIfAborted();
      try {
        // 仅清理可能残留的旧运行容器以释放计算资源，绝不在此阶段删除旧 PVC。
        await deleteOpenSandboxContainer({
          sandboxId: current.sandboxId,
          allowLegacyUnlabeled: true,
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

    cleanupDoneBeforeCommit = true;
    // 幂等插入 `v3`（`commitMigratedSandboxArchive` 在提交失败或冲突时负责清理新上传的 `.tar.zst`）。
    const committed = await commitMigratedSandboxArchive({ current, archive, lease, signal });
    return committed ? 'migrated' : 'skipped';
  } catch (err) {
    if (!cleanupDoneBeforeCommit && archive.sizeBytes > 0) {
      await s3Source.deleteArchiveObject({ key: archive.objectKey }).catch(() => undefined);
    }
    throw err;
  }
}
