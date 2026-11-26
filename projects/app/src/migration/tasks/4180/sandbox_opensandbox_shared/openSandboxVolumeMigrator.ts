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
import { assertSessionVolumeExists } from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';
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
 * 在已持有的 `withSandboxLease` 锁内，将 `v2` 中挂有持久卷的存量 OpenSandbox 实例非破坏性导出为 `.tar.zst` 并写入 `v3`。
 *
 * 仅停止旧容器以解除 RWO PVC 占用并创建临时归档容器，全程保留原 `v2` 持久卷供回滚；旧卷由后续清理任务统一回收。
 */
export async function migrateLegacyOpenSandboxVolumeWithinLease(params: {
  current: SandboxMigrationDoc;
  claimName: string;
  signal: AbortSignal;
  lease: RedisLeaseContext;
}): Promise<'migrated' | 'skipped'> {
  const { current, claimName, signal, lease } = params;

  // 在停止旧运行容器前先只读核验旧卷存在，绝不通过 ensure 隐式新建空卷并据此提交 sizeBytes: 0 归档。
  await assertSessionVolumeExists(claimName, { allowLegacyUnlabeled: true, signal });

  const operationId = `migrate-volume-${randomUUID().replaceAll('-', '').slice(0, 12)}`;

  // 先销毁可能挂载了旧 RWO PVC 的原容器以解除独占占用，同时保留 PVC 与 `v2` 记录不变。
  await deleteOpenSandboxContainer({
    sandboxId: current.sandboxId,
    allowLegacyUnlabeled: true,
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

  // 仅写入 `v3` 并保留原 `v2` 记录与旧 PVC，确保清理前可零成本回滚到 4.17.x。
  const committed = await commitMigratedSandboxArchive({ current, archive, lease, signal });
  return committed ? 'migrated' : 'skipped';
}
