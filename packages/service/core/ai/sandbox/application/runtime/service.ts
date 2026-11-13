/** 运行准备的唯一编排入口：归属、镜像升级重建和激活；client 不解释生命周期。 */
import { getInstanceId } from '../../../../../common/system/config/instanceId';
import {
  createRuntimeOpenSandboxClient,
  type OpenSandboxClient
} from '../../infrastructure/opensandbox/opensandbox';
import { SandboxNotFoundError, SandboxStateError } from '../../infrastructure/opensandbox/errors';
import { getOpenSandboxRuntimeConfig } from '../../infrastructure/opensandbox/config';
import { isRedisLeaseError } from '@fastgpt/dal/redis/caches';
import {
  createSandboxProvisioningInstance,
  deleteUnprovisionedSandboxRecord,
  findSandboxInstanceBySource,
  touchRunningSandboxInstance,
  updateStoppedSandboxImage,
  type SandboxResourceDoc
} from '../../infrastructure/instance/repository';
import {
  buildVolumeConfig,
  createSessionVolumeClaimName,
  ensureSessionVolume,
  getSessionVolumeClaimName
} from '../../infrastructure/volume/service';
import { ensureSandboxTeamOwnership } from '../ownership';
import { checkSandboxQuota } from '../quota';
import { assertSandboxSourceActive } from '../sourceGuard';
import { withSandboxLifecycleLease } from '../lease';
import { recoverSandboxActivationWithinLease } from '../lifecycle/service';
import { runSandboxLifecycleOperation } from '../lifecycle/runner';
import { SandboxLifecycleStateError, SandboxOperationConflictError } from '../lifecycle/error';
import { stopSandboxResourceWithinLease } from '../resource';
import { createAgentSandboxInitializingError, SandboxRuntimeNotRunningError } from '../../error';
import type {
  SandboxClientQuery,
  SandboxRuntimeOptions,
  OwnedSandboxResource,
  PreparedSandboxRuntime
} from './type';

/** workspace、部署和容器身份由持久化记录决定，调用方 metadata 不能覆盖部署归属。 */
async function buildRuntimeConnection(params: {
  resource: SandboxResourceDoc;
  options: SandboxRuntimeOptions;
  remoteSandboxId?: string;
}) {
  const { resource, options, remoteSandboxId } = params;
  const deploymentId = await getInstanceId();
  const claimName = getSessionVolumeClaimName(resource.storage);
  if (!claimName) {
    throw new Error(`OpenSandbox ${resource.sandboxId} has no persisted workspace claimName`);
  }
  return createRuntimeOpenSandboxClient({
    ...options,
    sandboxId: resource.sandboxId,
    deploymentId,
    remoteSandboxId,
    vmConfig: buildVolumeConfig(claimName)
  });
}

/**
 * 续期并连接已确认处于 running 状态的实例记录；若 DB 记录已变化则由调用方决定报错或转入慢路径。
 */
async function tryConnectTouchedRunningSandbox(params: {
  query: SandboxClientQuery;
  options: SandboxRuntimeOptions;
  resource: SandboxResourceDoc;
  teamId: string;
  opensandbox?: OpenSandboxClient;
  verifyHealth?: boolean;
}): Promise<PreparedSandboxRuntime | null> {
  const { query, options, resource, teamId, verifyHealth } = params;
  const touched = await touchRunningSandboxInstance({
    ...query,
    expectedWorkspaceClaimName: getSessionVolumeClaimName(resource.storage)
  });
  if (!touched) return null;
  const client =
    params.opensandbox ??
    (await buildRuntimeConnection({
      resource: touched,
      options,
      remoteSandboxId: touched.instanceId
    }));
  try {
    await client.connectRunning({ verifyHealth });
    return { resource: { ...touched, teamId }, opensandbox: client };
  } catch (error) {
    if (!params.opensandbox) await client.close().catch(() => undefined);
    if (error instanceof SandboxNotFoundError || error instanceof SandboxStateError) {
      throw new SandboxRuntimeNotRunningError(query.sandboxId);
    }
    throw error;
  }
}

/**
 * 连接已有 running 实例，不创建、不恢复、不迁移，仅供激活快路径复用。
 */
async function connectRunningSandbox(params: {
  query: SandboxClientQuery;
  options?: SandboxRuntimeOptions;
  resource?: OwnedSandboxResource;
  opensandbox?: OpenSandboxClient;
  verifyHealth?: boolean;
}): Promise<PreparedSandboxRuntime> {
  const options = params.options ?? {};
  const { teamId, resource } = params.resource
    ? { teamId: params.resource.teamId, resource: params.resource }
    : await ensureSandboxTeamOwnership(params.query);
  if (params.resource) await assertSandboxSourceActive(params.query);
  if (!resource || resource.status !== 'running') {
    throw new SandboxRuntimeNotRunningError(params.query.sandboxId);
  }
  const connected = await tryConnectTouchedRunningSandbox({
    query: params.query,
    options,
    resource,
    teamId,
    opensandbox: params.opensandbox,
    verifyHealth: params.verifyHealth
  });
  if (!connected) throw new SandboxRuntimeNotRunningError(params.query.sandboxId);
  return connected;
}

/**
 * 统一配置收敛与完整激活决策链：
 *
 * - 快路径：已处于 `running` 且镜像配置匹配时无锁乐观直连（`verifyHealth: false`）。
 * - 慢路径：仅按单实例 `sandboxId` 获取有界等待的 `Lifecycle Lease`，重读最新 Mongo 真值、
 *   执行镜像就地升级或异常收敛并探测工作区健康后激活或重建。
 */
async function prepareSandboxRuntime(params: {
  query: SandboxClientQuery;
  options: SandboxRuntimeOptions;
  connection?: PreparedSandboxRuntime;
  verifyHealth?: boolean;
}): Promise<PreparedSandboxRuntime> {
  const { query, options, verifyHealth = false } = params;
  const { createConfig: resolvedCreateConfig } = getOpenSandboxRuntimeConfig({
    runtime: true,
    sessionId: query.sandboxId,
    resourceLimits: options.resourceLimits,
    createConfig: options.createConfig
  });
  const image = resolvedCreateConfig?.image?.trim();
  const owned = params.connection
    ? { teamId: params.connection.resource.teamId, resource: params.connection.resource }
    : await ensureSandboxTeamOwnership(query);
  const matchesConfiguration = (resource: SandboxResourceDoc) => !image || resource.image === image;

  // 1. 快路径：配置一致且已处于 running 稳定态时，避免进入 Redis Lifecycle Lease。
  if (
    owned.resource &&
    matchesConfiguration(owned.resource) &&
    owned.resource.status === 'running'
  ) {
    try {
      if (params.connection) {
        return await connectRunningSandbox({
          query,
          options,
          ...params.connection,
          verifyHealth
        });
      }
      const connected = await tryConnectTouchedRunningSandbox({
        query,
        options,
        resource: owned.resource,
        teamId: owned.teamId,
        verifyHealth
      });
      if (connected) return connected;
    } catch (error) {
      if (
        !(error instanceof SandboxNotFoundError) &&
        !(error instanceof SandboxRuntimeNotRunningError) &&
        !(error instanceof SandboxStateError)
      ) {
        throw error;
      }
    }
  }

  // 2. 慢路径：在单实例 Lifecycle Lease 内有界排队，重读最新 Mongo 真值并完成收敛或激活。
  return withSandboxLifecycleLease({
    sandboxId: query.sandboxId,
    label: `prepare-sandbox:${query.sandboxId}`,
    fn: async (lease) => {
      await assertSandboxSourceActive(query);
      lease.assertValid();

      let current = await findSandboxInstanceBySource(query);
      let upgradedFromRunning = false;
      const bindOwnedResource = (resource: SandboxResourceDoc): OwnedSandboxResource => {
        if (resource.sandboxId !== query.sandboxId || resource.teamId !== owned.teamId) {
          throw new Error(`Sandbox identity or team ownership mismatch: ${query.sandboxId}`);
        }
        return { ...resource, teamId: owned.teamId };
      };

      // 2.1 收敛前序中断的过渡态（provisioning / stopping）或执行镜像就地升级。
      if (current) {
        bindOwnedResource(current);
        current = await recoverSandboxActivationWithinLease({
          resource: current,
          lease
        });
        if (current.status === 'stopping') {
          current = await stopSandboxResourceWithinLease({ current, resource: current, lease });
          if (!current) throw new SandboxOperationConflictError(query.sandboxId);
        }
        if (
          !matchesConfiguration(current) &&
          (current.status === 'running' || current.status === 'stopped')
        ) {
          options.onUpgrade?.();
          if (current.status === 'running') {
            upgradedFromRunning = true;
            current = await stopSandboxResourceWithinLease({ current, resource: current, lease });
            if (!current) throw new SandboxOperationConflictError(query.sandboxId);
          }
          current = await updateStoppedSandboxImage({ resource: current, image });
          if (!current) throw new SandboxOperationConflictError(query.sandboxId);
        }
        if (current.status !== 'running' && current.status !== 'stopped') {
          throw new SandboxLifecycleStateError(current.status);
        }
      }

      // 2.2 首次创建：先插入 provisioning 占位，再执行 Store-Load 屏障复检业务未被并发软删除。
      let alreadyClaimed = false;
      if (!current) {
        await checkSandboxQuota({ teamId: owned.teamId, current: null });
        const created = await createSandboxProvisioningInstance({
          ...query,
          teamId: owned.teamId,
          storage: buildVolumeConfig(createSessionVolumeClaimName({ sandboxId: query.sandboxId }))
            .storage,
          ...(image ? { image } : {}),
          ...(options.resourceLimits ? { resourceLimits: options.resourceLimits } : {})
        });
        current = created.instance;
        alreadyClaimed = created.created;
        if (!current) throw new SandboxOperationConflictError(query.sandboxId);
        bindOwnedResource(current);

        if (alreadyClaimed) {
          try {
            await assertSandboxSourceActive(query);
          } catch (error) {
            lease.assertValid();
            if (current.operation?.id) {
              await deleteUnprovisionedSandboxRecord({
                resource: current,
                operationId: current.operation.id
              }).catch(() => {});
            }
            throw error;
          }
        }

        if (!alreadyClaimed && current.status !== 'running' && current.status !== 'stopped') {
          throw new SandboxLifecycleStateError(current.status);
        }
      }

      // 2.3 从 stopped 唤醒时校验配额（镜像就地升级已在运行配额内，不重复占额）。
      if (current.status === 'stopped' && !upgradedFromRunning) {
        await checkSandboxQuota({ teamId: owned.teamId, current });
      }

      // 2.4 复用队列前序请求刚拉起的 running 容器，或按 provisioning 流程修复/拉起远端资源。
      let deleteUnhealthyRemote = false;
      const client = await buildRuntimeConnection({
        resource: current,
        options,
        remoteSandboxId: current.status === 'running' ? current.instanceId : undefined
      });
      try {
        if (current.status === 'running') {
          try {
            lease.assertValid();
            await client.connectRunning({ verifyHealth: true });
            lease.assertValid();
            const touched = await touchRunningSandboxInstance({
              ...query,
              expectedWorkspaceClaimName: getSessionVolumeClaimName(current.storage)
            });
            return { resource: bindOwnedResource(touched ?? current), opensandbox: client };
          } catch (error) {
            if (!(error instanceof SandboxNotFoundError) && !(error instanceof SandboxStateError)) {
              throw error;
            }
            deleteUnhealthyRemote = error instanceof SandboxStateError;
          }
        }

        const activated = await runSandboxLifecycleOperation({
          resource: current,
          lease,
          claim: alreadyClaimed ? { type: 'created' } : undefined,
          definition: {
            status: 'provisioning',
            steps: [
              {
                fromPhase: 'claimed',
                toPhase: 'providerEnsured',
                run: async ({ resource, assertValid }) => {
                  await assertSandboxSourceActive(query);
                  assertValid();
                  // 远端容器处于 Error 或 FUSE 断连等异常态时先彻底销毁，再触发卷修复与重建。
                  if (deleteUnhealthyRemote) {
                    await client.delete();
                    assertValid();
                  }
                  const claimName = getSessionVolumeClaimName(resource.storage);
                  if (claimName) await ensureSessionVolume(claimName);
                  assertValid();
                  await client.ensureRunning();
                  const resolvedInstanceId = (
                    client.id ?? (await client.getInfo().catch(() => null))?.id
                  )?.trim();
                  if (!resolvedInstanceId) {
                    throw new Error(
                      `OpenSandbox ensured running without returning instanceId: ${resource.sandboxId}`
                    );
                  }
                  return {
                    ...(image ? { image } : {}),
                    instanceId: resolvedInstanceId
                  };
                }
              }
            ],
            finish: { type: 'complete', status: 'running', touchActive: true }
          }
        });
        return { resource: bindOwnedResource(activated), opensandbox: client };
      } catch (error) {
        await client.close().catch(() => undefined);
        throw error;
      }
    }
  });
}

/** 完整激活入口：确保实例配置匹配、远端资源可用并返回已绑定的 OpenSandbox 客户端。 */
export async function ensureSandboxRuntime(params: {
  query: SandboxClientQuery;
  options?: SandboxRuntimeOptions;
  connection?: PreparedSandboxRuntime;
  verifyHealth?: boolean;
}): Promise<PreparedSandboxRuntime> {
  try {
    return await prepareSandboxRuntime({
      query: params.query,
      options: params.options ?? {},
      connection: params.connection,
      verifyHealth: params.verifyHealth
    });
  } catch (error) {
    if (
      isRedisLeaseError(error) ||
      error instanceof SandboxOperationConflictError ||
      error instanceof SandboxLifecycleStateError
    ) {
      throw createAgentSandboxInitializingError();
    }
    throw error;
  }
}
