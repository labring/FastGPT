/** 运行准备的唯一编排入口：归属、迁移门禁、恢复、静默升级和激活；client 不解释生命周期。 */
import { isRedisLeaseError, type RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import {
  backfillSandboxInstanceIdIfNeeded,
  createSandboxProvisioningInstance,
  deleteClaimedSandboxRecord,
  findSandboxInstanceBySandboxId,
  findSandboxInstanceBySource,
  touchRunningSandboxInstance,
  type SandboxResourceDoc
} from '../../infrastructure/instance/repository';
import { getLogger, LogCategories } from '../../../../../common/logger';
import {
  getOpenSandboxRuntimeConfig,
  type OpenSandboxRuntimeConfig
} from '../../infrastructure/opensandbox/config';
import {
  isConfirmedSandboxUnavailableError,
  isTransientSandboxConnectError,
  isUncertainControlPlaneError
} from '../../infrastructure/opensandbox/errors';
import {
  createRuntimeOpenSandboxClient,
  disconnectSandbox,
  type OpenSandboxClient
} from '../../infrastructure/opensandbox/opensandbox';
import {
  buildVolumeConfig,
  createSessionVolumeClaimName,
  getSessionVolumeClaimName,
  getSessionVolumeConfig
} from '../../infrastructure/volume/service';
import { ensureSandboxTeamOwnership } from '../ownership';
import { checkSandboxQuota } from '../quota';
import { assertSandboxSourceActive } from '../sourceGuard';
import { withSandboxLease } from '../lease';
import {
  recoverArchivingSandboxWithinLease,
  recoverSandboxActivationWithinLease
} from '../lifecycle/service';
import { runSandboxLifecycleOperation } from '../lifecycle/runner';
import { SandboxLifecycleStateError, SandboxOperationConflictError } from '../lifecycle/error';
import { restoreArchivedSandboxWithinLease } from '../archive';
import { stopSandboxResourceWithinLease } from '../resource';
import { createAgentSandboxInitializingError } from '../../error';
import { assertSandboxMigratedOrThrow } from '../../legacy';
import { SANDBOX_PROVIDER } from '../../type';
import { isSandboxRuntimeImageMatched, normalizeSandboxImage } from './image';
import type {
  SandboxClientQuery,
  SandboxRuntimeOptions,
  OwnedSandboxResource,
  PreparedSandboxRuntime
} from './type';
import { SandboxInstanceStatusEnum } from '../../constants';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

/** 内部错误：标识运行态快路径连接时发现实例已处于非 `running` 终态，触发慢路径租约重读收敛。 */
class SandboxRuntimeNotRunningError extends Error {
  constructor(readonly sandboxId: string) {
    super('Sandbox runtime instance is not running');
    this.name = 'SandboxRuntimeNotRunningError';
  }
}

/** 仅当错误来自已确认的容器丢失、非 Running 状态或工作区结构无效时，才允许进入停止重建流程。 */
const isConfirmedContainerDeadError = (error: unknown): boolean =>
  error instanceof SandboxRuntimeNotRunningError || isConfirmedSandboxUnavailableError(error);

/** 持久化 workspace 是连接真值，禁止用调用方旧 volume 配置覆盖新 generation。 */
function buildRuntimeConnection({
  resource,
  options,
  runtimeConfig
}: {
  resource: SandboxResourceDoc;
  options: SandboxRuntimeOptions;
  runtimeConfig?: OpenSandboxRuntimeConfig;
}): OpenSandboxClient {
  const claimName = getSessionVolumeClaimName(resource.storage);
  if (!claimName) {
    throw new Error(`OpenSandbox ${resource.sandboxId} has no persisted workspace claimName`);
  }
  return createRuntimeOpenSandboxClient({
    sandboxId: resource.sandboxId,
    remoteSandboxId: resource.instanceId || undefined,
    resourceLimits: options.resourceLimits,
    volumes: buildVolumeConfig(claimName).volumes,
    createConfig: options.createConfig,
    ...(runtimeConfig ? { runtimeConfig } : {})
  });
}

/**
 * 无锁连接已有 `running` 实例（快路径），不创建、不恢复、不升级；
 * 通过 `touchRunningSandboxInstance` 的 `workspaceClaimName` CAS 防止旧连接跨 generation 复用。
 */
async function connectRunningSandbox(params: {
  query: SandboxClientQuery;
  options: SandboxRuntimeOptions;
  resource: OwnedSandboxResource;
  opensandbox?: OpenSandboxClient;
  verifyHealth?: boolean;
  skipSourceCheck?: boolean;
  runtimeConfig: OpenSandboxRuntimeConfig;
}): Promise<PreparedSandboxRuntime> {
  const { query, options, resource } = params;
  if (!params.skipSourceCheck) {
    await assertSandboxSourceActive(query);
  }

  if (resource.status !== SandboxInstanceStatusEnum.running) {
    throw new SandboxRuntimeNotRunningError(query.sandboxId);
  }
  const touched = await touchRunningSandboxInstance({
    ...query,
    expectedWorkspaceClaimName: getSessionVolumeClaimName(resource.storage)
  });
  if (!touched) throw new SandboxRuntimeNotRunningError(query.sandboxId);

  const opensandbox =
    params.opensandbox ??
    buildRuntimeConnection({
      resource: touched,
      options,
      runtimeConfig: params.runtimeConfig
    });
  try {
    await opensandbox.connectRunning({
      verifyHealth: params.verifyHealth,
      remoteSandboxId: touched.instanceId || undefined
    });
    backfillSandboxInstanceIdIfNeeded(touched, opensandbox).catch(() => undefined);
    return {
      resource: {
        ...touched,
        teamId: resource.teamId,
        ...(opensandbox.id && !touched.instanceId ? { instanceId: opensandbox.id } : {})
      },
      opensandbox
    };
  } catch (error) {
    if (!params.opensandbox) await disconnectSandbox(opensandbox);
    if (isConfirmedContainerDeadError(error)) {
      throw new SandboxRuntimeNotRunningError(query.sandboxId);
    }
    throw error;
  }
}

/**
 * 运行准备与激活的统一决策链。慢路径在 Lifecycle Lease 内重读后，以当前记录执行全部操作。
 * 首次创建采用 Mongo `provisioning` 占位 + Store-Load 屏障，不额外持有 Source Mutation Lease。
 */
async function prepareSandboxRuntime(params: {
  query: SandboxClientQuery;
  options: SandboxRuntimeOptions;
  connection?: PreparedSandboxRuntime;
  verifyHealth?: boolean;
}): Promise<PreparedSandboxRuntime> {
  const { query, options } = params;
  // 目标连接和创建配置先完成纯解析；配置错误不能发生在旧容器清理或创建之后。
  const runtimeConfig = getOpenSandboxRuntimeConfig({
    resourceLimits: options.resourceLimits,
    createConfig: options.createConfig
  });
  const image = normalizeSandboxImage(runtimeConfig.image);

  const owned = params.connection
    ? { teamId: params.connection.resource.teamId, resource: params.connection.resource }
    : await ensureSandboxTeamOwnership(query);
  assertSandboxMigratedOrThrow(owned.resource);

  const matchesConfiguration = (resource: SandboxResourceDoc) =>
    resource.provider === SANDBOX_PROVIDER && isSandboxRuntimeImageMatched(image, resource.image);

  let forceVerifyHealth = params.verifyHealth === true;

  if (
    owned.resource &&
    matchesConfiguration(owned.resource) &&
    owned.resource.status === SandboxInstanceStatusEnum.running
  ) {
    try {
      return await connectRunningSandbox({
        query,
        options,
        resource: params.connection?.resource ?? { ...owned.resource, teamId: owned.teamId },
        opensandbox: params.connection?.opensandbox,
        verifyHealth: params.verifyHealth,
        skipSourceCheck: !params.connection,
        runtimeConfig
      });
    } catch (error) {
      if (isConfirmedContainerDeadError(error)) {
        // 已确认容器失效，进入租约内重读快照并决定是否停止重建。
      } else if (isTransientSandboxConnectError(error)) {
        // 控制面/网关/探测瞬时未决：进入租约后强制做真实远端健康核验，不直接销毁旧容器。
        forceVerifyHealth = true;
      } else {
        throw error;
      }
    }
  }

  return withSandboxLease({
    sandboxId: query.sandboxId,
    label: `prepare-sandbox:${query.sandboxId}`,
    fn: async (lease: RedisLeaseContext) => {
      await assertSandboxSourceActive(query);
      lease.assertValid();
      let current = await findSandboxInstanceBySource(query);

      const bindOwnedResource = (resource: SandboxResourceDoc): OwnedSandboxResource => {
        if (resource.sandboxId !== query.sandboxId || resource.teamId !== owned.teamId) {
          throw new Error(`Sandbox identity or team ownership mismatch: ${query.sandboxId}`);
        }
        return { ...resource, teamId: owned.teamId };
      };

      let upgraded = false;
      let wasRunningBeforeUpgrade = false;
      if (current) {
        bindOwnedResource(current);
        assertSandboxMigratedOrThrow(current);
        current = await recoverSandboxActivationWithinLease({
          resource: current,
          lease
        });
        if (current.status === SandboxInstanceStatusEnum.stopping) {
          current = await stopSandboxResourceWithinLease({ current, lease });
          if (!current) throw new SandboxOperationConflictError(query.sandboxId);
        }
        if (current.status === SandboxInstanceStatusEnum.archiving) {
          current = await recoverArchivingSandboxWithinLease({ resource: current, lease });
        }
        if (
          current.status !== SandboxInstanceStatusEnum.running &&
          current.status !== SandboxInstanceStatusEnum.stopped &&
          current.status !== SandboxInstanceStatusEnum.archived
        ) {
          throw new SandboxLifecycleStateError(current.status);
        }

        // 同 PVC 静默换镜像：先停掉旧容器卸载 RWO PVC（保留原 claimName，不走 S3 归档），再按新镜像原位重拉。
        if (
          (current.status === SandboxInstanceStatusEnum.running ||
            current.status === SandboxInstanceStatusEnum.stopped) &&
          !matchesConfiguration(current)
        ) {
          upgraded = true;
          options.onUpgrade?.();
          if (current.status === SandboxInstanceStatusEnum.running) {
            wasRunningBeforeUpgrade = true;
            // 显式镜像升级有意中断旧镜像活跃会话（不传 matchLastActiveAt），同时由 stopSandboxResourceWithinLease 校验 instanceId 与 PVC generation。
            current = await stopSandboxResourceWithinLease({
              current,
              lease
            });
            if (!current) throw new SandboxOperationConflictError(query.sandboxId);
          }
        }
      }

      let alreadyClaimed = false;
      if (!current) {
        await checkSandboxQuota({ teamId: owned.teamId, current: null });
        const claimName = createSessionVolumeClaimName({
          sandboxId: query.sandboxId,
          generationId: '0'
        });
        const created = await createSandboxProvisioningInstance({
          ...query,
          teamId: owned.teamId,
          storage: buildVolumeConfig(claimName).storage,
          ...(image ? { image } : {}),
          ...(options.resourceLimits ? { limit: options.resourceLimits } : {})
        });
        current = created.instance;
        alreadyClaimed = created.created;
        if (!current) throw new SandboxOperationConflictError(query.sandboxId);

        // Store-Load 屏障：落库 `provisioning` 占位后再次确认 source 未软删；若已删除则撤回占位记录。
        try {
          await assertSandboxSourceActive(query);
        } catch (error) {
          if (alreadyClaimed && current.operation?.id) {
            await deleteClaimedSandboxRecord({
              resource: current,
              operationId: current.operation.id,
              status: SandboxInstanceStatusEnum.provisioning
            }).catch(() => undefined);
          }
          throw error;
        }

        bindOwnedResource(current);
        if (!alreadyClaimed) {
          assertSandboxMigratedOrThrow(current);
          if (
            current.status !== SandboxInstanceStatusEnum.running &&
            current.status !== SandboxInstanceStatusEnum.stopped
          ) {
            throw new SandboxLifecycleStateError(current.status);
          }
        }
      }

      if (current.status === SandboxInstanceStatusEnum.archived) {
        await checkSandboxQuota({ teamId: owned.teamId, current });
        try {
          current = await restoreArchivedSandboxWithinLease({
            resource: bindOwnedResource(current),
            lease,
            resourceLimit: options.resourceLimits,
            createConfig: options.createConfig
          });
        } catch (error) {
          // 数据面 /restore 或确定性拒绝失败时控制面状态已明确，立即在同一租约内销毁临时容器与新 PVC 并退回 archived 释放配额；
          // 仅当控制面创建本身处于未收到响应的传输未决状态时保留 240s 冷却窗口防止在途创建迟到逃逸。
          if (!lease.signal.aborted && !isUncertainControlPlaneError(error)) {
            const targetSandboxId = current.sandboxId;
            const failed = await findSandboxInstanceBySandboxId({
              sandboxId: targetSandboxId
            });
            if (failed) {
              await recoverSandboxActivationWithinLease({
                resource: failed,
                lease,
                now: new Date(Date.now() + 1)
              }).catch((recoverError) => {
                logger.warn('Failed to immediately recover sandbox restore failure', {
                  sandboxId: targetSandboxId,
                  error: recoverError
                });
              });
            }
          }
          throw error;
        }
      }

      if (current.status === SandboxInstanceStatusEnum.stopped && !wasRunningBeforeUpgrade) {
        await checkSandboxQuota({ teamId: owned.teamId, current });
      }

      let opensandbox = buildRuntimeConnection({ resource: current, options, runtimeConfig });
      try {
        if (current.status === SandboxInstanceStatusEnum.running) {
          try {
            lease.assertValid();
            await opensandbox.connectRunning({
              verifyHealth: forceVerifyHealth,
              remoteSandboxId: current.instanceId || undefined
            });
            lease.assertValid();
            await backfillSandboxInstanceIdIfNeeded(current, opensandbox);
            return {
              resource: bindOwnedResource({
                ...current,
                ...(opensandbox.id && !current.instanceId ? { instanceId: opensandbox.id } : {})
              }),
              opensandbox
            };
          } catch (error) {
            // 仅在远端已明确证实容器失效/丢失时才进入 stopping 重建；瞬时 502/503 等结果未决错误保留原运行实例并向上抛错。
            if (!isConfirmedContainerDeadError(error)) {
              throw error;
            }
            // 远端容器已失效或驱逐：先收口到 stopped（卸载残留并 unset instanceId），再在同一 PVC 上重拉；
            // 已在同一租约内确认远端容器失效，不按 lastActiveAt 拦截，但仍由 stopSandboxResourceWithinLease 校验物理实例代次。
            await disconnectSandbox(opensandbox);
            const stopped = await stopSandboxResourceWithinLease({
              current,
              lease
            });
            if (!stopped) throw new SandboxOperationConflictError(query.sandboxId);
            current = stopped;
            opensandbox = buildRuntimeConnection({ resource: current, options, runtimeConfig });
          }
        }

        const activated = await runSandboxLifecycleOperation({
          resource: current,
          lease,
          claim: alreadyClaimed ? { type: 'created' } : undefined,
          definition: {
            status: SandboxInstanceStatusEnum.provisioning,
            steps: [
              {
                fromPhase: 'claimed',
                toPhase: 'providerEnsured',
                run: async ({ resource, operationId, assertValid }) => {
                  const claimName = getSessionVolumeClaimName(resource.storage);
                  if (claimName) {
                    await getSessionVolumeConfig(claimName, {
                      allowLegacyUnlabeled: !alreadyClaimed
                    });
                  }
                  assertValid();
                  await opensandbox.ensureRunning({ signal: lease.signal, operationId });
                  return {
                    ...(image ? { image } : {}),
                    ...(opensandbox.id ? { instanceId: opensandbox.id } : {})
                  };
                }
              }
            ],
            finish: {
              type: 'complete',
              status: SandboxInstanceStatusEnum.running,
              touchActive: true
            }
          }
        });
        if (upgraded) {
          options.onUpgradeComplete?.();
        }
        return { resource: bindOwnedResource(activated), opensandbox };
      } catch (error) {
        await disconnectSandbox(opensandbox);
        throw error;
      }
    }
  });
}

/** 完整激活入口，所有业务使用与 client 再次使用都经过同一决策链。 */
export async function ensureSandboxRuntime(params: {
  query: SandboxClientQuery;
  options?: SandboxRuntimeOptions;
  connection?: PreparedSandboxRuntime;
  verifyHealth?: boolean;
}): Promise<PreparedSandboxRuntime> {
  try {
    return await prepareSandboxRuntime({
      ...params,
      options: params.options ?? {}
    });
  } catch (error) {
    if (
      isRedisLeaseError(error) ||
      error instanceof SandboxOperationConflictError ||
      error instanceof SandboxLifecycleStateError
    )
      throw createAgentSandboxInitializingError();
    throw error;
  }
}
