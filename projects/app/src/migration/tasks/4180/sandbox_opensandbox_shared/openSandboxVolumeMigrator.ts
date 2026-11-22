import { randomUUID } from 'node:crypto';
import type { RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import { OPEN_SANDBOX_DEFAULT_ROOT_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import { SANDBOX_WORKSPACE_VOLUME_NAME } from '@fastgpt/global/core/ai/sandbox/volume';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { createAndUploadWorkspaceArchive } from '@fastgpt/service/core/ai/sandbox/application/archive';
import { deleteOpenSandboxContainer } from '@fastgpt/service/core/ai/sandbox/application/resource';
import {
  createRuntimeOpenSandboxClient,
  disconnectSandbox
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox';
import {
  assertSessionVolumeExists,
  deleteSessionVolume,
  getSessionVolumeClaimName
} from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';
import type { SandboxArchiveInfoType } from '@fastgpt/service/core/ai/sandbox/type';
import { commitMigratedSandboxArchive, type SandboxMigrationDoc } from './utils';

const logger = getLogger(LogCategories.SYSTEM.UPGRADE);

// 临时容器将旧 `/workspace` 卷挂在 `/home/sandbox/workspace`，通过白名单仅打包 `workspace/`（并跳过旧卷根 `lost+found` 与运行期标记），
// 避免混入镜像 `$HOME` 默认文件，同时保证所有旧工作区文件统一落于 `workspace/` 前缀下。
const LEGACY_VOLUME_PACK_EXCLUDE_PATTERNS = [
  '/*',
  '!/workspace',
  '/workspace/lost+found/',
  '/workspace/.fastgpt-sandbox-*'
];

/**
 * 在已持有的 `withSandboxLease` 锁内，将 4.18.0 之前挂在 `/workspace` 的存量 OpenSandbox 持久卷迁移为 `workspace/` 前缀的 `.tar.zst` 冷归档。
 *
 * 迁移完成后下次唤醒会自动按新布局挂载 `/home/sandbox` 持久卷并解压到 `/home/sandbox/workspace`，
 * 避免运行期同时维护 `/workspace` 与 `/home/sandbox` 两套挂卷逻辑。
 */
export async function migrateLegacyOpenSandboxVolumeWithinLease(params: {
  current: SandboxMigrationDoc;
  signal: AbortSignal;
  lease: RedisLeaseContext;
}): Promise<'migrated' | 'skipped'> {
  const { current, signal, lease } = params;

  const claimName = getSessionVolumeClaimName(current.storage);
  if (!claimName) {
    throw new Error(
      `Legacy OpenSandbox record ${current.sandboxId} is missing workspace volume claimName`
    );
  }

  // 在停止旧运行容器前先只读核验旧卷存在，绝不通过 ensure 隐式新建空卷并据此提交 sizeBytes: 0 归档。
  await assertSessionVolumeExists(claimName, { allowLegacyUnlabeled: true });

  const operationId = `migrate-volume-${randomUUID().replaceAll('-', '').slice(0, 12)}`;

  // 无条件先销毁可能绑定在旧布局上的原容器，避免并发写盘或 RWO PVC 挂载冲突。
  await deleteOpenSandboxContainer({
    sandboxId: current.sandboxId,
    instanceId: current.instanceId,
    signal
  });

  const tempSandbox = createRuntimeOpenSandboxClient({
    sandboxId: current.sandboxId,
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
    createConfig: { metadata: { archive: 'true', operationId } }
  });

  let archive: SandboxArchiveInfoType;
  try {
    lease.assertValid();
    await tempSandbox.ensureRunning({ signal, operationId });
    archive = await createAndUploadWorkspaceArchive({
      sandbox: tempSandbox,
      sandboxId: current.sandboxId,
      assertValid: () => lease.assertValid(),
      signal,
      excludePatterns: LEGACY_VOLUME_PACK_EXCLUDE_PATTERNS
    });
  } finally {
    await tempSandbox.delete({ signal: AbortSignal.timeout(30_000) }).catch((error) => {
      logger.warn('Best-effort temporary migration container cleanup failed', {
        sandboxId: current.sandboxId,
        error
      });
    });
    await disconnectSandbox(tempSandbox);
  }

  // 先原子提交 Mongo `archived` 指向新 `.tar.zst`，确认落库后再删除旧 PVC，保证无数据丢失窗口。
  const committed = await commitMigratedSandboxArchive({ current, archive, lease, signal });
  if (!committed) {
    return 'skipped';
  }

  try {
    await deleteSessionVolume(claimName, { allowLegacyUnlabeled: true });
  } catch (error) {
    logger.warn('Best-effort legacy OpenSandbox volume cleanup after migration failed', {
      sandboxId: current.sandboxId,
      claimName,
      error
    });
  }
  return 'migrated';
}
