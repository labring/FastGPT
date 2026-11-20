/** 创建/恢复/归档失败的收敛流程；请求与 cron 共用同一套持久化回滚与续跑协议。 */
import { RedisLeaseUnavailableError, type RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../../../common/logger';
import { isAgentSandboxOpenSandboxConfigured } from '../../config';
import {
  findSandboxInstanceBySandboxId,
  findStaleSandboxOperations,
  type SandboxResourceDoc
} from '../../infrastructure/instance/repository';
import {
  createOpenSandboxResourceClient,
  disconnectSandbox,
  type OpenSandboxClient
} from '../../infrastructure/opensandbox/opensandbox';
import type { SandboxInfo } from '../../infrastructure/opensandbox/type';
import {
  buildVolumeConfig,
  deleteSessionVolume,
  getSessionVolumeClaimName
} from '../../infrastructure/volume/service';
import { withSandboxLease } from '../lease';
import {
  buildLegacyArchivedRollbackStorage,
  isLegacyArchivingAwaitingMigration,
  isRecoverableOpenSandboxArchiving,
  LEGACY_RESTORE_CLEANUP_PHASES,
  LEGACY_ROLLBACK_PROVIDER_DELETED_PHASE,
  resolveLegacyRestoreActivationClaimName
} from '../../legacy';
import { archiveSandboxResourceWithinLease } from '../archive';
import {
  SANDBOX_ARCHIVE_CONCURRENCY,
  SANDBOX_RESTORE_FORWARD_PHASES,
  SANDBOX_STALE_OPERATION_TIMEOUT_MS,
  SandboxInstanceStatusEnum
} from '../../constants';
import { SandboxLifecycleStateError } from './error';
import { runSandboxLifecycleOperation, type SandboxLifecycleDefinition } from './runner';
import {
  canResumeSandboxOperation,
  isSandboxActivationRecoverable,
  isSandboxActivationRollback,
  SANDBOX_RECOVERABLE_ROLLBACK_PHASES
} from './utils';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

/** 在回滚阶段统一创建/释放 OpenSandbox 资源客户端，并提供容器释放核验与删除步骤构造。 */
async function withRollbackResourceClient<T>({
  resource,
  lease,
  fn
}: {
  resource: Pick<SandboxResourceDoc, 'sandboxId' | 'instanceId'>;
  lease: RedisLeaseContext;
  fn: (ctx: {
    client: OpenSandboxClient;
    getUnreleasedContainer: () => Promise<SandboxInfo | null>;
    assertContainerReleased: () => Promise<void>;
    releaseContainerStep: SandboxLifecycleDefinition['steps'][number];
  }) => Promise<T>;
}): Promise<T> {
  const client = await createOpenSandboxResourceClient({
    sandboxId: resource.sandboxId,
    instanceId: resource.instanceId
  });
  const getUnreleasedContainer = async () => {
    const info = await client.getInfo();
    lease.assertValid();
    if (!info || info.status.state === 'UnExist') return null;
    return info;
  };
  /** 每次提交终态前重查，断点续跑不能仅凭旧清理 checkpoint 释放配额。 */
  const assertContainerReleased = async () => {
    const info = await getUnreleasedContainer();
    if (info) {
      throw new Error(`Sandbox container has not been released: ${info.status.state}`);
    }
  };
  const releaseContainerStep: SandboxLifecycleDefinition['steps'][number] = {
    fromPhase: 'rollbackClaimed',
    toPhase: 'rollbackProviderReleased',
    run: async ({ assertValid, lease: stepLease }) => {
      await client.delete(undefined, { signal: stepLease.signal });
      assertValid();
      await assertContainerReleased();
    }
  };

  try {
    return await fn({
      client,
      getUnreleasedContainer,
      assertContainerReleased,
      releaseContainerStep
    });
  } finally {
    await disconnectSandbox(client);
  }
}

/**
 * 在调用方已有的 Lifecycle Lease 内收敛一条刚重新读取的 `provisioning`/`restoring` 记录。
 * 未到接管时间原样返回；完成远端阶段时优先补交 running，否则先持久化回滚意图。
 * provisioning 保留 PVC 回到 stopped；restoring 只删除目标半成品（容器 + 新建 PVC）并回到 archived 保留 S3。
 * 清理或终态提交失败仍保留活跃过渡态，供下次幂等续跑。
 */
export async function recoverSandboxActivationWithinLease(params: {
  resource: SandboxResourceDoc;
  lease: RedisLeaseContext;
  now?: Date;
}): Promise<SandboxResourceDoc> {
  const { resource, lease } = params;
  lease.assertValid();
  if (!isSandboxActivationRecoverable(resource, params.now)) {
    return resource;
  }
  const restoring = resource.status === SandboxInstanceStatusEnum.restoring;
  const phase = resource.operation?.phase;
  const rollingBack = isSandboxActivationRollback(resource);
  const forwardPhases = restoring
    ? [...SANDBOX_RESTORE_FORWARD_PHASES, ...LEGACY_RESTORE_CLEANUP_PHASES]
    : (['claimed', 'providerEnsured'] as const);
  // 未知阶段禁止降级到 claimed；否则可能把已开始的清理误解释为正向恢复。
  if (
    !phase ||
    (!forwardPhases.some((forwardPhase) => forwardPhase === phase) &&
      !SANDBOX_RECOVERABLE_ROLLBACK_PHASES.some((rollbackPhase) => rollbackPhase === phase))
  ) {
    throw new Error(`Unsupported sandbox activation recovery phase: ${phase}`);
  }

  return withRollbackResourceClient({
    resource,
    lease,
    fn: async ({
      client,
      getUnreleasedContainer,
      assertContainerReleased,
      releaseContainerStep
    }) => {
      // 只查询资源，不调用 ensureRunning，避免后台恢复新建或启动计算资源。
      if (!rollingBack && phase === (restoring ? 'archiveInstalled' : 'providerEnsured')) {
        const info = await client.getInfo();
        lease.assertValid();
        const matchesCurrentOperation =
          Boolean(resource.instanceId) ||
          !info?.metadata?.operationId ||
          info.metadata.operationId === resource.operation?.id;
        if (info?.status.state === 'Running' && matchesCurrentOperation) {
          const completed = await runSandboxLifecycleOperation({
            resource,
            lease,
            claim: { type: 'claim', initialPhase: phase },
            definition: {
              status: resource.status,
              steps: [],
              finish: {
                type: 'complete',
                status: SandboxInstanceStatusEnum.running,
                touchActive: true,
                ...(info.id ? { set: { instanceId: info.id } } : {})
              }
            }
          });
          return completed;
        }
      }

      // 旧 checkpoint 的确定性 PVC 只在有明确兼容依据时回退，并随回滚 token 持久化。
      const legacyClaimName = resolveLegacyRestoreActivationClaimName({
        restoring,
        phase,
        hasClaimedVolume: Boolean(getSessionVolumeClaimName(resource.storage)),
        sandboxId: resource.sandboxId
      });
      // checkpoint 后也可能出现迟到的旧远端容器；重新进入已持久化的清理方向，不能只报错卡住。
      const replayContainerCleanup =
        rollingBack &&
        (phase === 'rollbackProviderReleased' || phase === 'rollbackVolumeReleased') &&
        Boolean(await getUnreleasedContainer());
      lease.assertValid();
      const definition: SandboxLifecycleDefinition = {
        status: resource.status,
        steps: [
          releaseContainerStep,
          {
            fromPhase: 'rollbackProviderReleased',
            toPhase: 'rollbackVolumeReleased',
            run: async ({ resource: claimed }) => {
              if (!restoring) return;
              // 若在 volumeAssigned 之前回滚，claimed.storage 可能尚未分配新卷名，直接跳过卷删除。
              const claimName = getSessionVolumeClaimName(claimed.storage);
              if (!claimName) return;
              await deleteSessionVolume(claimName, { allowLegacyUnlabeled: true });
            }
          }
        ],
        finish: restoring
          ? {
              type: 'complete',
              status: SandboxInstanceStatusEnum.archived,
              beforeComplete: assertContainerReleased,
              set: ({ resource: claimed }) => {
                const rollbackStorage = buildLegacyArchivedRollbackStorage(claimed.storage);
                return rollbackStorage ? { storage: rollbackStorage } : {};
              },
              unset: ['instanceId', 'storage.volumes', 'storage.mountPath']
            }
          : {
              type: 'complete',
              status: SandboxInstanceStatusEnum.stopped,
              beforeComplete: assertContainerReleased,
              unset: ['instanceId']
            }
      };
      const completed = await runSandboxLifecycleOperation({
        resource,
        lease,
        definition,
        // 兼容旧迁移留下的 rollbackProviderDeleted；幂等重查容器/卷，不猜测清理结果。
        claim: {
          type: 'claim',
          initialPhase:
            !rollingBack ||
            phase === LEGACY_ROLLBACK_PROVIDER_DELETED_PHASE ||
            replayContainerCleanup
              ? 'rollbackClaimed'
              : undefined,
          set: legacyClaimName
            ? {
                storage: {
                  ...resource.storage,
                  ...buildVolumeConfig(legacyClaimName).storage
                }
              }
            : undefined,
          previousStatus: restoring
            ? SandboxInstanceStatusEnum.archived
            : resource.operation?.previousStatus
        }
      });
      return completed;
    }
  });
}

/**
 * 在调用方持有的 Lifecycle Lease 内收敛 stale `archiving` 记录：
 * - `claimed` / 已处于回滚阶段（S3 归档尚未上传）：清掉临时容器并回到 `stopped`（保留 PVC）；
 * - `archiveUploaded` 之后（新归档已落 S3）：继续走归档流水线完成删容器、删 PVC 并转入 `archived`。
 */
export async function recoverArchivingSandboxWithinLease(params: {
  resource: SandboxResourceDoc;
  lease: RedisLeaseContext;
  now?: Date;
}): Promise<SandboxResourceDoc> {
  const { resource, lease, now } = params;
  lease.assertValid();
  if (resource.status !== SandboxInstanceStatusEnum.archiving) {
    return resource;
  }
  const isRecoverablePreUpload = isRecoverableOpenSandboxArchiving(resource);
  if (isLegacyArchivingAwaitingMigration(resource)) {
    throw new SandboxLifecycleStateError(
      resource.status,
      'Legacy archiving sandbox awaits migration'
    );
  }
  if (resource.operation?.type !== 'archive') {
    throw new SandboxLifecycleStateError(resource.status);
  }
  const phase = resource.operation.phase;
  const isRollbackPhase = phase === 'rollbackClaimed' || phase === 'rollbackProviderReleased';
  const canContinue = resource.operation.retryAfter
    ? canResumeSandboxOperation(resource, now)
    : isRollbackPhase || canResumeSandboxOperation(resource, now);
  if (!canContinue) {
    throw new SandboxLifecycleStateError(resource.status);
  }

  if (isRecoverablePreUpload) {
    return withRollbackResourceClient({
      resource,
      lease,
      fn: async ({ getUnreleasedContainer, assertContainerReleased, releaseContainerStep }) => {
        // 若 rollbackProviderReleased 记录后有迟到的远端创建请求落地，回退到 rollbackClaimed 重放容器删除。
        const replayContainerCleanup =
          phase === 'rollbackProviderReleased' && Boolean(await getUnreleasedContainer());

        return await runSandboxLifecycleOperation({
          resource,
          lease,
          claim: {
            type: 'claim',
            initialPhase:
              phase === 'claimed' || replayContainerCleanup ? 'rollbackClaimed' : undefined
          },
          definition: {
            status: SandboxInstanceStatusEnum.archiving,
            steps: [releaseContainerStep],
            finish: {
              type: 'complete',
              status: SandboxInstanceStatusEnum.stopped,
              beforeComplete: assertContainerReleased,
              unset: ['instanceId']
            }
          }
        });
      }
    });
  }

  const result = await archiveSandboxResourceWithinLease(resource, lease);
  if (result.status === 'success') {
    return result.resource;
  }
  if (result.status === 'skipped') {
    throw new SandboxLifecycleStateError(resource.status, result.reason);
  }
  throw new Error(result.error);
}

/** 锁外快照只用于筛选；拿到租约后重新读取状态、generation 和 operation token。 */
export async function recoverSandboxActivation(params: {
  sandboxId: string;
  now?: Date;
  waitTimeoutMs?: number;
}) {
  const initial = await findSandboxInstanceBySandboxId({ sandboxId: params.sandboxId });
  if (!initial || !isSandboxActivationRecoverable(initial, params.now)) return initial;
  try {
    return await withSandboxLease({
      sandboxId: params.sandboxId,
      label: `recover-sandbox-activation:${params.sandboxId}`,
      waitTimeoutMs: params.waitTimeoutMs,
      fn: async (lease) => {
        const current = await findSandboxInstanceBySandboxId({ sandboxId: params.sandboxId });
        if (!current) return null;
        return recoverSandboxActivationWithinLease({
          resource: current,
          lease,
          now: params.now
        });
      }
    });
  } catch (error) {
    if (params.waitTimeoutMs === 0 && error instanceof RedisLeaseUnavailableError) {
      return null;
    }
    throw error;
  }
}

/** 回收超过孤儿超时阈值或已进入回滚态的 `provisioning`/`restoring` 记录，后台让路前台锁。 */
export async function retryStaleSandboxActivations(now = new Date()): Promise<void> {
  if (!isAgentSandboxOpenSandboxConfigured()) return;

  const stale = await findStaleSandboxOperations({
    statuses: [SandboxInstanceStatusEnum.provisioning, SandboxInstanceStatusEnum.restoring],
    now,
    heartbeatBefore: new Date(now.getTime() - SANDBOX_STALE_OPERATION_TIMEOUT_MS),
    retryPhases: SANDBOX_RECOVERABLE_ROLLBACK_PHASES
  });
  await batchRun(stale, async (resource) => {
    if (!isSandboxActivationRecoverable(resource, now)) return;
    try {
      await withSandboxLease({
        sandboxId: resource.sandboxId,
        label: `recover-sandbox-activation:${resource.sandboxId}`,
        waitTimeoutMs: 0,
        fn: async (lease) => {
          const current = await findSandboxInstanceBySandboxId({ sandboxId: resource.sandboxId });
          if (!current) return null;
          return recoverSandboxActivationWithinLease({
            resource: current,
            lease,
            now
          });
        }
      });
    } catch (error) {
      if (error instanceof RedisLeaseUnavailableError) return;
      logger.error('Failed to recover sandbox activation', {
        sandboxId: resource.sandboxId,
        error
      });
    }
  });
}

/** 回收超过孤儿超时阈值或已进入回滚态的 `archiving` 记录，后台让路前台锁。 */
export async function retryStaleArchivingSandboxes(now = new Date()): Promise<void> {
  if (!isAgentSandboxOpenSandboxConfigured()) return;

  const stale = await findStaleSandboxOperations({
    statuses: [SandboxInstanceStatusEnum.archiving],
    now,
    heartbeatBefore: new Date(now.getTime() - SANDBOX_STALE_OPERATION_TIMEOUT_MS),
    retryPhases: ['rollbackClaimed', 'rollbackProviderReleased']
  });

  await batchRun(
    stale,
    async (resource) => {
      try {
        await withSandboxLease({
          sandboxId: resource.sandboxId,
          label: `recover-archiving-sandbox:${resource.sandboxId}`,
          waitTimeoutMs: 0,
          fn: async (lease) => {
            const current = await findSandboxInstanceBySandboxId({ sandboxId: resource.sandboxId });
            if (!current) return null;
            return recoverArchivingSandboxWithinLease({
              resource: current,
              lease,
              now
            });
          }
        });
      } catch (error) {
        if (error instanceof RedisLeaseUnavailableError) return;
        logger.error('Failed to recover stale archiving sandbox', {
          sandboxId: resource.sandboxId,
          error
        });
      }
    },
    SANDBOX_ARCHIVE_CONCURRENCY
  );
}
