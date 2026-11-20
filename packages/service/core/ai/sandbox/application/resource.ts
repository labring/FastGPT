/**
 * Sandbox 资源生命周期编排。
 *
 * 所有远端 stop/delete 都在 Lifecycle Lease 内先抢占 Mongo operation。
 */
import { redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { RedisLeaseUnavailableError, type RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { batchRun, batchRunSettled } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import { getS3SandboxSource } from '../../../../common/s3/sources/sandbox';
import { isAgentSandboxOpenSandboxConfigured } from '../config';
import {
  findExistingSandboxVolumeClaimNames,
  findSandboxInstanceBySandboxId,
  findSandboxInstancesBySandboxIds,
  findSandboxResourcesBySource,
  findStaleSandboxOperations,
  findSkillRelatedSandboxResources,
  type SandboxResourceDoc,
  type SandboxResourceRef
} from '../infrastructure/instance/repository';
import { getOpenSandboxClientConfig } from '../infrastructure/opensandbox/config';
import {
  createOpenSandboxResourceClient,
  disconnectSandbox,
  killManagedOpenSandboxById,
  listManagedOpenSandboxes,
  type ManagedOpenSandboxItem
} from '../infrastructure/opensandbox/opensandbox';
import {
  deleteSessionVolume,
  getOrphanVolumeMarkerKey,
  getSessionVolumeClaimName,
  listSessionVolumes,
  parseSandboxIdFromVolumeClaimName
} from '../infrastructure/volume/service';
import { getVolumeManagerEnvConfig } from '../infrastructure/volume/config';
import { SANDBOX_PROVIDER, type SandboxSourceType } from '../type';
import { buildLegacyDevboxTombstoneFinish } from '../legacy';
import {
  ORPHAN_VOLUME_GRACE_PERIOD_MS,
  ORPHAN_VOLUME_OBSERVATION_TTL_SECONDS,
  SANDBOX_STALE_OPERATION_TIMEOUT_MS,
  SandboxInstanceStatusEnum,
  expectedOperationByStatus
} from '../constants';
import { withSandboxLease } from './lease';
import { SandboxLifecycleStateError, SandboxOperationConflictError } from './lifecycle/error';
import {
  runSandboxLifecycleOperation,
  runSandboxLifecycleDeletion,
  type SandboxLifecycleDefinition,
  type SandboxLifecycleStep
} from './lifecycle/runner';
import { canResumeSandboxOperation } from './lifecycle/utils';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);
const ORPHAN_CONTAINER_GRACE_PERIOD_MS = 10 * 60_000;

/**
 * 删除接管旧过渡态前等待不可取消远端请求的保守隔离窗口。
 * 错误也可能来自超时或租约丢失，不能据此认定远端请求已终止。
 */
const assertDeleteCanFenceCurrentOperation = (resource: SandboxResourceDoc) => {
  if (!expectedOperationByStatus[resource.status]) return;
  if (!canResumeSandboxOperation(resource)) {
    throw new SandboxLifecycleStateError(
      resource.status,
      `Sandbox ${resource.sandboxId} is still inside the ${resource.status} delete isolation window`
    );
  }
};

/** 停止一条已发布的 running 资源；状态抢占失败时不会触发远端 stop。 */
export async function stopSandboxResource(
  resource: SandboxResourceRef,
  options?: { waitTimeoutMs?: number }
): Promise<void> {
  try {
    await withSandboxLease({
      sandboxId: resource.sandboxId,
      label: `stop-sandbox:${resource.sandboxId}`,
      waitTimeoutMs: options?.waitTimeoutMs,
      fn: async (lease) => {
        const current = await findSandboxInstanceBySandboxId({ sandboxId: resource.sandboxId });
        await stopSandboxResourceWithinLease({
          current,
          matchLastActiveAt: resource.lastActiveAt,
          lease
        });
      }
    });
  } catch (error) {
    if (options?.waitTimeoutMs === 0 && error instanceof RedisLeaseUnavailableError) {
      return;
    }
    throw error;
  }
}

/** 锁内停止当前记录；运行准备可以续跑 stopping，不重复取得 lifecycle lease。 */
export async function stopSandboxResourceWithinLease(params: {
  current: SandboxResourceDoc | null;
  matchLastActiveAt?: Date;
  lease: RedisLeaseContext;
}) {
  const { current, matchLastActiveAt, lease } = params;

  if (
    !current ||
    (current.status !== SandboxInstanceStatusEnum.running &&
      current.status !== SandboxInstanceStatusEnum.stopping)
  ) {
    return null;
  }

  if (
    current.status === SandboxInstanceStatusEnum.stopping &&
    !canResumeSandboxOperation(current)
  ) {
    throw new SandboxLifecycleStateError(current.status);
  }

  const definition: SandboxLifecycleDefinition = {
    status: SandboxInstanceStatusEnum.stopping,
    steps: [
      {
        fromPhase: 'claimed',
        toPhase: 'providerStopped',
        run: async ({ resource: claimed, lease: stepLease }) => {
          const client = await createOpenSandboxResourceClient({
            sandboxId: claimed.sandboxId,
            instanceId: claimed.instanceId
          });
          try {
            await client.stop({ signal: stepLease.signal });
          } finally {
            await disconnectSandbox(client);
          }
        }
      }
    ],
    finish: {
      type: 'complete',
      status: SandboxInstanceStatusEnum.stopped,
      unset: ['instanceId']
    }
  };
  return runSandboxLifecycleOperation({
    resource: {
      ...current,
      ...(matchLastActiveAt ? { lastActiveAt: matchLastActiveAt } : {})
    },
    lease,
    definition,
    claim: {
      type: 'claim',
      matchLastActiveAt:
        current.status === SandboxInstanceStatusEnum.running && Boolean(matchLastActiveAt)
    }
  }).catch((error) => {
    if (error instanceof SandboxOperationConflictError) return null;
    throw error;
  });
}

/**
 * 在已持有的 Lifecycle Lease 内删除单条 v2 资源。
 *
 * 非 `SANDBOX_PROVIDER` 的历史迁移中/待清理记录保留给迁移清理任务处理，避免误丢远端 Devbox 指针。
 */
export async function deleteSandboxResourceWithinLease({
  current,
  lease,
  allowDeleteLegacyDevboxPointer
}: {
  current: SandboxResourceDoc;
  lease: RedisLeaseContext;
  allowDeleteLegacyDevboxPointer?: boolean;
}): Promise<void> {
  if (current.provider !== SANDBOX_PROVIDER) {
    logger.info('Skipping OpenSandbox delete for non-opensandbox provider record', {
      sandboxId: current.sandboxId,
      provider: current.provider
    });
    return;
  }

  assertDeleteCanFenceCurrentOperation(current);

  const steps: readonly SandboxLifecycleStep[] = [
    {
      fromPhase: 'claimed',
      toPhase: 'providerDeleted',
      run: async ({ resource: claimed, lease: stepLease }) => {
        const hasPossibleContainer =
          Boolean(claimed.instanceId) ||
          claimed.operation?.previousStatus !== SandboxInstanceStatusEnum.archived;
        if (!hasPossibleContainer && !isAgentSandboxOpenSandboxConfigured()) {
          return;
        }
        const client = await createOpenSandboxResourceClient({
          sandboxId: claimed.sandboxId,
          instanceId: claimed.instanceId
        });
        try {
          await client.delete(undefined, { signal: stepLease.signal });
        } finally {
          await disconnectSandbox(client);
        }
      }
    },
    {
      fromPhase: 'providerDeleted',
      toPhase: 'volumeDeleted',
      run: async ({ resource: claimed }) => {
        const claimName = getSessionVolumeClaimName(claimed.storage);
        if (claimName) {
          await deleteSessionVolume(claimName, { allowLegacyUnlabeled: true });
        }
      }
    },
    {
      fromPhase: 'volumeDeleted',
      toPhase: 'archiveDeleted',
      run: async ({ resource: claimed }) => {
        await getS3SandboxSource().deleteSandboxArchives({
          sandboxId: claimed.sandboxId,
          currentObjectKey: claimed.storage?.archive?.objectKey
        });
      }
    }
  ];

  if (Boolean(current.storage?.legacyDevboxPendingCleanup) && !allowDeleteLegacyDevboxPointer) {
    await runSandboxLifecycleOperation({
      resource: current,
      lease,
      definition: {
        status: SandboxInstanceStatusEnum.deleting,
        steps,
        finish: buildLegacyDevboxTombstoneFinish(current.sandboxId)
      }
    });
    return;
  }

  await runSandboxLifecycleDeletion({
    resource: current,
    lease,
    definition: {
      status: SandboxInstanceStatusEnum.deleting,
      steps,
      finish: { type: 'delete' }
    }
  });
}

/**
 * 删除一条 v2 资源。
 *
 * 重试会重新 fencing 旧 deleting operation，并幂等重放各远端删除步骤。
 */
export async function deleteSandboxResource(
  resource: SandboxResourceRef,
  options?: { waitTimeoutMs?: number }
): Promise<void> {
  try {
    await withSandboxLease({
      sandboxId: resource.sandboxId,
      label: `delete-sandbox:${resource.sandboxId}`,
      waitTimeoutMs: options?.waitTimeoutMs,
      fn: async (lease) => {
        const current = await findSandboxInstanceBySandboxId({ sandboxId: resource.sandboxId });
        if (!current) return;
        await deleteSandboxResourceWithinLease({ current, lease });
      }
    });
  } catch (error) {
    if (options?.waitTimeoutMs === 0 && error instanceof RedisLeaseUnavailableError) {
      return;
    }
    throw error;
  }
}

/** 删除一批 Sandbox 资源；全部任务收敛后统一记录失败资源并阻止后续清理阶段。 */
const deleteSandboxResourceBatch = async (instances: SandboxResourceRef[]) => {
  const results = await batchRunSettled(
    instances,
    (instance) => deleteSandboxResource(instance),
    10
  );
  const failures = results.flatMap((result, index) => {
    if (result.success) return [];
    return [
      {
        sandboxId: instances[index].sandboxId,
        error: getErrText(result.error, 'Unknown sandbox deletion error')
      }
    ];
  });
  if (failures.length === 0) return;

  logger.error('Failed to delete sandbox resources', {
    failureCount: failures.length,
    failures
  });
  throw new Error(`Failed to delete ${failures.length} sandbox resources`);
};

/** 调用方须先确认业务 source 已打删除标记，再查询并清理该 source 的全部资源。 */
export const deleteSandboxResourcesBySource = async (params: {
  sourceType: SandboxSourceType;
  sourceId: string;
}) => {
  const instances = await findSandboxResourcesBySource(params);
  await deleteSandboxResourceBatch(instances);
};

/** 清理已打删除标记 Skill 的 Sandbox 资源。 */
export const deleteSkillEditSandboxes = async (skillIds: string[]) => {
  if (skillIds.length === 0) return;
  const instances = await findSkillRelatedSandboxResources(skillIds);
  await deleteSandboxResourceBatch(instances);
};

/** cron 批量 stop（非阻塞让路前台）；单条失败会记录并允许同批其他资源继续。 */
export async function stopSandboxResources(resources: SandboxResourceRef[]): Promise<void> {
  await batchRun(resources, async (resource) => {
    await stopSandboxResource(resource, { waitTimeoutMs: 0 }).catch((error) => {
      logger.error('Failed to stop sandbox', {
        sandboxId: resource.sandboxId,
        error
      });
    });
  });
}

/** 重新 fencing 超过孤儿超时阈值的 stopping operation，并幂等重放 container stop。 */
export async function retryStaleStoppingSandboxes(now = new Date()): Promise<void> {
  if (!isAgentSandboxOpenSandboxConfigured()) return;

  const stale = await findStaleSandboxOperations({
    statuses: [SandboxInstanceStatusEnum.stopping],
    now,
    heartbeatBefore: new Date(now.getTime() - SANDBOX_STALE_OPERATION_TIMEOUT_MS)
  });
  await stopSandboxResources(stale);
}

/** 重新 fencing 超过孤儿超时阈值的 deleting operation，并幂等重放物理资源清理。 */
export async function retryStaleDeletingSandboxes(now = new Date()): Promise<void> {
  if (!isAgentSandboxOpenSandboxConfigured()) return;

  const stale = await findStaleSandboxOperations({
    statuses: [SandboxInstanceStatusEnum.deleting],
    now,
    heartbeatBefore: new Date(now.getTime() - SANDBOX_STALE_OPERATION_TIMEOUT_MS)
  });
  await batchRun(stale, async (resource) => {
    await deleteSandboxResource(resource, { waitTimeoutMs: 0 }).catch((error) => {
      logger.error('Failed to retry stale deleting sandbox', {
        sandboxId: resource.sandboxId,
        error
      });
    });
  });
}

/** 判断带 `operationId` 标签的容器是否已被当前 Mongo 记录状态或新代次操作取代。 */
const hasSupersededOperationId = (
  item: ManagedOpenSandboxItem,
  doc: SandboxResourceDoc | null | undefined
): boolean => {
  const itemOperationId = item.metadata?.operationId;
  if (!itemOperationId || !doc) return false;
  if (doc.instanceId && doc.instanceId === item.id) return false;
  if (doc.operation?.id && doc.operation.id === itemOperationId) return false;
  return true;
};

const isOrphanManagedContainer = (
  item: ManagedOpenSandboxItem,
  doc: SandboxResourceDoc | null | undefined
): boolean => {
  if (!doc) return true;
  if (
    doc.status === SandboxInstanceStatusEnum.stopped ||
    doc.status === SandboxInstanceStatusEnum.archived
  ) {
    return true;
  }
  if (
    doc.status === SandboxInstanceStatusEnum.running &&
    Boolean(doc.instanceId) &&
    doc.instanceId !== item.id
  ) {
    return true;
  }
  if (hasSupersededOperationId(item, doc)) {
    return true;
  }
  return false;
};

export type OrphanReconcileScope = {
  /** 限定本次对账处理的 sessionId 集合；传入 `scope` 但未提供时视为空集合，避免波及其他会话。 */
  sessionIds?: ReadonlySet<string>;
  /** 限定本次对账处理的持久卷 claimName 集合；传入 `scope` 但未提供时视为空集合，避免误删其他会话卷。 */
  claimNames?: ReadonlySet<string>;
};

/**
 * 反向对账并清理本系统孤儿 OpenSandbox 容器（未打代次标签或无记录容器保留 10 分钟宽限期，过期 `operationId` 迟到容器可立即识别）。
 * 严格限定 `app: 'fastgpt'` 标签，不干扰过渡态和活跃代次容器，且删除前持非阻塞租约二次复核。
 */
async function reconcileOrphanSandboxContainers({
  now = new Date(),
  scope,
  getManagedContainers = () => listManagedOpenSandboxes(getOpenSandboxClientConfig())
}: {
  now?: Date;
  scope?: OrphanReconcileScope;
  getManagedContainers?: () => Promise<ManagedOpenSandboxItem[]>;
} = {}): Promise<void> {
  if (!isAgentSandboxOpenSandboxConfigured()) return;

  const scopedSessionIds = scope ? (scope.sessionIds ?? new Set<string>()) : undefined;
  if (scopedSessionIds && scopedSessionIds.size === 0) return;

  const clientConfig = getOpenSandboxClientConfig();
  const allManaged = await getManagedContainers();
  const managed = scopedSessionIds
    ? allManaged.filter(
        (item) => item.sessionId !== undefined && scopedSessionIds.has(item.sessionId)
      )
    : allManaged;
  if (managed.length === 0) return;

  const sessionIds = Array.from(
    new Set(managed.map((item) => item.sessionId).filter((id): id is string => Boolean(id)))
  );
  const docs = sessionIds.length > 0 ? await findSandboxInstancesBySandboxIds(sessionIds) : [];
  const docBySandboxId = new Map(docs.map((doc) => [doc.sandboxId, doc]));

  const candidates = managed.filter((item) => {
    const doc = item.sessionId ? docBySandboxId.get(item.sessionId) : undefined;
    const pastGracePeriod =
      now.getTime() - item.createdAt.getTime() >= ORPHAN_CONTAINER_GRACE_PERIOD_MS;
    if (!pastGracePeriod && !hasSupersededOperationId(item, doc)) {
      return false;
    }
    return isOrphanManagedContainer(item, doc);
  });
  if (candidates.length === 0) return;

  await batchRun(
    candidates,
    async (item) => {
      const targetSessionId = item.sessionId;
      if (!targetSessionId) {
        await killManagedOpenSandboxById(
          {
            remoteSandboxId: item.id
          },
          clientConfig
        );
        return;
      }

      try {
        await withSandboxLease({
          sandboxId: targetSessionId,
          label: `reconcile-orphan-container:${targetSessionId}`,
          waitTimeoutMs: 0,
          fn: async (lease) => {
            const latest = await findSandboxInstanceBySandboxId({ sandboxId: targetSessionId });
            lease.assertValid();
            if (!isOrphanManagedContainer(item, latest)) return;

            await killManagedOpenSandboxById(
              {
                sessionId: targetSessionId,
                remoteSandboxId: item.id
              },
              clientConfig
            );
            logger.info('Reconciled orphan OpenSandbox container', {
              sandboxId: targetSessionId,
              remoteSandboxId: item.id,
              status: latest?.status ?? 'missing'
            });
          }
        });
      } catch (error) {
        if (error instanceof RedisLeaseUnavailableError) return;
        logger.warn('Failed to reconcile orphan OpenSandbox container', {
          sandboxId: targetSessionId,
          remoteSandboxId: item.id,
          error
        });
      }
    },
    5
  );
}

/**
 * 反向对账并清理本系统孤儿持久卷（Redis 30 分钟两阶段观察期）。
 * 仅处理符合命名 prefix 的卷，避免误删并发新建或升级中尚未挂定的 PVC；可传入 `scope` 限定待检查的卷集合。
 */
export async function reconcileOrphanSandboxVolumes({
  now = new Date(),
  scope,
  getManagedContainers = () => listManagedOpenSandboxes(getOpenSandboxClientConfig())
}: {
  now?: Date;
  scope?: OrphanReconcileScope;
  getManagedContainers?: () => Promise<ManagedOpenSandboxItem[]>;
} = {}): Promise<void> {
  if (!isAgentSandboxOpenSandboxConfigured()) return;

  const scopedClaimNames = scope ? (scope.claimNames ?? new Set<string>()) : undefined;
  if (scopedClaimNames && scopedClaimNames.size === 0) return;

  const listedVolumes = await listSessionVolumes();
  const rawVolumes = scopedClaimNames
    ? listedVolumes.filter((claimName) => scopedClaimNames.has(claimName))
    : listedVolumes;
  if (rawVolumes.length === 0) return;

  const { volumeNamePrefix } = getVolumeManagerEnvConfig();
  const referencedClaims = await findExistingSandboxVolumeClaimNames(rawVolumes);

  type CandidateOrphanVolume = {
    claimName: string;
    candidateSandboxId: string;
  };
  const unreferencedVolumes: CandidateOrphanVolume[] = [];

  for (const claimName of rawVolumes) {
    const candidateSandboxId = parseSandboxIdFromVolumeClaimName({ claimName, volumeNamePrefix });

    if (!candidateSandboxId) {
      if (referencedClaims.has(claimName)) {
        await redisCacheAdapter.delete(getOrphanVolumeMarkerKey(claimName)).catch(() => undefined);
      } else {
        logger.warn('Skipping unmanaged PVC during orphan volume reconciliation', {
          claimName,
          volumeNamePrefix
        });
      }
      continue;
    }

    if (referencedClaims.has(claimName)) {
      await redisCacheAdapter.delete(getOrphanVolumeMarkerKey(claimName)).catch(() => undefined);
      continue;
    }

    unreferencedVolumes.push({ claimName, candidateSandboxId });
  }
  if (unreferencedVolumes.length === 0) return;

  const containers = await getManagedContainers();

  const activeSessionIds = new Set(
    containers
      .map((item) => item.sessionId?.toLowerCase())
      .filter((id): id is string => Boolean(id))
  );

  await batchRun(
    unreferencedVolumes,
    async ({ claimName, candidateSandboxId }) => {
      const markerKey = getOrphanVolumeMarkerKey(claimName);
      if (activeSessionIds.has(candidateSandboxId.toLowerCase())) {
        await redisCacheAdapter.delete(markerKey).catch(() => undefined);
        return;
      }

      const firstSeenRaw = await redisCacheAdapter.get(markerKey).catch(() => null);
      const firstSeenMs = firstSeenRaw !== null ? Number(firstSeenRaw) : Number.NaN;
      if (!Number.isFinite(firstSeenMs)) {
        await redisCacheAdapter
          .set({
            key: markerKey,
            value: String(now.getTime()),
            ttlMs: ORPHAN_VOLUME_OBSERVATION_TTL_SECONDS * 1000
          })
          .catch(() => undefined);
        return;
      }

      if (now.getTime() - firstSeenMs < ORPHAN_VOLUME_GRACE_PERIOD_MS) {
        return;
      }

      const verifyAndDeleteVolume = async () => {
        const stillReferenced = await findExistingSandboxVolumeClaimNames([claimName]);
        if (stillReferenced.has(claimName)) {
          await redisCacheAdapter.delete(markerKey).catch(() => undefined);
          return;
        }
        await deleteSessionVolume(claimName);
        logger.info('Reconciled orphan OpenSandbox volume', {
          claimName,
          sandboxId: candidateSandboxId
        });
      };

      try {
        await withSandboxLease({
          sandboxId: candidateSandboxId,
          label: `reconcile-orphan-volume:${claimName}`,
          waitTimeoutMs: 0,
          fn: async (lease) => {
            lease.assertValid();
            await verifyAndDeleteVolume();
          }
        });
      } catch (error) {
        if (error instanceof RedisLeaseUnavailableError) return;
        logger.warn('Failed to reconcile orphan OpenSandbox volume', {
          claimName,
          sandboxId: candidateSandboxId,
          error
        });
      }
    },
    5
  );
}

/** 执行本部署容器与持久卷的双向孤儿资源对账清理，子任务互不影响；可传入 `scope` 收窄处理范围。 */
export async function reconcileOrphanSandboxResources(
  now = new Date(),
  scope?: OrphanReconcileScope
): Promise<void> {
  if (!isAgentSandboxOpenSandboxConfigured()) return;

  let managedContainersPromise: Promise<ManagedOpenSandboxItem[]> | undefined;
  const getManagedContainers = () =>
    (managedContainersPromise ??= listManagedOpenSandboxes(getOpenSandboxClientConfig()));

  const [containerResult, volumeResult] = await Promise.allSettled([
    reconcileOrphanSandboxContainers({ now, scope, getManagedContainers }),
    reconcileOrphanSandboxVolumes({ now, scope, getManagedContainers })
  ]);
  if (containerResult.status === 'rejected') {
    logger.error('Orphan OpenSandbox container reconciliation failed', {
      error: containerResult.reason
    });
  }
  if (volumeResult.status === 'rejected') {
    logger.error('Orphan OpenSandbox volume reconciliation failed', {
      error: volumeResult.reason
    });
  }
}
