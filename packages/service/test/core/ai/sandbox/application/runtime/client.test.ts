import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxNotFoundError } from '@fastgpt-sdk/sandbox-adapter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: { AGENT_SANDBOX_PROVIDER: 'sealosdevbox', AGENT_SANDBOX_DISK_MB: 20 }
}));

const mocks = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  buildRuntimeSandboxAdapter: vi.fn(),
  ensureConnectedSandboxRunning: vi.fn(),
  deleteSandboxResource: vi.fn(),
  stopSandboxResource: vi.fn(),
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

vi.mock('@fastgpt/service/common/redis/lock', () => ({
  isRedisLeaseError: mocks.isRedisLeaseError
}));

vi.mock('@fastgpt/service/core/ai/sandbox/error', () => ({
  createAgentSandboxInitializingError: mocks.createAgentSandboxInitializingError
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

const createProvider = () => ({
  provider: 'sealosdevbox',
  execute: vi.fn(async () => ({ stdout: 'ok', stderr: '', exitCode: 0 }))
});

const createInstance = (status: string, operationId?: string) =>
  ({
    provider: 'sealosdevbox',
    sandboxId: query.sandboxId,
    sourceType: query.sourceType,
    sourceId: query.sourceId,
    userId: query.userId,
    status,
    lastActiveAt: new Date('2026-07-01T00:00:00.000Z'),
    metadata: operationId
      ? {
          operation: {
            id: operationId,
            type: 'provision',
            phase: 'claimed',
            startedAt: new Date(),
            heartbeatAt: new Date()
          }
        }
      : {}
  }) as any;

describe('sandbox runtime client lifecycle', () => {
  const assertValid = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildRuntimeSandboxAdapter.mockReturnValue(createProvider());
    mocks.assertSandboxSourceActive.mockResolvedValue(undefined);
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
    mocks.resolveSandboxRuntimeImage.mockReturnValue({
      repository: 'fastgpt/sandbox',
      tag: 'v2'
    });
  });

  it('uses the running-only touch fast path without taking a lifecycle lease', async () => {
    const client = await getSandboxClient(query);

    expect(client.getSandboxId()).toBe(query.sandboxId);
    expect(mocks.touchRunningSandboxInstance).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: query.sandboxId, metadata: { volumeEnabled: false } })
    );
    expect(mocks.ensureConnectedSandboxRunning).toHaveBeenCalledWith(expect.anything(), {
      allowCreate: false
    });
    expect(mocks.withSandboxLifecycleLease).not.toHaveBeenCalled();
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
        metadata: {
          volumeEnabled: false,
          image: { repository: 'fastgpt/sandbox', tag: 'v2' }
        }
      })
    );
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: 'provisioning', status: 'running', touchActive: true })
    );
  });

  it('claims stopped -> provisioning before resuming the provider', async () => {
    const stopped = createInstance('stopped');
    const claimed = createInstance('provisioning', 'resume-1');
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(stopped);
    mocks.claimSandboxOperation.mockResolvedValue(claimed);

    await getSandboxClient(query);

    expect(mocks.claimSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'provisioning', type: 'provision' })
    );
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

  it('publishes a stale providerEnsured phase without reconnecting the provider', async () => {
    const provisioning = createInstance('provisioning', 'old-provision');
    provisioning.metadata.operation.phase = 'providerEnsured';
    provisioning.metadata.operation.heartbeatAt = new Date(0);
    const reclaimed = createInstance('provisioning', 'resumed-provision');
    reclaimed.metadata.operation.phase = 'providerEnsured';
    reclaimed.metadata.operation.heartbeatAt = new Date(0);
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
      failedProvisioning.metadata.operation.error = error;
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
      expect.objectContaining({ operationId: 'retried-provision', status: 'running' })
    );
  });

  it('guards the source before migration, restore and provider construction', async () => {
    mocks.assertSandboxSourceActive.mockRejectedValueOnce(new Error('source deleted'));

    await expect(getSandboxClient(query)).rejects.toThrow('source deleted');

    expect(mocks.migrateSandboxProviderBeforeUse).not.toHaveBeenCalled();
    expect(mocks.restoreArchivedSandboxBeforeUse).not.toHaveBeenCalled();
    expect(mocks.buildRuntimeSandboxAdapter).not.toHaveBeenCalled();
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
  });

  it('returns command failures as ExecuteResult and preserves timeout conversion', async () => {
    const provider = createProvider();
    mocks.buildRuntimeSandboxAdapter.mockReturnValueOnce(provider);
    const client = new SandboxClient(query, { sourceGuard: mocks.assertSandboxSourceActive });

    await expect(client.exec('echo ok', 2)).resolves.toEqual({
      stdout: 'ok',
      stderr: '',
      exitCode: 0
    });
    expect(provider.execute).toHaveBeenCalledWith(expect.stringContaining('echo ok'), {
      timeoutMs: 2000
    });

    provider.execute.mockRejectedValueOnce(new Error('exec failed'));
    await expect(client.exec('false')).resolves.toEqual({
      stdout: '',
      stderr: 'Failed to execute sandbox: exec failed',
      exitCode: -1
    });
  });

  it('rejects legacy or incomplete runtime queries', async () => {
    await expect(getSandboxClient({ appId: 'app-1' } as any)).rejects.toThrow(
      'sandboxId is required'
    );
    await expect(getSandboxClient({ sandboxId: 'sandbox-1' } as any)).rejects.toThrow(
      'sourceType and sourceId are required'
    );
  });
});
