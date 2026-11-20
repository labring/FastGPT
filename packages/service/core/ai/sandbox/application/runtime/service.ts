/** 运行准备的唯一编排入口：归属、迁移门禁、恢复、静默升级和激活；client 不解释生命周期。 */
import { SandboxApiException } from '@alibaba-group/opensandbox';
import { isRedisLeaseError, type RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import {
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
  isUncertainControlPlaneError,
  SandboxNotFoundError,
  SandboxStateError
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
import { createAgentSandboxInitializingError, SandboxRuntimeNotRunningError } from '../../error';
import { assertSandboxMigratedOrThrow, backfillLegacyInstanceIdIfNeeded } from '../../legacy';
import { SANDBOX_PROVIDER } from '../../type';
import { isSandboxRuntimeImageMatched } from './image';
import type {
  SandboxClientQuery,
  SandboxRuntimeOptions,
  OwnedSandboxResource,
  PreparedSandboxRuntime
} from './type';
import { SandboxInstanceStatusEnum } from '../../constants';

const logger = getLogger(LogCategories.MODULE.AI.SANDBOX);

/**
 * 检查错误或其 cause 链是否表示底层容器已缺失或处于不健康状态，避免误复用失效实例。
 * 深度上限同时防御 cause 环引用，无需额外记录已访问节点。
 */
const isContainerMissingOrUnhealthyError = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (
      current instanceof SandboxNotFoundError ||
      current instanceof SandboxStateError ||
      current instanceof SandboxRuntimeNotRunningError ||
      (current instanceof SandboxApiException &&
        (current.statusCode === 404 || current.statusCode === 502 || current.statusCode === 503))
    ) {
      return true;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
};

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
 * 连接已有 running 实例，不创建、不恢复、不升级。用于 proxy 保活，也供激活快路径复用。
 * touch 的 identity/claimName CAS 防止旧连接跨 generation 继续使用。
 */
export async function connectRunningSandbox(params: {
  query: SandboxClientQuery;
  options?: SandboxRuntimeOptions;
  resource?: OwnedSandboxResource;
  opensandbox?: OpenSandboxClient;
  verifyHealth?: boolean;
  /** 内部优化：调用方已执行过 `ensureSandboxTeamOwnership` 时跳过重复活跃校验。 */
  skipSourceCheck?: boolean;
  /** 内部优化：复用外层已校验的 OpenSandbox 运行态配置，避免重复解析。 */
  runtimeConfig?: OpenSandboxRuntimeConfig;
}): Promise<PreparedSandboxRuntime> {
  const options = params.options ?? {};
  const { teamId, resource } = params.resource
    ? { teamId: params.resource.teamId, resource: params.resource }
    : await ensureSandboxTeamOwnership(params.query);
  if (params.resource && !params.skipSourceCheck) {
    await assertSandboxSourceActive(params.query);
  }

  assertSandboxMigratedOrThrow(resource);
  if (!resource || resource.status !== SandboxInstanceStatusEnum.running) {
    throw new SandboxRuntimeNotRunningError(params.query.sandboxId);
  }
  const touched = await touchRunningSandboxInstance({
    ...params.query,
    expectedWorkspaceClaimName: getSessionVolumeClaimName(resource.storage)
  });
  if (!touched) throw new SandboxRuntimeNotRunningError(params.query.sandboxId);

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
    backfillLegacyInstanceIdIfNeeded(touched, opensandbox);
    return {
      resource: {
        ...touched,
        teamId,
        ...(opensandbox.id && !touched.instanceId ? { instanceId: opensandbox.id } : {})
      },
      opensandbox
    };
  } catch (error) {
    if (!params.opensandbox) await disconnectSandbox(opensandbox);
    if (isContainerMissingOrUnhealthyError(error)) {
      throw new SandboxRuntimeNotRunningError(params.query.sandboxId);
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
  const image = runtimeConfig.image;

  const owned = params.connection
    ? { teamId: params.connection.resource.teamId, resource: params.connection.resource }
    : await ensureSandboxTeamOwnership(query);
  assertSandboxMigratedOrThrow(owned.resource);

  const matchesConfiguration = (resource: SandboxResourceDoc) =>
    resource.provider === SANDBOX_PROVIDER && isSandboxRuntimeImageMatched(image, resource.image);

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
      if (!isContainerMissingOrUnhealthyError(error)) {
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
            // 传入当前快照的 lastActiveAt 做 CAS，防止并发无锁保活或快路径刷新活跃时间后仍抢占停机。
            current = await stopSandboxResourceWithinLease({
              current,
              matchLastActiveAt: current.lastActiveAt,
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

      if (current.status === SandboxInstanceStatusEnum.stopped) {
        await checkSandboxQuota({ teamId: owned.teamId, current });
      }

      let opensandbox = buildRuntimeConnection({ resource: current, options, runtimeConfig });
      try {
        if (current.status === SandboxInstanceStatusEnum.running) {
          try {
            lease.assertValid();
            await opensandbox.connectRunning({
              verifyHealth: params.verifyHealth,
              remoteSandboxId: current.instanceId || undefined
            });
            lease.assertValid();
            backfillLegacyInstanceIdIfNeeded(current, opensandbox);
            return {
              resource: bindOwnedResource({
                ...current,
                ...(opensandbox.id && !current.instanceId ? { instanceId: opensandbox.id } : {})
              }),
              opensandbox
            };
          } catch (error) {
            if (!isContainerMissingOrUnhealthyError(error)) {
              throw error;
            }
            // 远端容器已失效或驱逐：先收口到 stopped（卸载残留并 unset instanceId），再在同一 PVC 上重拉。
            // 传入当前快照的 lastActiveAt 做 CAS，避免与并发无锁保活竞态误停已恢复或刚续期的运行中容器。
            await disconnectSandbox(opensandbox);
            const stopped = await stopSandboxResourceWithinLease({
              current,
              matchLastActiveAt: current.lastActiveAt,
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
