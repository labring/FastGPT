import { randomUUID } from 'node:crypto';
import { createTarZstStream, type TarEntry } from '@fastgpt/service/common/file/tarZst';
import {
  iterateRemoteZipAsTarEntries,
  resolveStorageZipRangeSource
} from '@fastgpt/service/common/file/zip';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import type { Types } from '@fastgpt/service/common/mongo';
import type { RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import {
  buildSandboxArchiveObjectKey,
  getS3SandboxSource
} from '@fastgpt/service/common/s3/sources/sandbox';
import { withSandboxLease } from '@fastgpt/service/core/ai/sandbox/application/lease';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { isSandboxRecordMigrated } from '@fastgpt/service/core/ai/sandbox/legacy';
import {
  createOpenSandboxResourceClient,
  disconnectSandbox
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox';
import {
  deleteSessionVolume,
  getSessionVolumeClaimName
} from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';
import type {
  SandboxInstanceStatusType,
  SandboxSourceType,
  SandboxStorageType
} from '@fastgpt/service/core/ai/sandbox/type';
import {
  buildTarZstArchiveInfo,
  commitMigratedSandboxArchive,
  isSandboxSourceActive,
  shouldSkipSandboxArchiveRelPath
} from './utils';

const MAX_LEGACY_ZIP_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_LEGACY_ZIP_ENTRIES = 500_000;
const MAX_LEGACY_ZIP_UNCOMPRESSED_BYTES = 10 * 1024 * 1024 * 1024;

const logger = getLogger(LogCategories.SYSTEM.UPGRADE);

type LegacySandboxProviderType = 'sealosdevbox' | 'opensandbox';

/**
 * 构造历史 `.zip` 冷归档对象键（仅用于 4.18.0 系统升级转码与升级后清理）。
 */
export const buildLegacySandboxZipKey = (sandboxId: string): string =>
  `sandbox/archive/${sandboxId}/package.zip`;

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

/**
 * 仅在当前调用方已持有 `withSandboxLease(sandboxId)` 锁内执行历史 `package.zip` -> `.tar.zst` 转码与 CAS 提交。
 *
 * - 通过 `resolveStorageZipRangeSource` 获取源 `package.zip` 字节长度并强校验 4 GiB 上限，全程基于 S3 HTTP Range 按需分块读取，不落盘宿主机 `os.tmpdir()`。
 * - 复用 `iterateRemoteZipAsTarEntries` 规范化路径、拒绝加密条目并跳过特殊节点，额外剔除 `lost+found`、`.fastgpt-sandbox-*` 与原子临时文件，统一加 `workspace/` 前缀并原样保留 POSIX 符号链接及用户依赖缓存。
 * - 经合法 `package.zip` 校验为空工作区（如 22 字节空 ZIP）时以 `sizeBytes: 0` 提交 `.tar.zst` 元数据，跳过 S3 上传；源 `package.zip` 缺失时直接抛错并保留旧卷与恢复信息。
 * - 严格保留旧 `package.zip`，交由后续独立清理任务二次核验后再删除。
 */
export async function transcodeLegacyZipArchiveWithinLease(params: {
  current: SandboxMigrationDoc;
  signal?: AbortSignal;
  lease: RedisLeaseContext;
}): Promise<'migrated' | 'skipped'> {
  const { current, signal, lease } = params;
  const effectiveSignal = signal ? AbortSignal.any([signal, lease.signal]) : lease.signal;
  if (isSandboxRecordMigrated(current)) {
    return 'skipped';
  }

  const s3Source = getS3SandboxSource();
  const legacyKey = buildLegacySandboxZipKey(current.sandboxId);
  const generation = randomUUID().replaceAll('-', '').slice(0, 12);
  const objectKey = buildSandboxArchiveObjectKey(current.sandboxId, generation);

  async function* prefixWorkspaceEntries(
    first: TarEntry,
    rest: AsyncGenerator<TarEntry>
  ): AsyncGenerator<TarEntry> {
    const withWorkspacePrefix = (entry: TarEntry): TarEntry => ({
      ...entry,
      path: `workspace/${entry.path}`
    });
    try {
      yield withWorkspacePrefix(first);
      for await (const entry of rest) {
        yield withWorkspacePrefix(entry);
      }
    } finally {
      await rest.return?.(undefined);
    }
  }

  const archive = await (async () => {
    effectiveSignal.throwIfAborted();
    // 旧协议即使空工作区也会上传真实的 22 字节 EMPTY_ZIP_BUFFER；源 ZIP 缺失不能证明工作区为空，必须直接失败并保留旧卷与恢复信息。
    const rangeSource = await resolveStorageZipRangeSource({
      bucket: s3Source,
      key: legacyKey,
      maxZipBytes: MAX_LEGACY_ZIP_BYTES,
      label: 'Legacy sandbox zip'
    });
    effectiveSignal.throwIfAborted();

    const entriesIter = iterateRemoteZipAsTarEntries({
      totalSize: rangeSource.totalSize,
      readRange: rangeSource.readRange,
      signal: effectiveSignal,
      maxEntries: MAX_LEGACY_ZIP_ENTRIES,
      maxUncompressedBytes: MAX_LEGACY_ZIP_UNCOMPRESSED_BYTES,
      shouldSkip: shouldSkipSandboxArchiveRelPath
    });
    const first = await entriesIter.next();
    if (first.done) {
      return buildTarZstArchiveInfo({
        sandboxId: current.sandboxId,
        generation,
        sizeBytes: 0
      });
    }

    const body = createTarZstStream(prefixWorkspaceEntries(first.value, entriesIter));
    const { sizeBytes } = await s3Source.uploadArchiveStream({
      key: objectKey,
      body,
      signal: effectiveSignal
    });
    return buildTarZstArchiveInfo({
      sandboxId: current.sandboxId,
      generation,
      sizeBytes
    });
  })();

  const previousClaimName = getSessionVolumeClaimName(current.storage);
  const shouldCleanOpenSandboxRuntime =
    current.provider === 'opensandbox' &&
    (Boolean(current.instanceId) ||
      current.status === SandboxInstanceStatusEnum.restoring ||
      current.status === SandboxInstanceStatusEnum.archiving);

  let commitStarted = false;
  try {
    if (current.provider === 'opensandbox') {
      // 必须在 CAS 发布 archived 前完成残留容器与旧 PVC 清理，防止锁失效后继请求唤醒的新容器被旧 worker 误删。
      if (shouldCleanOpenSandboxRuntime) {
        effectiveSignal.throwIfAborted();
        let client: Awaited<ReturnType<typeof createOpenSandboxResourceClient>> | undefined;
        try {
          client = await createOpenSandboxResourceClient({
            sandboxId: current.sandboxId,
            instanceId: current.instanceId
          });
          await client.delete(undefined, { signal: effectiveSignal });
        } catch (err) {
          if (effectiveSignal.aborted) {
            throw err;
          }
          logger.warn(
            'Best-effort OpenSandbox container cleanup before zip transcode commit failed',
            {
              sandboxId: current.sandboxId,
              error: err
            }
          );
        } finally {
          if (client) {
            await disconnectSandbox(client);
          }
        }
      }

      if (previousClaimName) {
        effectiveSignal.throwIfAborted();
        try {
          await deleteSessionVolume(previousClaimName, { allowLegacyUnlabeled: true });
        } catch (err) {
          if (effectiveSignal.aborted) {
            throw err;
          }
          logger.warn('Best-effort legacy PVC cleanup before zip transcode commit failed', {
            sandboxId: current.sandboxId,
            claimName: previousClaimName,
            error: err
          });
        }
      }
    }

    effectiveSignal.throwIfAborted();
    commitStarted = true;
    // 通过状态机互斥 CAS 原子落库；不在此任务删除旧 package.zip，保留回滚与清理期核验依据。
    const committed = await commitMigratedSandboxArchive({ current, archive, lease });
    return committed ? 'migrated' : 'skipped';
  } catch (err) {
    if (!commitStarted && archive.sizeBytes > 0) {
      await s3Source.deleteArchiveObject({ key: archive.objectKey }).catch(() => undefined);
    }
    throw err;
  }
}

/**
 * 获取 `withSandboxLease` 后对历史 `package.zip` 归档执行幂等 `.tar.zst` 转码。
 * 若记录不存在、已迁移、或所属应用/Skill 已软删除，则显式跳过。
 */
export async function transcodeLegacyZipArchive(params: {
  sandboxId: string;
  signal?: AbortSignal;
}): Promise<'migrated' | 'skipped'> {
  return await withSandboxLease({
    sandboxId: params.sandboxId,
    label: `migrate-zip:${params.sandboxId}`,
    signal: params.signal,
    fn: async (lease) => {
      params.signal?.throwIfAborted();
      lease.assertValid();
      const current = await MongoSandboxInstance.collection.findOne<SandboxMigrationDoc>({
        sandboxId: params.sandboxId
      });
      if (!current || isSandboxRecordMigrated(current)) {
        return 'skipped';
      }
      if (!(await isSandboxSourceActive(current))) {
        return 'skipped';
      }

      return await transcodeLegacyZipArchiveWithinLease({
        current,
        signal: params.signal,
        lease
      });
    }
  });
}
