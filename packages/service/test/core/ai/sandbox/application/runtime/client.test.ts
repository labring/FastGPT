import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  AGENT_SANDBOX_PROVIDER: 'sealosdevbox',
  AGENT_SANDBOX_DISK_MB: 20
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: env
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
  assertSandboxRuntimeUsableWithoutRestore: vi.fn(),
  restoreArchivedSandboxBeforeUse: vi.fn(),
  migrateSandboxProviderBeforeUse: vi.fn(),
  assertSandboxSourceActive: vi.fn(),
  isRedisLeaseError: vi.fn(),
  createAgentSandboxInitializingError: vi.fn(),
  provisionSandboxWithSaga: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lifecycle/service', () => ({
  provisionSandboxWithSaga: mocks.provisionSandboxWithSaga
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
  existsSandboxInstanceBySandboxId: mocks.existsSandboxInstanceBySandboxId,
  findSandboxInstanceBySource: mocks.findSandboxInstanceBySource,
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

vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => ({
  assertSandboxSourceActive: mocks.assertSandboxSourceActive
}));

vi.mock('@fastgpt/service/common/redis/lock', () => ({
  isRedisLeaseError: mocks.isRedisLeaseError
}));

vi.mock('@fastgpt/service/core/ai/sandbox/error', () => ({
  createAgentSandboxInitializingError: mocks.createAgentSandboxInitializingError
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

const createInstance = (status: string, sagaId?: string) =>
  ({
    provider: 'sealosdevbox',
    sandboxId: query.sandboxId,
    sourceType: query.sourceType,
    sourceId: query.sourceId,
    userId: query.userId,
    status,
    lastActiveAt: new Date('2026-07-01T00:00:00.000Z'),
    metadata: sagaId
      ? {
          activeSaga: { sagaId, type: 'provision' }
        }
      : {}
  }) as any;

describe('sandbox runtime client lifecycle', () => {
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
    mocks.deleteSandboxResource.mockResolvedValue(undefined);
    mocks.stopSandboxResource.mockResolvedValue(undefined);
    mocks.isRedisLeaseError.mockReturnValue(false);
    mocks.createAgentSandboxInitializingError.mockReturnValue(new Error('Sandbox is initializing'));
    mocks.provisionSandboxWithSaga.mockResolvedValue(true);
  });

  it('resumes the persisted durable provision Saga instead of stealing provisioning', async () => {
    const provisioning = createInstance('provisioning', 'durable-provision');
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(provisioning);

    await getSandboxClient(query);

    expect(mocks.provisionSandboxWithSaga).toHaveBeenCalledWith(
      expect.objectContaining({ activeResource: provisioning, resumeExisting: true })
    );
  });

  it('uses the running-only touch fast path without starting a Saga', async () => {
    const client = await getSandboxClient(query);

    expect(client.getSandboxId()).toBe(query.sandboxId);
    expect(mocks.touchRunningSandboxInstance).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: query.sandboxId, metadata: { volumeEnabled: false } })
    );
    expect(mocks.ensureConnectedSandboxRunning).toHaveBeenCalledTimes(1);
    expect(mocks.provisionSandboxWithSaga).not.toHaveBeenCalled();
  });

  it('rebinds OpenSandbox through the upstream handle persisted by the Saga', async () => {
    const initialProvider = createProvider();
    const reboundProvider = createProvider();
    mocks.buildRuntimeSandboxAdapter
      .mockReturnValueOnce(initialProvider)
      .mockReturnValueOnce(reboundProvider);
    mocks.touchRunningSandboxInstance.mockResolvedValue({
      ...createInstance('running'),
      provider: 'opensandbox',
      metadata: { upstreamId: 'opensandbox-resource-1' }
    });
    const client = new SandboxClient(query, {
      providerName: 'opensandbox',
      sourceGuard: mocks.assertSandboxSourceActive
    });

    await client.ensureAvailable();

    expect(mocks.buildRuntimeSandboxAdapter).toHaveBeenLastCalledWith(
      'opensandbox',
      query.sandboxId,
      expect.objectContaining({ upstreamId: 'opensandbox-resource-1' })
    );
    expect(mocks.ensureConnectedSandboxRunning).toHaveBeenCalledWith(reboundProvider);
    expect(client.provider).toBe(reboundProvider);
  });

  it('starts a durable provision Saga for a missing aggregate', async () => {
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(null);

    await getSandboxClient(query);

    expect(mocks.provisionSandboxWithSaga).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: 'sandbox-1',
        sourceType: 'app',
        sourceId: 'app-1',
        resumeExisting: false,
        activeResource: undefined
      })
    );
    expect(mocks.ensureConnectedSandboxRunning).toHaveBeenCalledTimes(1);
  });

  it('resumes a stopped aggregate through the durable provision Saga', async () => {
    const stopped = createInstance('stopped');
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(stopped);

    await getSandboxClient(query);

    expect(mocks.provisionSandboxWithSaga).toHaveBeenCalledWith(
      expect.objectContaining({ activeResource: stopped, resumeExisting: true })
    );
  });

  it('maps durable Saga lease contention to initializing', async () => {
    const leaseError = new Error('lease occupied');
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(null);
    mocks.provisionSandboxWithSaga.mockRejectedValueOnce(leaseError);
    mocks.isRedisLeaseError.mockReturnValueOnce(true);

    await expect(getSandboxClient(query)).rejects.toThrow('Sandbox is initializing');
  });

  it('rejects an unmanaged provisioning aggregate instead of stealing it', async () => {
    const provisioning = createInstance('provisioning');
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(provisioning);

    await expect(getSandboxClient(query)).rejects.toMatchObject({
      name: 'SandboxLifecycleStateError',
      state: 'provisioning'
    });
    expect(mocks.ensureConnectedSandboxRunning).not.toHaveBeenCalled();
    expect(mocks.provisionSandboxWithSaga).not.toHaveBeenCalled();
  });

  it('keeps a pending provision Saga unavailable until recovery completes it', async () => {
    const provisioning = createInstance('provisioning', 'pending-provision');
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(provisioning);
    mocks.provisionSandboxWithSaga.mockResolvedValueOnce(false);

    await expect(getSandboxClient(query)).rejects.toMatchObject({
      name: 'SandboxLifecycleStateError',
      state: 'provisioning'
    });

    expect(mocks.ensureConnectedSandboxRunning).not.toHaveBeenCalled();
  });

  it('propagates durable provisioning failure without connecting the Provider', async () => {
    const stopped = createInstance('stopped');
    mocks.touchRunningSandboxInstance.mockResolvedValue(null);
    mocks.findSandboxInstanceBySource.mockResolvedValue(stopped);
    mocks.provisionSandboxWithSaga.mockRejectedValueOnce(new Error('provider failed'));

    await expect(getSandboxClient(query)).rejects.toThrow('provider failed');
    expect(mocks.ensureConnectedSandboxRunning).not.toHaveBeenCalled();
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
    expect(mocks.provisionSandboxWithSaga).not.toHaveBeenCalled();
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
