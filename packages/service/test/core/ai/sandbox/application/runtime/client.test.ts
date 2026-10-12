import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxNotFoundError } from '@fastgpt-sdk/sandbox-adapter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    AGENT_SANDBOX_PROVIDER: 'sealosdevbox',
    AGENT_SANDBOX_STORAGE_SIZE_GI: 1
  }
}));

const mocks = vi.hoisted(() => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  buildRuntimeSandboxAdapter: vi.fn(),
  ensureConnectedSandboxRunning: vi.fn(),
  deleteSandboxResource: vi.fn(),
  stopSandboxResource: vi.fn(),
  buildVolumeConfig: vi.fn(),
  createSessionVolumeClaimName: vi.fn(),
  getSessionVolumeClaimName: vi.fn(),
  getSessionVolumeConfig: vi.fn(),
  existsSandboxInstanceBySandboxId: vi.fn(),
  touchRunningSandboxInstance: vi.fn(),
  findSandboxInstanceBySource: vi.fn(),
  createSandboxProvisioningInstance: vi.fn(),
  claimSandboxOperation: vi.fn(),
  advanceSandboxOperation: vi.fn(),
  completeSandboxOperation: vi.fn(),
  markSandboxOperationFailed: vi.fn(),
  assertSandboxRuntimeUsableWithoutRestore: vi.fn(),
  restoreArchivedSandboxBeforeUse: vi.fn(),
  migrateSandboxProviderBeforeUse: vi.fn(),
  withSandboxLifecycleLease: vi.fn(),
  withSandboxSourceMutationLease: vi.fn(),
  assertSandboxSourceActive: vi.fn(),
  isRedisLeaseError: vi.fn(),
  createAgentSandboxInitializingError: vi.fn(),
  checkSandboxQuota: vi.fn(),
  ensureSandboxTeamOwnership: vi.fn(),
  resolveSandboxRuntimeImage: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter', () => ({
  buildRuntimeSandboxAdapter: mocks.buildRuntimeSandboxAdapter
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/lifecycle', () => ({
  ensureConnectedSandboxRunning: mocks.ensureConnectedSandboxRunning
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  deleteSandboxResource: mocks.deleteSandboxResource,
  stopSandboxResource: mocks.stopSandboxResource
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/volume/service', () => ({
  buildVolumeConfig: mocks.buildVolumeConfig,
  createSessionVolumeClaimName: mocks.createSessionVolumeClaimName,
  getSessionVolumeClaimName: mocks.getSessionVolumeClaimName,
  getSessionVolumeConfig: mocks.getSessionVolumeConfig
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  advanceSandboxOperation: mocks.advanceSandboxOperation,
  claimSandboxOperation: mocks.claimSandboxOperation,
  completeSandboxOperation: mocks.completeSandboxOperation,
  createSandboxProvisioningInstance: mocks.createSandboxProvisioningInstance,
  existsSandboxInstanceBySandboxId: mocks.existsSandboxInstanceBySandboxId,
  findSandboxInstanceBySource: mocks.findSandboxInstanceBySource,
  markSandboxOperationFailed: mocks.markSandboxOperationFailed,
  touchRunningSandboxInstance: mocks.touchRunningSandboxInstance
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/archive', () => {
  class SandboxLifecycleStateError extends Error {
    constructor(readonly state: string) {
      super(`Sandbox is ${state}`);
      this.name = 'SandboxLifecycleStateError';
    }
  }
  return {
    SandboxLifecycleStateError,
    assertSandboxRuntimeUsableWithoutRestore: mocks.assertSandboxRuntimeUsableWithoutRestore,
    restoreArchivedSandboxBeforeUse: mocks.restoreArchivedSandboxBeforeUse
  };
});

vi.mock('@fastgpt/service/core/ai/sandbox/application/providerMigration', () => ({
  migrateSandboxProviderBeforeUse: mocks.migrateSandboxProviderBeforeUse
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxLifecycleLease: mocks.withSandboxLifecycleLease,
  withSandboxSourceMutationLease: mocks.withSandboxSourceMutationLease
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => ({
  assertSandboxSourceActive: mocks.assertSandboxSourceActive
}));

vi.mock('@fastgpt/dal/redis/caches', () => ({
  isRedisLeaseError: mocks.isRedisLeaseError
}));

vi.mock('@fastgpt/service/core/ai/sandbox/error', () => ({
  createAgentSandboxInitializingError: mocks.createAgentSandboxInitializingError
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/ownership', () => ({
  ensureSandboxTeamOwnership: mocks.ensureSandboxTeamOwnership
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/quota', () => ({
  checkSandboxQuota: mocks.checkSandboxQuota
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/image', () => ({
  resolveSandboxRuntimeImage: mocks.resolveSandboxRuntimeImage
}));

import {
  getSandboxClient,
  SandboxClient
} from '@fastgpt/service/core/ai/sandbox/application/runtime/client';

const query = {
  sandboxId: 'sandbox-1',
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app-1',
  userId: 'user-1',
  chatId: 'chat-1'
};

const clientProps = { ...query, teamId: 'team-1' };

const createProvider = () => ({
  provider: 'sealosdevbox',
  close: vi.fn(async () => undefined),
  createDirectories: vi.fn(async () => undefined),
  execute: vi.fn(async () => ({ stdout: 'ok', stderr: '', exitCode: 0 }))
});

const createInstance = (
  status: string,
  operationId?: string,
  provider: 'sealosdevbox' | 'opensandbox' = 'sealosdevbox',
  overrides: Record<string, unknown> = {}
) =>
  ({
    provider,
    sandboxId: query.sandboxId,
    sourceType: query.sourceType,
    sourceId: query.sourceId,
    userId: query.userId,
    teamId: 'team-1',
    status,
    lastActiveAt: new Date('2026-07-01T00:00:00.000Z'),
    ...(provider === 'opensandbox'
      ? {
          storage: {
            volumes: [
              {
                name: 'workspace',
                claimName: 'fastgpt-session-sandbox-1-current',
                mountPath: '/workspace'
              }
            ],
            mountPath: '/workspace'
          }
        }
      : {}),
    operation: operationId
      ? {
          id: operationId,
          type: 'provision',
          phase: 'claimed',
          startedAt: new Date(),
          heartbeatAt: new Date()
        }
      : undefined,
    ...overrides
  }) as any;

describe('sandbox runtime client lifecycle', () => {
  const assertValid = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildRuntimeSandboxAdapter.mockReturnValue(createProvider());
    mocks.assertSandboxSourceActive.mockResolvedValue(undefined);
    mocks.buildVolumeConfig.mockImplementation((claimName: string) => ({
      volumes: [
        {
          name: 'workspace',
          pvc: {
            claimName,
            createIfNotExists: false,
            deleteOnSandboxTermination: false
          },
          mountPath: '/workspace'
        }
      ],
      storage: {
        volumes: [{ name: 'workspace', claimName, mountPath: '/workspace' }],
        mountPath: '/workspace'
      }
    }));
    mocks.createSessionVolumeClaimName.mockImplementation(
      ({ sandboxId, generationId }: { sandboxId: string; generationId?: string }) =>
        `fastgpt-session-${sandboxId}-${generationId ?? 'new'}`
    );
    mocks.getSessionVolumeClaimName.mockImplementation(
      (storage: any) =>
        storage?.volumes?.find((volume: any) => volume.name === 'workspace')?.claimName
    );
    mocks.getSessionVolumeConfig.mockResolvedValue(undefined);
    mocks.touchRunningSandboxInstance.mockResolvedValue(createInstance('running'));
    mocks.findSandboxInstanceBySource.mockResolvedValue(null);
    mocks.ensureConnectedSandboxRunning.mockResolvedValue(undefined);
    mocks.restoreArchivedSandboxBeforeUse.mockResolvedValue(undefined);
    mocks.migrateSandboxProviderBeforeUse.mockResolvedValue(undefined);
    mocks.advanceSandboxOperation.mockResolvedValue(createInstance('provisioning', 'provision-1'));
    mocks.completeSandboxOperation.mockResolvedValue(createInstance('running'));
    mocks.markSandboxOperationFailed.mockResolvedValue(undefined);
    mocks.deleteSandboxResource.mockResolvedValue(undefined);
    mocks.stopSandboxResource.mockResolvedValue(undefined);
    mocks.withSandboxLifecycleLease.mockImplementation(async ({ fn }: any) =>
      fn({ signal: new AbortController().signal, assertValid })
    );
    mocks.withSandboxSourceMutationLease.mockImplementation(async ({ fn }: any) =>
      fn({ signal: new AbortController().signal, assertValid })
    );
    mocks.isRedisLeaseError.mockReturnValue(false);
    mocks.createAgentSandboxInitializingError.mockReturnValue(new Error('Sandbox is initializing'));
    mocks.checkSandboxQuota.mockResolvedValue(undefined);
    mocks.ensureSandboxTeamOwnership.mockResolvedValue('team-1');
    mocks.resolveSandboxRuntimeImage.mockReturnValue({
      repository: 'fastgpt/sandbox',
      tag: 'v2'
    });
  });

  it('uses the running-only touch fast path without taking a lifecycle lease', async () => {
    const client = await getSandboxClient(query);

    expect(client.getSandboxId()).toBe(query.sandboxId);
    expect(mocks.touchRunningSandboxInstance).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: query.sandboxId })
    );
    expect(mocks.ensureConnectedSandboxRunning).toHaveBeenCalledWith(expect.anything(), {
      allowCreate: false
    });
    expect(mocks.withSandboxLifecycleLease).not.toHaveBeenCalled();
  });

  it('coalesces concurrent ensureAvailable calls on one client', async () => {
    const client = new SandboxClient(clientProps);
    let releaseEnsure: (() => void) | undefined;
    const ensureGate = new Promise<void>((resolve) => {
      releaseEnsure = resolve;
    });
    mocks.ensureConnectedSandboxRunning.mockImplementationOnce(async () => ensureGate);

    const first = client.ensureAvailable();
    const second = client.ensureAvailable();

    await vi.waitFor(() => expect(mocks.ensureConnectedSandboxRunning).toHaveBeenCalledTimes(1));
    releaseEnsure?.();
    await Promise.all([first, second]);
  });

  it('builds and verifies a request-scoped provider for each client', async () => {
    const firstProvider = createProvider();
    const secondProvider = createProvider();
    mocks.buildRuntimeSandboxAdapter
      .mockReturnValueOnce(firstProvider)
      .mockReturnValueOnce(secondProvider);
    const firstClient = new SandboxClient(clientProps);

    await firstClient.ensureAvailable();
    await firstClient.provider.close();
    const secondClient = new SandboxClient(clientProps);
    await secondClient.ensureAvailable();

    expect(firstClient.provider).toBe(firstProvider);
    expect(secondClient.provider).toBe(secondProvider);
    expect(firstProvider.close).toHaveBeenCalledOnce();
    expect(mocks.ensureConnectedSandboxRunning).toHaveBeenCalledWith(firstProvider, {
      allowCreate: false
    });
    expect(mocks.ensureConnectedSandboxRunning).toHaveBeenCalledWith(secondProvider, {
      allowCreate: false
    });
  });

  it('repairs a missing running provider under source and lifecycle leases', async () => {
    mocks.findSandboxInstanceBySource.mockResolvedValue(createInstance('running'));
    mocks.ensureConnectedSandboxRunning
      .mockRejectedValueOnce(new SandboxNotFoundError('Sandbox sandbox-1 does not exist'))
      .mockResolvedValueOnce(undefined);

    await getSandboxClient(query);

    expect(mocks.withSandboxSourceMutationLease).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: query.sourceType,
        sourceId: query.sourceId,
        label: `repair-missing-sandbox:${query.sandboxId}`
      })
    );
    expect(mocks.withSandboxLifecycleLease).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: query.sandboxId,
        label: `repair-missing-sandbox-lifecycle:${query.sandboxId}`
      })
    );
    expect(mocks.withSandboxSourceMutationLease.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.withSandboxLifecycleLease.mock.invocationCallOrder[0]
    );
    expect(mocks.ensureConnectedSandboxRunning).toHaveBeenNthCalledWith(1, expect.anything(), {
      allowCreate: false
    });
    expect(mocks.ensureConnectedSandboxRunning).toHaveBeenNthCalledWith(2, expect.anything());
    expect(mocks.createSandboxProvisioningInstance).not.toHaveBeenCalled();
  });

  it('creates a missing record under source then lifecycle leases and publishes running last', async () => {
    const provisioning = createInstance('provisioning', 'provision-1');
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(null);
    mocks.createSandboxProvisioningInstance.mockResolvedValue({
      instance: provisioning,
      created: true
    });

    await getSandboxClient(query);

    expect(mocks.withSandboxSourceMutationLease).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'app', sourceId: 'app-1' })
    );
    expect(mocks.withSandboxLifecycleLease).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: 'sandbox-1' })
    );
    expect(mocks.ensureConnectedSandboxRunning.mock.invocationCallOrder.at(-1)).toBeLessThan(
      mocks.completeSandboxOperation.mock.invocationCallOrder[0]
    );
    expect(mocks.advanceSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'provision-1', phase: 'providerEnsured' })
    );
    expect(mocks.createSandboxProvisioningInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        image: { repository: 'fastgpt/sandbox', tag: 'v2' }
      })
    );
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: 'provisioning', status: 'running', touchActive: true })
    );
  });

  it('reuses the restore-assigned claimName and only ensures it inside provisioning', async () => {
    const vmConfig = {
      volumes: [{ name: 'workspace', pvc: { claimName: 'fastgpt-session-sandbox-1' } }],
      storage: {
        volumes: [
          {
            name: 'workspace',
            claimName: 'fastgpt-session-sandbox-1',
            mountPath: '/workspace'
          }
        ],
        mountPath: '/workspace'
      }
    };
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    const provisioning = createInstance('provisioning', 'provision-1', 'opensandbox', {
      storage: vmConfig.storage
    });
    mocks.createSandboxProvisioningInstance.mockResolvedValueOnce({
      instance: provisioning,
      created: true
    });
    mocks.restoreArchivedSandboxBeforeUse.mockResolvedValueOnce(vmConfig);

    await getSandboxClient(query, { providerName: 'opensandbox' });

    expect(mocks.getSessionVolumeConfig).toHaveBeenCalledWith('fastgpt-session-sandbox-1');
    expect(mocks.withSandboxLifecycleLease.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getSessionVolumeConfig.mock.invocationCallOrder[0]
    );
    expect(mocks.restoreArchivedSandboxBeforeUse).toHaveBeenCalledWith(
      expect.not.objectContaining({ vmConfig: expect.anything(), storage: expect.anything() })
    );
    expect(mocks.restoreArchivedSandboxBeforeUse.mock.calls[0][0]).not.toHaveProperty('teamId');
    expect(mocks.checkSandboxQuota.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.restoreArchivedSandboxBeforeUse.mock.invocationCallOrder[0]
    );
    expect(mocks.buildRuntimeSandboxAdapter).toHaveBeenCalledWith(
      'opensandbox',
      query.sandboxId,
      expect.objectContaining({ vmConfig })
    );
  });

  it('rebuilds the provider from the current claim after a stale storage CAS misses', async () => {
    const staleVmConfig = mocks.buildVolumeConfig('fastgpt-session-sandbox-1-stale');
    const current = createInstance('running', undefined, 'opensandbox', {
      storage: mocks.buildVolumeConfig('fastgpt-session-sandbox-1-current').storage
    });
    const staleProvider = createProvider();
    const currentProvider = createProvider();
    mocks.buildRuntimeSandboxAdapter
      .mockReturnValueOnce(staleProvider)
      .mockReturnValueOnce(currentProvider);
    mocks.restoreArchivedSandboxBeforeUse.mockResolvedValueOnce(staleVmConfig);
    mocks.touchRunningSandboxInstance.mockResolvedValueOnce(null).mockResolvedValueOnce(current);
    mocks.findSandboxInstanceBySource.mockResolvedValue(current);

    await getSandboxClient(query, { providerName: 'opensandbox' });

    expect(mocks.touchRunningSandboxInstance).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        expectedWorkspaceClaimName: 'fastgpt-session-sandbox-1-stale'
      })
    );
    expect(mocks.buildRuntimeSandboxAdapter).toHaveBeenLastCalledWith(
      'opensandbox',
      query.sandboxId,
      expect.objectContaining({
        vmConfig: expect.objectContaining({ storage: current.storage })
      })
    );
    expect(mocks.ensureConnectedSandboxRunning).toHaveBeenCalledWith(currentProvider);
    expect(mocks.ensureConnectedSandboxRunning).not.toHaveBeenCalledWith(staleProvider);
  });

  it('persists the initial claimName before ensuring a new OpenSandbox provider', async () => {
    const provisioning = createInstance('provisioning', 'provision-1', 'opensandbox', {
      storage: {
        volumes: [
          {
            name: 'workspace',
            claimName: 'fastgpt-session-sandbox-1-0',
            mountPath: '/workspace'
          }
        ],
        mountPath: '/workspace'
      }
    });
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(null);
    mocks.createSandboxProvisioningInstance.mockResolvedValueOnce({
      instance: provisioning,
      created: true
    });

    await getSandboxClient(query, { providerName: 'opensandbox' });

    expect(mocks.createSandboxProvisioningInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: {
          volumes: [
            {
              name: 'workspace',
              claimName: 'fastgpt-session-sandbox-1-0',
              mountPath: '/workspace'
            }
          ],
          mountPath: '/workspace'
        }
      })
    );
    expect(mocks.createSandboxProvisioningInstance.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getSessionVolumeConfig.mock.invocationCallOrder[0]
    );
    expect(mocks.getSessionVolumeConfig).toHaveBeenCalledWith('fastgpt-session-sandbox-1-0');
  });

  it('claims stopped -> provisioning and reuses its persisted OpenSandbox claimName', async () => {
    const stopped = createInstance('stopped', undefined, 'opensandbox');
    const claimed = createInstance('provisioning', 'resume-1', 'opensandbox');
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(stopped);
    mocks.claimSandboxOperation.mockResolvedValue(claimed);

    await getSandboxClient(query, { providerName: 'opensandbox' });

    expect(mocks.claimSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'provisioning', type: 'provision' })
    );
    expect(mocks.createSessionVolumeClaimName).not.toHaveBeenCalled();
    expect(mocks.getSessionVolumeConfig).toHaveBeenCalledWith('fastgpt-session-sandbox-1-current');
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'resume-1', status: 'running' })
    );
  });

  it('does not recreate a record deleted while waiting for the lifecycle lease', async () => {
    const stopped = createInstance('stopped');
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValueOnce(stopped).mockResolvedValueOnce(null);

    await expect(getSandboxClient(query)).rejects.toThrow(
      'Sandbox record disappeared before lifecycle operation was claimed'
    );

    expect(mocks.createSandboxProvisioningInstance).not.toHaveBeenCalled();
    expect(mocks.ensureConnectedSandboxRunning).not.toHaveBeenCalled();
    expect(mocks.withSandboxSourceMutationLease).not.toHaveBeenCalled();
  });

  it('maps source or lifecycle lease contention to initializing', async () => {
    const leaseError = new Error('lease occupied');
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(null);
    mocks.withSandboxSourceMutationLease.mockRejectedValueOnce(leaseError);
    mocks.isRedisLeaseError.mockReturnValueOnce(true);

    await expect(getSandboxClient(query)).rejects.toThrow('Sandbox is initializing');
  });

  it('maps active provisioning to initializing', async () => {
    const provisioning = createInstance('provisioning', 'active-provision');
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(provisioning);

    await expect(getSandboxClient(query)).rejects.toThrow('Sandbox is initializing');

    expect(mocks.createAgentSandboxInitializingError).toHaveBeenCalledTimes(1);
    expect(mocks.claimSandboxOperation).not.toHaveBeenCalled();
  });

  it('publishes a stale providerEnsured phase without reconnecting the provider', async () => {
    const provisioning = createInstance('provisioning', 'old-provision');
    provisioning.operation.phase = 'providerEnsured';
    provisioning.operation.heartbeatAt = new Date(0);
    const reclaimed = createInstance('provisioning', 'resumed-provision');
    reclaimed.operation.phase = 'providerEnsured';
    reclaimed.operation.heartbeatAt = new Date(0);
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(provisioning);
    mocks.claimSandboxOperation.mockResolvedValueOnce(reclaimed);

    await getSandboxClient(query);

    expect(mocks.ensureConnectedSandboxRunning).not.toHaveBeenCalled();
    expect(mocks.advanceSandboxOperation).not.toHaveBeenCalled();
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'resumed-provision', status: 'running' })
    );
  });

  it('records a provisioning failure and retries it immediately', async () => {
    const stopped = createInstance('stopped');
    const failedProvisioning = createInstance('provisioning', 'failed-provision');
    const retriedProvisioning = createInstance('provisioning', 'retried-provision');
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(stopped);
    mocks.claimSandboxOperation
      .mockResolvedValueOnce(failedProvisioning)
      .mockResolvedValueOnce(retriedProvisioning);
    mocks.markSandboxOperationFailed.mockImplementationOnce(async ({ error }: any) => {
      failedProvisioning.operation.error = error;
    });
    mocks.ensureConnectedSandboxRunning.mockRejectedValueOnce(new Error('provider failed'));

    await expect(getSandboxClient(query)).rejects.toThrow('provider failed');
    expect(mocks.markSandboxOperationFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'failed-provision',
        status: 'provisioning',
        error: 'provider failed'
      })
    );
    expect(mocks.completeSandboxOperation).not.toHaveBeenCalled();

    mocks.findSandboxInstanceBySource.mockResolvedValue(failedProvisioning);
    await getSandboxClient(query);

    expect(mocks.claimSandboxOperation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: 'provisioning', type: 'provision' })
    );
    expect(mocks.ensureConnectedSandboxRunning).toHaveBeenCalledTimes(2);
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'retried-provision',
        status: 'running',
        set: { image: { repository: 'fastgpt/sandbox', tag: 'v2' } }
      })
    );
  });

  it('retries failed OpenSandbox provisioning with its persisted Legacy claimName', async () => {
    const failedProvisioning = createInstance('provisioning', 'failed-provision', 'opensandbox');
    failedProvisioning.operation.error = 'Failed to create sandbox';
    const retriedProvisioning = createInstance('provisioning', 'retried-provision', 'opensandbox');
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(failedProvisioning);
    mocks.claimSandboxOperation.mockResolvedValueOnce(retriedProvisioning);
    mocks.advanceSandboxOperation.mockResolvedValueOnce(retriedProvisioning);

    await getSandboxClient(query, { providerName: 'opensandbox' });

    expect(mocks.createSessionVolumeClaimName).not.toHaveBeenCalled();
    expect(mocks.getSessionVolumeConfig).toHaveBeenCalledWith('fastgpt-session-sandbox-1-current');
    expect(mocks.claimSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'provisioning', type: 'provision' })
    );
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'retried-provision', status: 'running' })
    );
  });

  it('reuses prepared ownership while checking source liveness on later calls', async () => {
    const client = await getSandboxClient(query);
    await client.ensureAvailable();

    expect(mocks.ensureSandboxTeamOwnership).toHaveBeenCalledOnce();
    expect(mocks.assertSandboxSourceActive).toHaveBeenCalledTimes(2);
    expect(mocks.ensureConnectedSandboxRunning).toHaveBeenCalledTimes(2);

    mocks.assertSandboxSourceActive.mockRejectedValueOnce(new Error('source deleted'));
    await expect(client.ensureAvailable()).rejects.toThrow('source deleted');
    expect(mocks.touchRunningSandboxInstance).toHaveBeenCalledTimes(2);
    expect(mocks.ensureConnectedSandboxRunning).toHaveBeenCalledTimes(2);
    expect(mocks.ensureSandboxTeamOwnership).toHaveBeenCalledOnce();
  });

  it('rejects source deletion while waiting for the lifecycle lease before creating a record', async () => {
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.withSandboxLifecycleLease.mockImplementationOnce(async ({ fn }: any) => {
      mocks.assertSandboxSourceActive.mockRejectedValueOnce(new Error('source deleted'));
      return fn({ signal: new AbortController().signal, assertValid });
    });

    await expect(getSandboxClient(query)).rejects.toThrow('source deleted');
    expect(mocks.createSandboxProvisioningInstance).not.toHaveBeenCalled();
    expect(mocks.ensureConnectedSandboxRunning).not.toHaveBeenCalled();
  });

  it('rejects source deletion after provisioning is claimed before creating the provider', async () => {
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.createSandboxProvisioningInstance.mockImplementationOnce(async () => {
      mocks.assertSandboxSourceActive.mockRejectedValueOnce(new Error('source deleted'));
      return { instance: createInstance('provisioning', 'provision-1'), created: true };
    });

    await expect(getSandboxClient(query)).rejects.toThrow('source deleted');
    expect(mocks.ensureConnectedSandboxRunning).not.toHaveBeenCalled();
    expect(mocks.markSandboxOperationFailed).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'provision-1', error: 'source deleted' })
    );
  });

  it('does not create or resume when archived restore is disabled', async () => {
    mocks.assertSandboxRuntimeUsableWithoutRestore.mockRejectedValueOnce(
      new Error('Sandbox is archived')
    );

    await expect(getSandboxClient(query, { restoreArchived: false })).rejects.toThrow(
      'Sandbox is archived'
    );
    expect(mocks.migrateSandboxProviderBeforeUse).not.toHaveBeenCalled();
    expect(mocks.createSandboxProvisioningInstance).not.toHaveBeenCalled();
    expect(mocks.checkSandboxQuota).not.toHaveBeenCalled();
  });

  it('checks quota and carries resolved teamId when provisioning or restarting a non-active instance', async () => {
    // 新建实例：准备 ownership 后校验配额并透传 teamId
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(null);
    mocks.createSandboxProvisioningInstance.mockResolvedValue({
      instance: createInstance('provisioning', 'provision-1'),
      created: true
    });

    await getSandboxClient(query);

    expect(mocks.ensureSandboxTeamOwnership).toHaveBeenCalledWith({
      sandboxId: query.sandboxId,
      sourceType: query.sourceType,
      sourceId: query.sourceId,
      userId: query.userId
    });
    expect(mocks.checkSandboxQuota).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-1' })
    );
    expect(mocks.createSandboxProvisioningInstance).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: 'team-1' })
    );

    // 重启已停止实例：同样在 claim 恢复前执行配额检查
    mocks.checkSandboxQuota.mockClear();
    mocks.findSandboxInstanceBySource.mockResolvedValue(createInstance('stopped'));
    mocks.claimSandboxOperation.mockResolvedValueOnce(createInstance('provisioning', 'restart-1'));
    const client = new SandboxClient(clientProps);
    await client.ensureAvailable();
    expect(mocks.checkSandboxQuota).toHaveBeenCalledTimes(1);
  });

  it('aborts activation and prevents remote operations when ownership preparation or quota check fails', async () => {
    // 归属准备失败：直接中断，不检查配额且不调用任何远端 Provider
    mocks.ensureSandboxTeamOwnership.mockRejectedValueOnce(new Error('source has no teamId'));
    await expect(getSandboxClient(query)).rejects.toThrow('source has no teamId');
    expect(mocks.checkSandboxQuota).not.toHaveBeenCalled();
    expect(mocks.migrateSandboxProviderBeforeUse).not.toHaveBeenCalled();
    expect(mocks.buildRuntimeSandboxAdapter).not.toHaveBeenCalled();

    // 配额不足超限：直接中断，不触发 Provider 迁移和实例创建
    mocks.checkSandboxQuota.mockRejectedValueOnce(new Error('quota reached'));
    await expect(getSandboxClient(query)).rejects.toThrow('quota reached');
    expect(mocks.migrateSandboxProviderBeforeUse).not.toHaveBeenCalled();
    expect(mocks.createSandboxProvisioningInstance).not.toHaveBeenCalled();
  });

  it('rejects a conflicting record created after ownership preparation', async () => {
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.createSandboxProvisioningInstance.mockResolvedValue({
      instance: createInstance('provisioning', 'provision-1', 'sealosdevbox', {
        teamId: 'other-team'
      }),
      created: false
    });

    await expect(getSandboxClient(query)).rejects.toThrow('Sandbox team ownership mismatch');
    expect(mocks.ensureConnectedSandboxRunning).not.toHaveBeenCalled();
  });

  it('returns command failures as ExecuteResult and preserves timeout conversion', async () => {
    const provider = createProvider();
    mocks.buildRuntimeSandboxAdapter.mockReturnValueOnce(provider);
    const client = new SandboxClient(clientProps);

    await expect(client.exec('echo ok', 2)).resolves.toEqual({
      stdout: 'ok',
      stderr: '',
      exitCode: 0
    });
    expect(provider.createDirectories).toHaveBeenCalledWith([
      '/home/devbox/workspace/sessions/chat-1'
    ]);
    expect(provider.execute).toHaveBeenCalledWith('echo ok', {
      timeoutMs: 2000,
      workingDirectory: '/home/devbox/workspace/sessions/chat-1'
    });

    provider.execute.mockRejectedValueOnce(new Error('exec failed'));
    await expect(client.exec('false')).resolves.toEqual({
      stdout: '',
      stderr: 'Failed to execute sandbox: exec failed',
      exitCode: -1
    });
    expect(provider.createDirectories).toHaveBeenCalledOnce();
  });
});
