/**
 * Sandbox Workspace 纯 `.tar.zst` 流式归档与恢复。
 *
 * - 远端副作用始终在 Lifecycle Lease 内、Mongo operation 抢占之后执行。
 * - 通过容器 `fastgpt-ide-agent` 的 `/archive/pack` 与 `/archive/extract` 流式打包/解压，
 *   容器 `/tmp` 零落盘，主站侧以常量级分片缓冲流式对接 S3；归档内容是用户自己的工作区，不做额外内容校验。
 * - 使用代次 S3 键实现 Copy-on-Write，提交新代次后再异步清理被取代的旧 S3 归档。
 */
import { randomUUID } from 'node:crypto';
import { subDays } from 'date-fns';
import { RedisLeaseUnavailableError, type RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { extractToSandboxDirectory, packSandboxDirectory } from './ideAgent';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import {
  buildSandboxArchiveObjectKey,
  getS3SandboxSource
} from '../../../../common/s3/sources/sandbox';
import { getAgentSandboxCommonConfig } from '../config';
import { SANDBOX_ARCHIVE_CONCURRENCY, SandboxInstanceStatusEnum } from '../constants';
import {
  createSandboxResourcesToArchiveCursor,
  findSandboxInstanceBySandboxId,
  type SandboxResourceDoc
} from '../infrastructure/instance/repository';
import { getOpenSandboxRuntimeConfig } from '../infrastructure/opensandbox/config';
import {
  createRuntimeOpenSandboxClient,
  disconnectSandbox,
  type OpenSandboxClient
} from '../infrastructure/opensandbox/opensandbox';
import type { SandboxCreateSpec } from '../infrastructure/opensandbox/type';
import {
  buildVolumeConfig,
  createSessionVolumeClaimName,
  deleteSessionVolume,
  getSessionVolumeClaimName,
  getSessionVolumeConfig
} from '../infrastructure/volume/service';
import type {
  SandboxArchiveInfoType,
  SandboxInstanceSchemaType,
  SandboxStorageType
} from '../type';
import { withSandboxLease } from './lease';
import { SandboxOperationConflictError } from './lifecycle/error';
import { runSandboxLifecycleOperation, type SandboxLifecycleDefinition } from './lifecycle/runner';
import { canResumeSandboxOperation } from './lifecycle/utils';
import { deleteOpenSandboxContainer } from './resource';
import { normalizeSandboxImage } from './runtime/image';
import type { OwnedSandboxResource } from './runtime/type';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

type SandboxArchiveSingleResult =
  | { status: 'success'; resource: SandboxResourceDoc }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

/** 归档临时连接不刷新运行态 `lastActiveAt`，直接以现有 `claimName` 确保容器可用。 */
async function connectSandboxForArchive({
  resource,
  assertValid,
  signal,
  operationId
}: {
  resource: SandboxResourceDoc;
  assertValid: () => void;
  signal: AbortSignal;
  operationId?: string;
}): Promise<OpenSandboxClient> {
  const claimName = getSessionVolumeClaimName(resource.storage);
  if (!claimName) {
    throw new Error(`OpenSandbox ${resource.sandboxId} has no persisted workspace claimName`);
  }
  const vmConfig = await getSessionVolumeConfig(claimName);
  const sandbox = createRuntimeOpenSandboxClient({
    sandboxId: resource.sandboxId,
    remoteSandboxId: resource.instanceId,
    volumes: vmConfig.volumes,
    createConfig: { metadata: { archive: 'true' } }
  });
  assertValid();
  await sandbox.ensureRunning({ signal, operationId });
  return sandbox;
}

/** 仅删除 Mongo 中明确登记的 workspace PVC，不按前缀猜测其他 generation。 */
async function deleteSandboxVolumeResource(resource: SandboxResourceDoc) {
  const claimName = getSessionVolumeClaimName(resource.storage);
  if (!claimName) return;
  await deleteSessionVolume(claimName);
}

/**
 * 把沙盒 `$HOME`（包含 `workspace/` 与用户安装的依赖/配置）整包流式打包为 `.tar.zst` 并上传至 S3 新代次键。
 *
 * 仅在目录完全为空（agent 返回 `204`）时返回 `sizeBytes: 0` 且不上传。
 */
export async function createAndUploadWorkspaceArchive(params: {
  sandbox: OpenSandboxClient;
  sandboxId: string;
  assertValid: () => void;
  signal: AbortSignal;
  excludePatterns?: string[];
}): Promise<SandboxArchiveInfoType> {
  const { signal, sandbox, sandboxId, excludePatterns } = params;
  const generation = randomUUID().replaceAll('-', '').slice(0, 12);
  const objectKey = buildSandboxArchiveObjectKey(sandboxId, generation);
  const archiveInfo = (sizeBytes: number): SandboxArchiveInfoType => ({
    objectKey,
    generation,
    format: 'tar.zst',
    sizeBytes,
    archivedAt: new Date()
  });

  const body = await packSandboxDirectory({
    sandbox,
    excludePatterns,
    assertValid: params.assertValid,
    signal
  });
  if (!body) return archiveInfo(0);

  params.assertValid();
  const { sizeBytes } = await getS3SandboxSource().uploadArchiveStream({
    key: objectKey,
    body,
    signal
  });
  if (sizeBytes <= 0) {
    await getS3SandboxSource()
      .deleteArchiveObject({ key: objectKey })
      .catch(() => undefined);
    throw new Error(`Received empty archive stream for sandbox ${sandboxId}`);
  }
  return archiveInfo(sizeBytes);
}

/**
 * 把 S3 `.tar.zst` 归档流式解压到新建的空 `$HOME` PVC。
 *
 * 恢复目标总是本次 `restoring` 新分配的空卷，因此空归档无需任何操作；同一阶段重试时重复解压同一归档是幂等的。
 */
async function restoreWorkspaceArchive(params: {
  sandbox: OpenSandboxClient;
  sandboxId: string;
  archive: SandboxArchiveInfoType;
  assertValid: () => void;
  signal: AbortSignal;
}) {
  const { sandbox, sandboxId, archive, signal } = params;
  if (archive.sizeBytes === 0) return;

  await extractToSandboxDirectory({
    sandbox,
    openBody: () =>
      getS3SandboxSource().downloadArchiveStream({ key: archive.objectKey, sandboxId, signal }),
    assertValid: params.assertValid,
    signal
  });
  logger.info('Sandbox home restored from .tar.zst archive', {
    sandboxId,
    generation: archive.generation
  });
}

/** 在已持有的 Sandbox Lease 内执行归档流水线（上传 `.tar.zst` 到 S3、销毁容器并删除 PVC）。 */
export async function archiveSandboxResourceWithinLease(params: {
  resource: SandboxResourceDoc;
  lease: RedisLeaseContext;
  inactiveBefore?: Date;
  now?: Date;
}): Promise<SandboxArchiveSingleResult> {
  const { lease } = params;
  const current = params.resource;
  if (current.status === SandboxInstanceStatusEnum.archived) {
    return { status: 'success', resource: current };
  }
  if (
    params.inactiveBefore &&
    (current.status !== SandboxInstanceStatusEnum.stopped ||
      current.lastActiveAt >= params.inactiveBefore)
  ) {
    return { status: 'skipped', reason: 'Resource became active or changed state' };
  }
  if (
    current.status !== SandboxInstanceStatusEnum.running &&
    current.status !== SandboxInstanceStatusEnum.stopped &&
    current.status !== SandboxInstanceStatusEnum.archiving
  ) {
    return { status: 'skipped', reason: `Sandbox is ${current.status}` };
  }
  if (
    current.status === SandboxInstanceStatusEnum.archiving &&
    !canResumeSandboxOperation(current, params.now)
  ) {
    return { status: 'skipped', reason: 'Sandbox archive operation is still active' };
  }

  const startedFromStopped =
    current.status === SandboxInstanceStatusEnum.stopped ||
    (current.status === SandboxInstanceStatusEnum.archiving &&
      current.operation?.previousStatus === SandboxInstanceStatusEnum.stopped &&
      current.operation?.phase === 'claimed');

  let sandbox: OpenSandboxClient | undefined;
  let reachedArchiveUploaded = false;
  let containerDeleted = false;
  try {
    const definition: SandboxLifecycleDefinition = {
      status: SandboxInstanceStatusEnum.archiving,
      steps: [
        {
          fromPhase: 'claimed',
          toPhase: 'archiveUploaded',
          run: async ({ resource: claimed, operationId, assertValid }) => {
            sandbox = await connectSandboxForArchive({
              resource: claimed,
              assertValid,
              signal: lease.signal,
              operationId
            });
            assertValid();
            const archiveInfo = await createAndUploadWorkspaceArchive({
              sandbox,
              sandboxId: claimed.sandboxId,
              signal: lease.signal,
              assertValid
            });
            return {
              storage: {
                ...(claimed.storage ?? {}),
                archive: archiveInfo
              },
              ...(sandbox.id ? { instanceId: sandbox.id } : {})
            };
          }
        },
        {
          fromPhase: 'archiveUploaded',
          toPhase: 'providerDeleted',
          run: async ({ resource: claimed, lease: stepLease }) => {
            reachedArchiveUploaded = true;
            if (sandbox) {
              await sandbox.delete({ signal: stepLease.signal });
            } else {
              await deleteOpenSandboxContainer({
                sandboxId: claimed.sandboxId,
                instanceId: claimed.instanceId,
                signal: stepLease.signal
              });
            }
            containerDeleted = true;
          }
        },
        {
          fromPhase: 'providerDeleted',
          toPhase: 'volumeDeleted',
          run: async ({ resource: claimed }) => {
            await deleteSandboxVolumeResource(claimed);
          }
        }
      ],
      finish: {
        type: 'complete',
        status: SandboxInstanceStatusEnum.archived,
        set: ({ resource: claimed }) => ({
          storage: claimed.storage?.archive ? { archive: claimed.storage.archive } : undefined
        }),
        unset: ['instanceId']
      }
    };

    const completed = await runSandboxLifecycleOperation({
      resource: current,
      lease,
      definition,
      claim: { type: 'claim', matchLastActiveAt: Boolean(params.inactiveBefore) }
    });

    try {
      await getS3SandboxSource().deleteSupersededSandboxArchives({
        sandboxId: completed.sandboxId,
        keepObjectKey: completed.storage?.archive?.objectKey,
        signal: lease.signal
      });
    } catch (error) {
      logger.warn('Failed to cleanup superseded sandbox archive objects', {
        sandboxId: completed.sandboxId,
        keepObjectKey: completed.storage?.archive?.objectKey,
        error
      });
    }

    return { status: 'success', resource: completed };
  } catch (error) {
    if (error instanceof SandboxOperationConflictError) {
      return { status: 'skipped', reason: 'Resource was modified or occupied' };
    }
    if (
      startedFromStopped &&
      sandbox &&
      !reachedArchiveUploaded &&
      !containerDeleted &&
      !lease.signal.aborted
    ) {
      await sandbox.stop().catch(() => undefined);
    }
    const errorText = getErrText(error);
    logger.error('Failed to archive sandbox', {
      sandboxId: current.sandboxId,
      provider: current.provider,
      error
    });
    return { status: 'failed', error: errorText };
  } finally {
    if (sandbox) await disconnectSandbox(sandbox);
  }
}

/** 公开入口取得锁后重读；锁内编排直接消费当前快照，避免重复查询。 */
async function readAndArchiveSandbox(params: {
  resource: SandboxResourceDoc;
  lease: RedisLeaseContext;
  inactiveBefore?: Date;
  now?: Date;
}): Promise<SandboxArchiveSingleResult> {
  const resource = await findSandboxInstanceBySandboxId({ sandboxId: params.resource.sandboxId });
  if (!resource) {
    return { status: 'skipped', reason: 'Sandbox record no longer exists' };
  }
  return archiveSandboxResourceWithinLease({ ...params, resource });
}

/** 归档单个 sandbox：传入 `inactiveBefore` 时仅处理超过非活跃窗口的 stopped 记录，省略时立即执行/接管。 */
export async function archiveSandboxResource(
  resource: SandboxResourceDoc,
  inactiveBefore?: Date
): Promise<SandboxArchiveSingleResult> {
  try {
    return await withSandboxLease({
      sandboxId: resource.sandboxId,
      label: `archive-sandbox${inactiveBefore ? '' : '-now'}:${resource.sandboxId}`,
      waitTimeoutMs: 0,
      fn: (lease) => readAndArchiveSandbox({ resource, lease, inactiveBefore })
    });
  } catch (error) {
    if (error instanceof RedisLeaseUnavailableError) {
      return {
        status: 'skipped',
        reason: inactiveBefore ? 'Sandbox lease is held by foreground' : 'Sandbox lease is held'
      };
    }
    throw error;
  }
}

/** 流式归档全部 inactive 候选，受 `SANDBOX_ARCHIVE_CONCURRENCY` 限制防止风暴。 */
async function archiveSandboxResources(inactiveBefore: Date) {
  const cursor = createSandboxResourcesToArchiveCursor(inactiveBefore);
  let batch: SandboxResourceDoc[] = [];

  const archiveBatch = async (resources: SandboxResourceDoc[]) => {
    if (resources.length === 0) return;
    await batchRun(
      resources,
      (resource) =>
        archiveSandboxResource(resource, inactiveBefore).catch((error) => {
          logger.error('Failed to execute sandbox archive task', {
            sandboxId: resource.sandboxId,
            provider: resource.provider,
            error
          });
        }),
      SANDBOX_ARCHIVE_CONCURRENCY
    );
  };

  try {
    for await (const resource of cursor) {
      batch.push(resource);
      if (batch.length >= SANDBOX_ARCHIVE_CONCURRENCY) {
        await archiveBatch(batch);
        batch = [];
      }
    }
    await archiveBatch(batch);
  } finally {
    await cursor.close().catch(() => undefined);
  }
}

export async function archiveInactiveSandboxes(now = new Date()) {
  await archiveSandboxResources(subDays(now, getAgentSandboxCommonConfig().archiveInactiveDays));
}

/**
 * 在运行编排已有的 lifecycle lease 内恢复 `.tar.zst` 冷归档。
 *
 * - Step 1 (`claimed -> volumeAssigned`): 生成新 generation PVC `claimName`，同时完整保留 `storage.archive`。
 * - Step 2 (`volumeAssigned -> archiveInstalled`): 建卷起容器，从 S3 流式下载 `.tar.zst` 并校验解压。
 */
export async function restoreArchivedSandboxWithinLease(params: {
  resource: OwnedSandboxResource;
  lease: RedisLeaseContext;
  resourceLimit?: Partial<NonNullable<SandboxInstanceSchemaType['limit']>>;
  createConfig?: SandboxCreateSpec;
}) {
  const { resource, lease } = params;
  const archive = resource.storage?.archive;
  if (archive?.format !== 'tar.zst') {
    throw new Error(`Sandbox ${resource.sandboxId} has no valid tar.zst archive metadata`);
  }

  const runtimeImage = normalizeSandboxImage(
    getOpenSandboxRuntimeConfig({
      createConfig: params.createConfig
    }).image
  );
  let sandbox: OpenSandboxClient | undefined;
  try {
    return await runSandboxLifecycleOperation({
      resource,
      lease,
      claim: { type: 'claim', previousStatus: 'archived' },
      definition: {
        status: 'restoring',
        steps: [
          {
            fromPhase: 'claimed',
            toPhase: 'volumeAssigned',
            run: async ({ resource: claimed }) => {
              const claimName = createSessionVolumeClaimName({ sandboxId: claimed.sandboxId });
              const volumeResult = buildVolumeConfig(claimName);
              const nextStorage: SandboxStorageType = {
                ...volumeResult.storage,
                archive
              };
              return {
                storage: nextStorage,
                ...(runtimeImage ? { image: runtimeImage } : {}),
                ...(params.resourceLimit ? { limit: params.resourceLimit } : {})
              };
            }
          },
          {
            fromPhase: 'volumeAssigned',
            toPhase: 'archiveInstalled',
            run: async ({ resource: claimed, operationId, assertValid }) => {
              const claimName = getSessionVolumeClaimName(claimed.storage);
              if (!claimName) {
                throw new Error(
                  `OpenSandbox ${claimed.sandboxId} has no assigned workspace claimName`
                );
              }

              const vmConfig = await getSessionVolumeConfig(claimName);
              assertValid();
              sandbox = createRuntimeOpenSandboxClient({
                sandboxId: claimed.sandboxId,
                volumes: vmConfig.volumes,
                createConfig: params.createConfig
              });
              await sandbox.ensureRunning({ signal: lease.signal, operationId });
              assertValid();
              await restoreWorkspaceArchive({
                sandbox,
                sandboxId: claimed.sandboxId,
                archive,
                signal: lease.signal,
                assertValid
              });
              return sandbox.id ? { instanceId: sandbox.id } : undefined;
            }
          }
        ],
        finish: { type: 'complete', status: 'running', touchActive: true }
      }
    });
  } finally {
    if (sandbox) await disconnectSandbox(sandbox);
  }
}
