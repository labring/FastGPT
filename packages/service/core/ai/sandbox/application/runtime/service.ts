/** 运行准备的唯一编排入口：归属、恢复、配置迁移和激活；client 不解释生命周期。 */
import type { ISandbox } from '@fastgpt-sdk/sandbox-adapter';
import { SandboxNotFoundError, SandboxStateError } from '@fastgpt-sdk/sandbox-adapter';
import { isRedisLeaseError, type RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import {
  createSandboxProvisioningInstance,
  findSandboxInstanceBySource,
  switchArchivedSandboxProvider,
  touchRunningSandboxInstance,
  type SandboxResourceDoc
} from '../../infrastructure/instance/repository';
import { buildRuntimeSandboxAdapter } from '../../infrastructure/provider/adapter';
import {
  getConfiguredSandboxProvider,
  getSandboxAdapterConfig
} from '../../infrastructure/provider/config';
import {
  buildVolumeConfig,
  createSessionVolumeClaimName,
  getSessionVolumeClaimName,
  getSessionVolumeConfig
} from '../../infrastructure/volume/service';
import { ensureSandboxTeamOwnership } from '../ownership';
import { checkSandboxQuota } from '../quota';
import { assertSandboxSourceActive } from '../sourceGuard';
import { withSandboxLifecycleLease, withSandboxSourceMutationLease } from '../lease';
import { recoverSandboxActivationWithinLease } from '../lifecycle/service';
import { runSandboxLifecycleOperation } from '../lifecycle/runner';
import { SandboxLifecycleStateError, SandboxOperationConflictError } from '../lifecycle/error';
import { archiveSandboxResourceWithinLease, restoreArchivedSandboxWithinLease } from '../archive';
import { stopSandboxResourceWithinLease } from '../resource';
import { createAgentSandboxInitializingError, SandboxRuntimeNotRunningError } from '../../error';
import { isSandboxRuntimeImageMatched, resolveSandboxRuntimeImage } from './image';
import type {
  SandboxClientQuery,
  SandboxRuntimeOptions,
  OwnedSandboxResource,
  PreparedSandboxRuntime
} from './type';
import {
  SANDBOX_RUNTIME_CONFIGURATION_TIMEOUT_MS,
  SANDBOX_RUNTIME_CONFIGURATION_RETRY_INTERVAL_MS
} from '../../constants';

/** 持久化 workspace 是连接真值，禁止用调用方旧 volume 配置覆盖新 generation。 */
function buildRuntimeConnection(resource: SandboxResourceDoc, options: SandboxRuntimeOptions) {
  const claimName = getSessionVolumeClaimName(resource.storage);
  if (resource.provider === 'opensandbox' && !claimName) {
    throw new Error(`OpenSandbox ${resource.sandboxId} has no persisted workspace claimName`);
  }
  return buildRuntimeSandboxAdapter(resource.provider, resource.sandboxId, {
    ...options,
    vmConfig:
      resource.provider === 'opensandbox' && claimName ? buildVolumeConfig(claimName) : undefined
  });
}

/**
 * 连接已有 running 实例，不创建、不恢复、不迁移。用于 proxy 保活，也供激活快路径复用。
 * touch 的 identity/claimName CAS 防止旧连接跨 generation 继续使用。
 */
export async function connectRunningSandbox(params: {
  query: SandboxClientQuery;
  options?: SandboxRuntimeOptions;
  resource?: OwnedSandboxResource;
  adapter?: ISandbox;
}): Promise<PreparedSandboxRuntime> {
  const options = params.options ?? {};
  const { teamId, resource } = params.resource
    ? { teamId: params.resource.teamId, resource: params.resource }
    : await ensureSandboxTeamOwnership(params.query);
  if (params.resource) await assertSandboxSourceActive(params.query);
  const provider = options.providerName ?? getConfiguredSandboxProvider();
  if (!resource || resource.provider !== provider || resource.status !== 'running') {
    throw new SandboxRuntimeNotRunningError(params.query.sandboxId);
  }
  const touched = await touchRunningSandboxInstance({
    ...params.query,
    provider,
    expectedWorkspaceClaimName: getSessionVolumeClaimName(resource.storage)
  });
  if (!touched) throw new SandboxRuntimeNotRunningError(params.query.sandboxId);
  const adapter = params.adapter ?? buildRuntimeConnection(resource, options);
  try {
    await adapter.connectRunning();
    return { resource: { ...touched, teamId }, adapter };
  } catch (error) {
    if (!params.adapter) await adapter.close().catch(() => undefined);
    if (error instanceof SandboxNotFoundError || error instanceof SandboxStateError)
      throw new SandboxRuntimeNotRunningError(params.query.sandboxId);
    throw error;
  }
}

/**
 * 共用配置收敛与完整激活的决策链。慢路径锁内重读后，以当前记录执行全部操作。
 * 首次创建及缺失 Provider 的重建使用 Source -> Lifecycle；其他操作只取得 Lifecycle。
 */
async function prepareSandboxRuntime(params: {
  query: SandboxClientQuery;
  options: SandboxRuntimeOptions;
  target: 'configuration' | 'running';
  connection?: PreparedSandboxRuntime;
}) {
  const { query, options } = params;
  const provider = options.providerName ?? getConfiguredSandboxProvider();
  const image = resolveSandboxRuntimeImage({
    provider,
    sandboxId: query.sandboxId,
    createConfig: options.createConfig
  });
  // 目标连接和创建配置先完成纯解析；配置错误不能发生在旧资源已归档删除之后。
  getSandboxAdapterConfig({
    provider,
    runtime: true,
    sessionId: query.sandboxId,
    resourceLimits: options.resourceLimits,
    createConfig: options.createConfig
  });
  const owned = params.connection
    ? { teamId: params.connection.resource.teamId, resource: params.connection.resource }
    : await ensureSandboxTeamOwnership(query);
  let repairMissingProvider = false;
  const matchesConfiguration = (resource: SandboxResourceDoc) =>
    resource.provider === provider && isSandboxRuntimeImageMatched(image, resource.image);

  if (owned.resource && matchesConfiguration(owned.resource)) {
    if (
      params.target === 'configuration' &&
      ['running', 'stopped', 'archived'].includes(owned.resource.status)
    )
      return { resource: owned.resource, adapter: null };
    if (owned.resource.status === 'running') {
      try {
        // 复用 client 时 source 会变化；首次调用的归属准备已经读取 source。
        if (!params.connection) {
          const touched = await touchRunningSandboxInstance({
            ...query,
            provider,
            expectedWorkspaceClaimName: getSessionVolumeClaimName(owned.resource.storage)
          });
          if (touched) {
            const adapter = buildRuntimeConnection(touched, options);
            try {
              await adapter.connectRunning();
              return { resource: { ...touched, teamId: owned.teamId }, adapter };
            } catch (error) {
              await adapter.close().catch(() => undefined);
              throw error;
            }
          }
        } else {
          return await connectRunningSandbox({ query, options, ...params.connection });
        }
      } catch (error) {
        if (
          !(error instanceof SandboxNotFoundError) &&
          !(error instanceof SandboxRuntimeNotRunningError) &&
          !(error instanceof SandboxStateError)
        )
          throw error;
        repairMissingProvider = true;
      }
    }
  }

  const missingProviderRequiresSourceLease = new Error(
    'Missing provider repair requires source lease'
  );
  const runWithinLease = async ({
    lease,
    allowRecordCreate,
    allowProviderRepair
  }: {
    lease: RedisLeaseContext;
    allowRecordCreate: boolean;
    allowProviderRepair: boolean;
  }) => {
    await assertSandboxSourceActive(query);
    lease.assertValid();
    let current = await findSandboxInstanceBySource(query);
    const bindOwnedResource = (resource: SandboxResourceDoc): OwnedSandboxResource => {
      if (resource.sandboxId !== query.sandboxId || resource.teamId !== owned.teamId) {
        throw new Error(`Sandbox identity or team ownership mismatch: ${query.sandboxId}`);
      }
      return { ...resource, teamId: owned.teamId };
    };
    if (current) {
      bindOwnedResource(current);
      current = await recoverSandboxActivationWithinLease({
        resource: current,
        lease,
        rollbackRestore: current.provider !== provider
      });
      if (current.status === 'stopping') {
        current = await stopSandboxResourceWithinLease({ current, resource: current, lease });
        if (!current) throw new SandboxOperationConflictError(query.sandboxId);
      }
      if (
        current.status === 'archiving' ||
        (!matchesConfiguration(current) &&
          (current.status === 'running' || current.status === 'stopped'))
      ) {
        options.onUpgrade?.();
        const result = await archiveSandboxResourceWithinLease(current, lease);
        if (result.status === 'failed') throw new Error(result.error);
        if (result.status === 'skipped') throw new SandboxLifecycleStateError(current.status);
        current = result.resource;
      }
      if (
        current.status !== 'running' &&
        current.status !== 'stopped' &&
        current.status !== 'archived'
      ) {
        throw new SandboxLifecycleStateError(current.status);
      }
      if (current.provider !== provider) {
        options.onUpgrade?.();
        // 完整运行配置在任何破坏性操作前已经解析；这里只切换 archived 记录。
        if (current.status !== 'archived') throw new SandboxLifecycleStateError(current.status);
        lease.assertValid();
        current = await switchArchivedSandboxProvider({ resource: current, provider, image });
        if (!current) throw new SandboxOperationConflictError(query.sandboxId);
      }
    }
    if (params.target === 'configuration')
      return { resource: current ? bindOwnedResource(current) : null, adapter: null };

    let alreadyClaimed = false;
    if (!current) {
      if (!allowRecordCreate) throw new Error('Sandbox record disappeared before activation');
      await checkSandboxQuota({ teamId: owned.teamId, current: null });
      const created = await createSandboxProvisioningInstance({
        ...query,
        provider,
        teamId: owned.teamId,
        ...(provider === 'opensandbox'
          ? {
              storage: buildVolumeConfig(
                createSessionVolumeClaimName({ sandboxId: query.sandboxId, generationId: '0' })
              ).storage
            }
          : {}),
        ...(image ? { image } : {}),
        ...(options.resourceLimits ? { limit: options.resourceLimits } : {})
      });
      current = created.instance;
      alreadyClaimed = created.created;
      if (!current) throw new SandboxOperationConflictError(query.sandboxId);
      bindOwnedResource(current);
      if (
        current.provider !== provider ||
        (!alreadyClaimed && current.status !== 'running' && current.status !== 'stopped')
      ) {
        throw new SandboxLifecycleStateError(current.status);
      }
    }
    if (current.status === 'archived') {
      await checkSandboxQuota({ teamId: owned.teamId, current });
      const restored = await restoreArchivedSandboxWithinLease({
        resource: bindOwnedResource(current),
        lease,
        resourceLimit: options.resourceLimits,
        createConfig: options.createConfig
      });
      current = restored;
    }
    if (current.status === 'stopped') await checkSandboxQuota({ teamId: owned.teamId, current });
    const adapter = buildRuntimeConnection(current, options);
    try {
      if (current.status === 'running') {
        try {
          lease.assertValid();
          await adapter.connectRunning();
          lease.assertValid();
          return { resource: bindOwnedResource(current), adapter };
        } catch (error) {
          if (!(error instanceof SandboxNotFoundError) && !(error instanceof SandboxStateError))
            throw error;
          if (!allowProviderRepair) throw missingProviderRequiresSourceLease;
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
                const claimName = getSessionVolumeClaimName(resource.storage);
                if (claimName) await getSessionVolumeConfig(claimName);
                assertValid();
                await adapter.ensureRunning();
                return image ? { image } : {};
              }
            }
          ],
          finish: { type: 'complete', status: 'running', touchActive: true }
        }
      });
      return { resource: bindOwnedResource(activated), adapter };
    } catch (error) {
      await adapter.close().catch(() => undefined);
      throw error;
    }
  };
  const withLifecycle = (allowCreate: boolean, sourceLease?: RedisLeaseContext) =>
    withSandboxLifecycleLease({
      sandboxId: query.sandboxId,
      label: `prepare-sandbox:${query.sandboxId}`,
      fn: (lease) =>
        runWithinLease({
          lease: sourceLease
            ? {
                signal: AbortSignal.any([sourceLease.signal, lease.signal]),
                assertValid: () => {
                  sourceLease.assertValid();
                  lease.assertValid();
                }
              }
            : lease,
          allowRecordCreate: allowCreate,
          allowProviderRepair: Boolean(sourceLease)
        })
    });
  const withSource = () =>
    withSandboxSourceMutationLease({
      ...query,
      label: `prepare-sandbox-source:${query.sandboxId}`,
      fn: (lease) => withLifecycle(!owned.resource, lease)
    });
  if (!owned.resource || repairMissingProvider) return withSource();
  try {
    return await withLifecycle(false);
  } catch (error) {
    if (error !== missingProviderRequiresSourceLease) throw error;
    // 缺失资源可能在锁内才被发现；先释放 Lifecycle，再按统一顺序重新取得两把锁并重读。
    return withSource();
  }
}

/** 完整激活入口，所有业务使用与 client 再次使用都经过同一决策链。 */
export async function ensureSandboxRuntime(params: {
  query: SandboxClientQuery;
  options?: SandboxRuntimeOptions;
  connection?: PreparedSandboxRuntime;
}): Promise<PreparedSandboxRuntime> {
  try {
    const result = await prepareSandboxRuntime({
      ...params,
      options: params.options ?? {},
      target: 'running'
    });
    if (!result.resource || !result.adapter)
      throw new Error('Sandbox activation did not return a runtime');
    return {
      resource: result.resource,
      adapter: result.adapter
    };
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

/** Workflow 前置配置准备复用同一编排，仅在激活前停下；不另写升级状态机。 */
export async function ensureSandboxRuntimeConfiguration(params: {
  query: SandboxClientQuery;
  onUpgrade?: () => void;
  options?: SandboxRuntimeOptions;
}) {
  const deadline = Date.now() + SANDBOX_RUNTIME_CONFIGURATION_TIMEOUT_MS;
  while (true) {
    try {
      await prepareSandboxRuntime({
        query: params.query,
        options: { ...params.options, onUpgrade: params.onUpgrade ?? params.options?.onUpgrade },
        target: 'configuration'
      });
      return;
    } catch (error) {
      // 等待只负责调度；每次重新经过同一编排并在锁内读取，不能自行解释 phase。
      if (
        !(
          isRedisLeaseError(error) ||
          error instanceof SandboxOperationConflictError ||
          error instanceof SandboxLifecycleStateError
        )
      )
        throw error;
      if (Date.now() >= deadline)
        throw new Error('Sandbox runtime configuration preparation timed out', { cause: error });
      await new Promise<void>((resolve) =>
        setTimeout(resolve, SANDBOX_RUNTIME_CONFIGURATION_RETRY_INTERVAL_MS)
      );
    }
  }
}
