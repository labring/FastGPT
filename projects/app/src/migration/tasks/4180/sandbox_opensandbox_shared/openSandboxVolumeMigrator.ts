import { randomUUID } from 'node:crypto';
import { OPEN_SANDBOX_DEFAULT_ROOT_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import { SANDBOX_WORKSPACE_VOLUME_NAME } from '@fastgpt/global/core/ai/sandbox/volume';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  buildSandboxArchiveObjectKey,
  getS3SandboxSource
} from '@fastgpt/service/common/s3/sources/sandbox';
import { packSandboxDirectory } from '@fastgpt/service/core/ai/sandbox/application/ideAgent';
import { withSandboxLease } from '@fastgpt/service/core/ai/sandbox/application/lease';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  createOpenSandboxResourceClient,
  createRuntimeOpenSandboxClient,
  disconnectSandbox
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox';
import {
  assertSessionVolumeExists,
  deleteSessionVolume,
  getSessionVolumeClaimName
} from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';
import {
  isLegacyOpenSandboxVolumeLayout,
  isSandboxRecordMigrated,
  needsLegacyZipTranscode
} from '@fastgpt/service/core/ai/sandbox/legacy';
import { SANDBOX_PROVIDER } from '@fastgpt/service/core/ai/sandbox/type';
import {
  buildTarZstArchiveInfo,
  commitMigratedSandboxArchive,
  isSandboxSourceActive
} from './utils';
import { transcodeLegacyZipArchiveWithinLease, type SandboxMigrationDoc } from './zipTranscoder';

const logger = getLogger(LogCategories.SYSTEM.UPGRADE);

// 临时容器将旧 `/workspace` 卷挂在 `/home/sandbox/workspace`，通过白名单仅打包 `workspace/`（并跳过旧卷根 `lost+found`），
// 避免混入镜像 `$HOME` 默认文件，同时保证所有旧工作区文件统一落于 `workspace/` 前缀下。
const LEGACY_VOLUME_PACK_EXCLUDE_PATTERNS = ['/*', '!/workspace', '/workspace/lost+found/'];

/**
 * 将 4.18.0 之前挂在 `/workspace` 的存量 OpenSandbox 持久卷迁移为 `workspace/` 前缀的 `.tar.zst` 冷归档。
 *
 * 迁移完成后下次唤醒会自动按新布局挂载 `/home/sandbox` 持久卷并解压到 `/home/sandbox/workspace`，
 * 避免运行期同时维护 `/workspace` 与 `/home/sandbox` 两套挂卷逻辑。
 */
export async function migrateLegacyOpenSandboxVolume(params: {
  sandboxId: string;
  signal?: AbortSignal;
}): Promise<'migrated' | 'skipped'> {
  const { sandboxId, signal } = params;

  return await withSandboxLease({
    sandboxId,
    label: `migration-legacy-opensandbox-volume:${sandboxId}`,
    signal,
    fn: async (lease) => {
      const effectiveSignal = signal ? AbortSignal.any([signal, lease.signal]) : lease.signal;
      const current = await MongoSandboxInstance.collection.findOne<SandboxMigrationDoc>({
        provider: SANDBOX_PROVIDER,
        sandboxId
      });
      if (!current || isSandboxRecordMigrated(current) || !(await isSandboxSourceActive(current))) {
        return 'skipped';
      }

      // 若记录同时等待旧 `.zip` 转码（例如旧 `restoring` 残留），优先从权威 S3 `package.zip` 转码。
      if (needsLegacyZipTranscode(current)) {
        return await transcodeLegacyZipArchiveWithinLease({
          current,
          signal: effectiveSignal,
          lease
        });
      }

      if (!isLegacyOpenSandboxVolumeLayout(current)) {
        return 'skipped';
      }

      const claimName = getSessionVolumeClaimName(current.storage);
      if (!claimName) {
        throw new Error(
          `Legacy OpenSandbox record ${sandboxId} is missing workspace volume claimName`
        );
      }

      // 在停止旧运行容器前先只读核验旧卷存在，绝不通过 ensure 隐式新建空卷并据此提交 sizeBytes: 0 归档。
      await assertSessionVolumeExists(claimName, { allowLegacyUnlabeled: true });

      const generation = randomUUID().replaceAll('-', '').slice(0, 12);

      // 先停止并释放绑定在旧布局上的原容器，避免并发写盘或 RWO PVC 挂载冲突。
      if (current.instanceId || current.status !== SandboxInstanceStatusEnum.stopped) {
        let existingClient: Awaited<ReturnType<typeof createOpenSandboxResourceClient>> | undefined;
        try {
          existingClient = await createOpenSandboxResourceClient({
            sandboxId,
            instanceId: current.instanceId
          });
          await existingClient.delete(undefined, { signal: effectiveSignal });
        } finally {
          if (existingClient) {
            await disconnectSandbox(existingClient);
          }
        }
      }

      const tempSandbox = createRuntimeOpenSandboxClient({
        sandboxId,
        volumes: [
          {
            name: SANDBOX_WORKSPACE_VOLUME_NAME,
            pvc: {
              claimName,
              createIfNotExists: false,
              deleteOnSandboxTermination: false
            },
            mountPath: OPEN_SANDBOX_DEFAULT_ROOT_PATH
          }
        ],
        createConfig: { metadata: { archive: 'true' } }
      });

      const s3Source = getS3SandboxSource();
      const objectKey = buildSandboxArchiveObjectKey(sandboxId, generation);
      let archive: ReturnType<typeof buildTarZstArchiveInfo> | undefined;

      try {
        lease.assertValid();
        await tempSandbox.ensureRunning({ signal: effectiveSignal });
        const body = await packSandboxDirectory({
          sandbox: tempSandbox,
          excludePatterns: LEGACY_VOLUME_PACK_EXCLUDE_PATTERNS,
          assertValid: () => lease.assertValid(),
          signal: effectiveSignal
        });
        if (!body) {
          archive = buildTarZstArchiveInfo({ sandboxId, generation, sizeBytes: 0 });
        } else {
          lease.assertValid();
          const { sizeBytes } = await s3Source.uploadArchiveStream({
            key: objectKey,
            body,
            signal: effectiveSignal
          });
          if (sizeBytes <= 0) {
            await s3Source.deleteArchiveObject({ key: objectKey }).catch(() => undefined);
            throw new Error(`Received empty archive stream for legacy volume ${sandboxId}`);
          }
          archive = buildTarZstArchiveInfo({ sandboxId, generation, sizeBytes });
        }
      } finally {
        await tempSandbox
          .delete(undefined, { signal: AbortSignal.timeout(30_000) })
          .catch(() => undefined);
        await disconnectSandbox(tempSandbox);
      }

      // 先原子提交 Mongo `archived` 指向新 `.tar.zst`，确认落库后再删除旧 PVC，保证无数据丢失窗口。
      const committed = await commitMigratedSandboxArchive({ current, archive, lease });
      if (!committed) {
        return 'skipped';
      }

      try {
        await deleteSessionVolume(claimName, { allowLegacyUnlabeled: true });
      } catch (error) {
        logger.warn('Best-effort legacy OpenSandbox volume cleanup after migration failed', {
          sandboxId,
          claimName,
          error
        });
      }
      return 'migrated';
    }
  });
}
