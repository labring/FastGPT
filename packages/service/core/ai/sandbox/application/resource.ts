/**
 * Sandbox 资源生命周期编排。
 *
 * 所有远端 stop/delete 都在 Lifecycle Lease 内先抢占 Mongo operation。
 */
import { getErrText } from '@fastgpt/global/common/error/utils';
import { batchRun, batchRunSettled } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import { serviceEnv } from '../../../../env';
import { getInstanceId } from '../../../../common/system/config/instanceId';
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
  killManagedOpenSandboxById,
  listManagedOpenSandboxes
} from '../infrastructure/opensandbox/opensandbox';
import {
  deleteSessionVolume,
  getOrphanVolumeMarkerKey,
  getSessionVolumeClaimName,
  listSessionVolumes,
  unmountSessionVolume
} from '../infrastructure/volume/service';
import { redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { RedisLeaseUnavailableError, type RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import { type SandboxSourceType } from '../type';
import { SandboxInstanceStatusEnum, SANDBOX_OPERATION_STALE_MS } from '../constants';
import { withSandboxLifecycleLease } from './lease';
import { SandboxOperationConflictError } from './lifecycle/error';
import {
  runSandboxLifecycleOperation,
  runSandboxLifecycleDeletion,
  type SandboxLifecycleDeleteDefinition,
  type SandboxLifecycleDefinition
} from './lifecycle/runner';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

/** 停止一条已发布的 running 资源；后台 cron 可传 `waitTimeoutMs: 0` 跳过正在活跃使用的沙盒。 */
export async function stopSandboxResource(
  resource: SandboxResourceRef,
  options: { waitTimeoutMs?: number } = {}
): Promise<void> {
  await withSandboxLifecycleLease({
    sandboxId: resource.sandboxId,
    label: `stop-sandbox:${resource.sandboxId}`,
    waitTimeoutMs: options.waitTimeoutMs,
    fn: async (lease) => {
      const current = await findSandboxInstanceBySandboxId({ sandboxId: resource.sandboxId });
      await stopSandboxResourceWithinLease({ current, resource, lease });
    }
  });
}

/** 锁内停止当前记录；运行准备与后台恢复可直接幂等续跑 `stopping`，不重复取得 lifecycle lease。 */
export async function stopSandboxResourceWithinLease(params: {
  current: SandboxResourceDoc | null;
  resource: SandboxResourceRef;
  lease: RedisLeaseContext;
}) {
  const { current, resource, lease } = params;

  if (
    !current ||
    (current.status !== SandboxInstanceStatusEnum.running &&
      current.status !== SandboxInstanceStatusEnum.stopping)
  ) {
    return null;
  }

  const definition: SandboxLifecycleDefinition = {
    status: SandboxInstanceStatusEnum.stopping,
    steps: [
      {
        fromPhase: 'claimed',
        toPhase: 'providerStopped',
        run: async ({ resource: claimed }) => {
          const client = await createOpenSandboxResourceClient(claimed);
          try {
            await client.delete();
          } finally {
            await client.close?.().catch(() => {});
          }
          if (serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME === 'docker') {
            const claimName = getSessionVolumeClaimName(claimed.storage);
            if (claimName) {
              await unmountSessionVolume(claimName).catch(() => undefined);
            }
          }
        }
      }
    ],
    finish: { type: 'complete', status: SandboxInstanceStatusEnum.stopped }
  };
  return runSandboxLifecycleOperation({
    resource: {
      ...current,
      ...(resource.lastActiveAt ? { lastActiveAt: resource.lastActiveAt } : {})
    },
    lease,
    definition,
    claim: {
      type: 'claim',
      matchLastActiveAt:
        current.status === SandboxInstanceStatusEnum.running && Boolean(resource.lastActiveAt)
    }
  }).catch((error) => {
    if (error instanceof SandboxOperationConflictError) return null;
    throw error;
  });
}

/**
 * 删除一条沙盒资源（删除远端容器 + 删除持久卷 + 删除 Mongo 记录）。
 *
 * 前台业务删除默认有界等待 Lifecycle Lease（等待在途创建或停止完成后接管清理）；
 * 后台恢复 cron 传 `waitTimeoutMs: 0` 非阻塞跳过仍在途的活跃任务。
 */
export async function deleteSandboxResource(
  resource: SandboxResourceRef,
  options: { waitTimeoutMs?: number } = {}
): Promise<void> {
  await withSandboxLifecycleLease({
    sandboxId: resource.sandboxId,
    label: `delete-sandbox:${resource.sandboxId}`,
    waitTimeoutMs: options.waitTimeoutMs,
    fn: async (lease) => {
      const current = await findSandboxInstanceBySandboxId({ sandboxId: resource.sandboxId });
      if (!current) return;

      const definition: SandboxLifecycleDeleteDefinition = {
        status: SandboxInstanceStatusEnum.deleting,
        steps: [
          {
            fromPhase: 'claimed',
            toPhase: 'providerDeleted',
            run: async ({ resource: claimed }) => {
              const client = await createOpenSandboxResourceClient(claimed);
              try {
                await client.delete();
              } finally {
                await client.close?.().catch(() => {});
              }
            }
          },
          {
            fromPhase: 'providerDeleted',
            toPhase: 'volumeDeleted',
            run: async ({ resource: claimed }) => {
              const claimName = getSessionVolumeClaimName(claimed.storage);
              if (!claimName) {
                logger.warn(
                  'OpenSandbox record has no persisted workspace claimName during deletion; skipping volume delete',
                  { sandboxId: claimed.sandboxId }
                );
                return;
              }
              await deleteSessionVolume(claimName);
            }
          }
        ],
        finish: { type: 'delete' }
      };
      await runSandboxLifecycleDeletion({
        resource: current,
        lease,
        definition
      });
    }
  });
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

/** 调用方须先确认业务 source 已持久化软删除标记（Store-Load 屏障），再查询并逐实例在 Lifecycle Lease 内清理。 */
export const deleteSandboxResourcesBySource = async (params: {
  sourceType: SandboxSourceType;
  sourceId: string;
}) => {
  const instances = await findSandboxResourcesBySource(params);
  await deleteSandboxResourceBatch(instances);
};

/** 调用方须先确认各 Skill 已持久化软删除标记，再查询并逐实例在 Lifecycle Lease 内清理。 */
export const deleteSkillEditSandboxes = async (skillIds: string[]) => {
  if (skillIds.length === 0) return;
  const instances = await findSkillRelatedSandboxResources(skillIds);
  await deleteSandboxResourceBatch(instances);
};

/** cron 批量非阻塞 stop；仍在途活跃的沙盒静默跳过，单条异常允许同批其他资源继续。 */
export async function stopSandboxResources(resources: SandboxResourceRef[]): Promise<void> {
  await batchRun(resources, async (resource) => {
    await stopSandboxResource(resource, { waitTimeoutMs: 0 }).catch((error) => {
      if (error instanceof RedisLeaseUnavailableError) return;
      logger.error('Failed to stop sandbox', {
        sandboxId: resource.sandboxId,
        error
      });
    });
  });
}

/** 重新 fencing 超过心跳阈值的 stopping operation，并幂等重放 provider stop。 */
export async function retryStaleStoppingSandboxes(now = new Date()): Promise<void> {
  const stale = await findStaleSandboxOperations({
    statuses: [SandboxInstanceStatusEnum.stopping],
    heartbeatBefore: new Date(now.getTime() - SANDBOX_OPERATION_STALE_MS)
  });
  await stopSandboxResources(stale);
}

/** 重新接管超过心跳阈值的 deleting 记录，按持久化阶段幂等续跑；活跃任务非阻塞跳过。 */
export async function retryStaleDeletingSandboxes(now = new Date()): Promise<void> {
  const stale = await findStaleSandboxOperations({
    statuses: [SandboxInstanceStatusEnum.deleting],
    heartbeatBefore: new Date(now.getTime() - SANDBOX_OPERATION_STALE_MS)
  });
  await batchRun(stale, async (resource) => {
    await deleteSandboxResource(resource, { waitTimeoutMs: 0 }).catch((error) => {
      if (error instanceof RedisLeaseUnavailableError) return;
      logger.error('Failed to recover stale deleting sandbox', {
        sandboxId: resource.sandboxId,
        phase: resource.operation?.phase,
        error
      });
    });
  });
}

const ORPHAN_SANDBOX_CONTAINER_GRACE_MS = 10 * 60 * 1000;
const ORPHAN_VOLUME_GRACE_MS = 30 * 60 * 1000;
const ORPHAN_VOLUME_MARKER_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * 反向对账 GC（沙盒容器）：
 * 只对账当前部署拥有的容器；Mongo instanceId 是运行实例真值，不能按远端创建时间淘汰已提交实例。
 * 清理超过 10 分钟宽限期且记录缺失、稳定 stopped 或与稳定 running 记录身份不符的容器。
 */
export async function reconcileOrphanSandboxContainers(now = new Date()): Promise<void> {
  if (!serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL?.trim()) return;
  const clientConfig = getOpenSandboxClientConfig();
  const deploymentId = await getInstanceId();
  const remoteItems = await listManagedOpenSandboxes(clientConfig, deploymentId);

  /** 过渡态可能仍在提交新 instanceId；持有 lifecycle lease 重读稳定记录后才允许回收。 */
  const isOrphan = (item: (typeof remoteItems)[number], record?: SandboxResourceDoc | null) => {
    if (!record) return true;
    if (record.operation) return false;
    if (record.status === SandboxInstanceStatusEnum.stopped) return true;
    return Boolean(
      record.status === SandboxInstanceStatusEnum.running &&
      record.instanceId &&
      item.id !== record.instanceId
    );
  };

  const matureItems = remoteItems.filter(
    (item) => now.getTime() - item.createdAt.getTime() >= ORPHAN_SANDBOX_CONTAINER_GRACE_MS
  );
  if (matureItems.length === 0) return;

  const sessionIds = [
    ...new Set(matureItems.map((item) => item.sessionId).filter((id): id is string => Boolean(id)))
  ];
  const records = await findSandboxInstancesBySandboxIds({
    sandboxIds: sessionIds
  });
  const recordBySandboxId = new Map(records.map((r) => [r.sandboxId, r]));

  for (const item of matureItems) {
    const sessionId = item.sessionId;
    if (!sessionId) {
      await killManagedOpenSandboxById(clientConfig, {
        deploymentId,
        remoteSandboxId: item.id
      }).catch((error) => {
        logger.warn('Failed to kill untagged orphan sandbox container', {
          remoteId: item.id,
          error
        });
      });
      continue;
    }

    if (!isOrphan(item, recordBySandboxId.get(sessionId))) continue;

    await withSandboxLifecycleLease({
      sandboxId: sessionId,
      label: 'reconcile-orphan-sandbox-container',
      waitTimeoutMs: 0,
      fn: async () => {
        const latest = await findSandboxInstanceBySandboxId({
          sandboxId: sessionId
        });
        if (!isOrphan(item, latest)) return;

        await killManagedOpenSandboxById(clientConfig, {
          deploymentId,
          sessionId,
          remoteSandboxId: item.id
        });
        logger.info('Cleaned up orphan sandbox container', {
          remoteId: item.id,
          sandboxId: sessionId
        });
      }
    }).catch((error) => {
      if (error instanceof RedisLeaseUnavailableError) return;
      logger.warn('Skipped or failed orphan sandbox container cleanup', {
        remoteId: item.id,
        sandboxId: sessionId,
        error
      });
    });
  }
}

/**
 * 反向对账 GC（持久卷）：
 * 列出 volume-manager 中当前部署拥有的卷，与 Mongo `storage.volumes.claimName` 比对。
 * 采用「先标记、满 30 分钟二次确认后再删除」的两阶段策略，彻底杜绝并发创建期的误删竞态。
 */
export async function reconcileOrphanSandboxVolumes(now = new Date()): Promise<void> {
  if (!serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL?.trim()) return;
  const allClaimNames = await listSessionVolumes();
  if (allClaimNames.length === 0) return;

  const existingClaimNames = await findExistingSandboxVolumeClaimNames(allClaimNames);

  for (const claimName of allClaimNames) {
    const markerKey = getOrphanVolumeMarkerKey(claimName);
    if (existingClaimNames.has(claimName)) {
      await redisCacheAdapter.delete(markerKey).catch(() => undefined);
      continue;
    }

    const markerRaw = await redisCacheAdapter.get(markerKey).catch(() => null);
    if (!markerRaw) {
      await redisCacheAdapter
        .set({
          key: markerKey,
          value: JSON.stringify({ firstSeenAt: now.getTime() }),
          ttlMs: ORPHAN_VOLUME_MARKER_TTL_MS
        })
        .catch(() => undefined);
      continue;
    }

    let firstSeenAt = Number.NaN;
    try {
      firstSeenAt = Number((JSON.parse(markerRaw) as { firstSeenAt?: unknown }).firstSeenAt);
    } catch {}

    if (!Number.isFinite(firstSeenAt)) {
      await redisCacheAdapter
        .set({
          key: markerKey,
          value: JSON.stringify({ firstSeenAt: now.getTime() }),
          ttlMs: ORPHAN_VOLUME_MARKER_TTL_MS
        })
        .catch(() => undefined);
      continue;
    }

    if (now.getTime() - firstSeenAt < ORPHAN_VOLUME_GRACE_MS) {
      continue;
    }

    // 二次查询 Mongo 确认仍无任何实例引用该 claimName
    const rechecked = await findExistingSandboxVolumeClaimNames([claimName]);
    if (rechecked.has(claimName)) {
      await redisCacheAdapter.delete(markerKey).catch(() => undefined);
      continue;
    }

    // 二次复核 Redis 孤儿标记未被并发建卷清除或重置，闭合单轮对账内的 TOCTOU 尾窗
    const latestMarkerRaw = await redisCacheAdapter.get(markerKey).catch(() => null);
    const latestFirstSeenAt = (() => {
      if (!latestMarkerRaw) return Number.NaN;
      try {
        return Number((JSON.parse(latestMarkerRaw) as { firstSeenAt?: unknown }).firstSeenAt);
      } catch {
        return Number.NaN;
      }
    })();
    if (latestFirstSeenAt !== firstSeenAt) {
      continue;
    }

    await deleteSessionVolume(claimName)
      .then(async () => {
        await redisCacheAdapter.delete(markerKey).catch(() => undefined);
        logger.info('Cleaned up orphan sandbox volume', { claimName });
      })
      .catch((error) => {
        logger.warn('Failed to delete orphan sandbox volume', { claimName, error });
      });
  }
}

/** 执行沙盒容器与持久卷的反向对账 GC。 */
export async function reconcileOrphanSandboxResources(now = new Date()): Promise<void> {
  await reconcileOrphanSandboxContainers(now).catch((error) => {
    logger.error('Failed to reconcile orphan sandbox containers', { error });
  });
  await reconcileOrphanSandboxVolumes(now).catch((error) => {
    logger.error('Failed to reconcile orphan sandbox volumes', { error });
  });
}
