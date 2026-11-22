/**
 * 沙盒运行期历史兼容隔离层（4.18.0 过渡期保留）。
 *
 * 移除窗口（>= 4.19.0）：
 * 待 4.18.0 迁移（`20261117_migrate_sandbox_to_opensandbox`）与清理任务
 * （`20261117_cleanup_legacy_sandbox_resources`）全部执行完成，线上再无旧 Devbox、
 * `.zip` 归档、无 generation/无标签存量卷及旧 Preview 会话后，整体删除 `legacy/` 目录
 * 以及跨服务的 `allowLegacyUnlabeled` 与 `agent-sandbox-proxy` `preview.rs` 旧路由解析。
 */
import type { SandboxInfo as SdkSandboxInfo, SandboxManager } from '@alibaba-group/opensandbox';
import { asRedisLogicalKey } from '@fastgpt/dal/redis/adapter';
import { throwIfAborted } from '@fastgpt/global/common/system/utils';
import {
  OPEN_SANDBOX_DEFAULT_HOME_PATH,
  OPEN_SANDBOX_DEFAULT_ROOT_PATH
} from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxVolumeNameSchema } from '@fastgpt/global/core/ai/sandbox/volume';
import z from 'zod';
import { buildSandboxArchiveObjectKey } from '../../../../common/s3/sources/sandbox';
import { SANDBOX_ARCHIVING_ROLLBACK_PHASES, SandboxInstanceStatusEnum } from '../constants';
import { createAgentSandboxMigrationInProgressError } from '../error';
import {
  SANDBOX_PROVIDER,
  type SandboxInstanceStatusType,
  type SandboxProviderType,
  type SandboxStorageType
} from '../type';

export const LEGACY_DEVBOX_PROVIDER = 'sealosdevbox' as const;
export const LEGACY_ROLLBACK_PROVIDER_DELETED_PHASE = 'rollbackProviderDeleted' as const;
export const LEGACY_DELETED_ARCHIVE_GENERATION = 'deleted' as const;
export const LEGACY_RESTORE_CLEANUP_PHASES = [
  'previousProviderDeleted',
  'previousVolumeDeleted'
] as const;
const LEGACY_SANDBOX_PROVIDERS: ReadonlyArray<SandboxProviderType | typeof LEGACY_DEVBOX_PROVIDER> =
  [SANDBOX_PROVIDER, LEGACY_DEVBOX_PROVIDER];
const LegacySandboxPreviewSandboxIdSchema = z.string().regex(/^(?:app|skilledit)-[a-f0-9]{16}$/);

type LegacyMigrationCheckRecord = {
  provider: string;
  status: SandboxInstanceStatusType | string;
  storage?: SandboxStorageType | null;
  operation?: {
    type?: string;
    phase?: string;
  } | null;
};

/** 兼容匹配当前 OpenSandbox 与迁移期遗留 `sealosdevbox` 记录，命中 `{ provider: 1, sandboxId: 1 }` 索引前缀。 */
export const buildLegacySandboxProviderFilter = (provider?: SandboxProviderType) =>
  provider ?? { $in: LEGACY_SANDBOX_PROVIDERS };

/** 仅当 `opensandbox` `archiving` 记录仍持有 PVC 且处于可回滚/已占用的活跃阶段时才允许恢复。 */
export const isRecoverableOpenSandboxArchiving = (
  resource: Pick<LegacyMigrationCheckRecord, 'storage' | 'operation'>
): boolean => {
  const phase = resource.operation?.phase;
  return (
    Boolean(resource.storage?.volumes?.length) &&
    resource.operation?.type === 'archive' &&
    SANDBOX_ARCHIVING_ROLLBACK_PHASES.some((recoverablePhase) => recoverablePhase === phase)
  );
};

const LEGACY_WORKSPACE_PATH = '/workspace';

/** 兼容历史上工具或旧数据传入的 `/workspace/...` 绝对路径（镜像内保留 `/workspace -> /home/sandbox/workspace` 软链）。 */
export const normalizeLegacyWorkspacePath = (filePath: string, workDirectory: string): string =>
  workDirectory === OPEN_SANDBOX_DEFAULT_ROOT_PATH &&
  (filePath === LEGACY_WORKSPACE_PATH || filePath.startsWith(`${LEGACY_WORKSPACE_PATH}/`))
    ? `${workDirectory}${filePath.slice(LEGACY_WORKSPACE_PATH.length)}`
    : filePath;

/** 判断 `archiving` 记录是否卡在未迁为 `.tar.zst` 的旧归档格式上且不在活跃可恢复阶段。 */
export const isLegacyArchivingAwaitingMigration = (
  resource: Pick<LegacyMigrationCheckRecord, 'status' | 'storage' | 'operation'>
): boolean =>
  resource.status === SandboxInstanceStatusEnum.archiving &&
  resource.storage?.archive?.format !== 'tar.zst' &&
  !isRecoverableOpenSandboxArchiving(resource);

/** 判断记录是否等待从历史 S3 `package.zip` 转码为 `.tar.zst`（包含 `archived`、`restoring` 及非可恢复 `archiving`）。 */
export const needsLegacyZipTranscode = (
  resource: Pick<LegacyMigrationCheckRecord, 'status' | 'storage' | 'operation'>
): boolean =>
  ((resource.status === SandboxInstanceStatusEnum.archived ||
    resource.status === SandboxInstanceStatusEnum.restoring) &&
    resource.storage?.archive?.format !== 'tar.zst') ||
  isLegacyArchivingAwaitingMigration(resource);

/** 判断存量 OpenSandbox 持久卷是否仍使用 4.18.0 之前的 `/workspace` 挂载布局。 */
export const isLegacyOpenSandboxVolumeLayout = (
  resource: Pick<LegacyMigrationCheckRecord, 'provider' | 'status' | 'storage'>
): boolean => {
  if (
    resource.provider !== SANDBOX_PROVIDER ||
    resource.status === SandboxInstanceStatusEnum.archived ||
    !resource.storage?.volumes?.length
  ) {
    return false;
  }
  const topMountPath = resource.storage.mountPath;
  const volumeMountPath = resource.storage.volumes[0]?.mountPath;
  return (
    (Boolean(topMountPath) && topMountPath !== OPEN_SANDBOX_DEFAULT_HOME_PATH) ||
    (Boolean(volumeMountPath) && volumeMountPath !== OPEN_SANDBOX_DEFAULT_HOME_PATH)
  );
};

/** 判断实例记录是否已满足 4.18.0 运行门禁（`provider === 'opensandbox'`、无旧 `.zip` 归档且无旧 `/workspace` 挂卷）。 */
export const isSandboxRecordMigrated = (resource: LegacyMigrationCheckRecord): boolean => {
  if (resource.provider !== SANDBOX_PROVIDER) return false;
  if (needsLegacyZipTranscode(resource)) return false;
  return !isLegacyOpenSandboxVolumeLayout(resource);
};

/** 存量迁移门禁：未转为 OpenSandbox + `.tar.zst` 的旧记录统一返回 409，阻止误建空 PVC 或跨端双写。 */
export function assertSandboxMigratedOrThrow(resource?: LegacyMigrationCheckRecord | null): void {
  if (!resource) return;
  if (!isSandboxRecordMigrated(resource)) {
    throw createAgentSandboxMigrationInProgressError();
  }
}

/** 归档、恢复或回滚重写 `storage` 时保留未清理的旧 Devbox 指针。 */
export const extractLegacySandboxStorageFields = (
  storage?: { legacyDevboxPendingCleanup?: boolean } | null
): { legacyDevboxPendingCleanup?: true } =>
  storage?.legacyDevboxPendingCleanup ? { legacyDevboxPendingCleanup: true } : {};

/** 还原失败回滚到 `archived` 时，保留尚未清理的 `legacyDevboxPendingCleanup` 指针。 */
export const buildLegacyArchivedRollbackStorage = (
  storage?: SandboxStorageType | null
): SandboxStorageType | undefined => {
  if (!storage?.archive) return undefined;
  return {
    archive: storage.archive,
    ...extractLegacySandboxStorageFields(storage)
  };
};

/** 构造 `deleting -> archived` 墓碑终态提交配置，仅保留占位归档与 `legacyDevboxPendingCleanup`。 */
export const buildLegacyDevboxTombstoneFinish = (sandboxId: string) => ({
  type: 'complete' as const,
  status: SandboxInstanceStatusEnum.archived,
  set: {
    storage: {
      archive: {
        objectKey: buildSandboxArchiveObjectKey(sandboxId, LEGACY_DELETED_ARCHIVE_GENERATION),
        generation: LEGACY_DELETED_ARCHIVE_GENERATION,
        format: 'tar.zst' as const,
        sizeBytes: 0,
        archivedAt: new Date()
      },
      legacyDevboxPendingCleanup: true
    }
  },
  unset: ['instanceId'] as const
});

/**
 * 旧版 restore checkpoint（无 `storage.volumes` 的 `previousProviderDeleted`/`previousVolumeDeleted`/
 * `rollbackProviderDeleted`）需要按确定性命名推导历史 PVC claimName 以便完成清理。
 */
export const resolveLegacyRestoreActivationClaimName = ({
  restoring,
  phase,
  hasClaimedVolume,
  sandboxId,
  volumeNamePrefix
}: {
  restoring: boolean;
  phase: string;
  hasClaimedVolume: boolean;
  sandboxId: string;
  volumeNamePrefix: string;
}): string | undefined => {
  if (!restoring || hasClaimedVolume) return undefined;
  const isLegacyCleanupPhase = LEGACY_RESTORE_CLEANUP_PHASES.some(
    (legacyPhase) => legacyPhase === phase
  );
  if (isLegacyCleanupPhase || phase === LEGACY_ROLLBACK_PROVIDER_DELETED_PHASE) {
    return SandboxVolumeNameSchema.parse(`${volumeNamePrefix}-${sandboxId}`.toLowerCase());
  }
  return undefined;
};

/** 仅允许在显式开启且卷名属于受管前缀时向 volume-manager 透传 `allowLegacyUnlabeled`。 */
export const shouldForwardAllowLegacyUnlabeled = ({
  claimName,
  volumeNamePrefix,
  allowLegacyUnlabeled
}: {
  claimName: string;
  volumeNamePrefix: string;
  allowLegacyUnlabeled?: boolean;
}): boolean =>
  Boolean(allowLegacyUnlabeled && claimName.startsWith(`${volumeNamePrefix.toLowerCase()}-`));

/** 校验按 `sessionId` 访问的存量容器归属：允许缺少 `app` 标签，若携带则必须为 `fastgpt`。 */
export function assertLegacyCompatibleSessionSandboxOwner(
  info: SdkSandboxInfo,
  owner: { sessionId?: string }
): void {
  if (info.metadata?.sessionId !== owner.sessionId) {
    throw new Error(`OpenSandbox ownership mismatch: ${info.id}`);
  }
  if (info.metadata?.app && info.metadata.app !== 'fastgpt') {
    throw new Error(`OpenSandbox ownership mismatch: ${info.id}`);
  }
}

/** 仅按 `sessionId` 查询运行期候选容器，兼容尚未携带 `app: 'fastgpt'` 标签的存量容器。 */
export async function listLegacyCompatibleSandboxesBySessionId(params: {
  manager: SandboxManager;
  sessionId: string;
  isActive: (info: SdkSandboxInfo) => boolean;
  signal?: AbortSignal;
}): Promise<SdkSandboxInfo[]> {
  const { manager, sessionId, isActive, signal } = params;
  const items: SdkSandboxInfo[] = [];

  for (let page = 1; ; page++) {
    throwIfAborted(signal);
    const res = await manager.listSandboxInfos({
      metadata: { sessionId },
      pageSize: 100,
      page
    });
    for (const item of res.items) {
      assertLegacyCompatibleSessionSandboxOwner(item, { sessionId });
      if (isActive(item)) {
        items.push(item);
      }
    }
    if (!res.pagination?.hasNextPage) return items;
  }
}

/** 解析旧版 `<sandboxId>:<sessionId>` Preview 凭证为 Redis key 与 `legacySandboxId` 约束。 */
export function parseLegacySandboxPreviewCredential(params: {
  credential: string;
  keyPrefix: string;
  sessionIdSchema: z.ZodType<string>;
}) {
  const [rawSandboxId, rawSessionId, ...extraSegments] = params.credential.split(':');
  if (extraSegments.length > 0) {
    throw new Error('Invalid sandbox preview session');
  }
  const legacySandboxId = LegacySandboxPreviewSandboxIdSchema.parse(rawSandboxId);
  const sessionId = params.sessionIdSchema.parse(rawSessionId);

  return {
    sessionKey: asRedisLogicalKey(`${params.keyPrefix}:${legacySandboxId}:${sessionId}`),
    legacySandboxId
  };
}
