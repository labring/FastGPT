import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findSandboxInstanceBySandboxId: vi.fn(),
  findSandboxResourcesBySource: vi.fn(),
  getSandboxAdapterConfig: vi.fn(),
  startSandboxRuntimeUpgradeArchive: vi.fn(),
  stopSandboxResource: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  findSandboxInstanceBySandboxId: mocks.findSandboxInstanceBySandboxId,
  findSandboxResourcesBySource: mocks.findSandboxResourcesBySource
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/config', () => ({
  getConfiguredSandboxProvider: () => 'opensandbox',
  getSandboxAdapterConfig: mocks.getSandboxAdapterConfig
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/archive', () => ({
  SANDBOX_STALE_ARCHIVING_MINUTES: 15,
  startSandboxRuntimeUpgradeArchive: mocks.startSandboxRuntimeUpgradeArchive
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  stopSandboxResource: mocks.stopSandboxResource
}));

import {
  getAppSandboxRuntimeStatus,
  getSandboxRuntimeUpgradeStatus,
  resolveSandboxRuntimeUpgradeTarget,
  upgradeAppSandboxRuntime
} from '@fastgpt/service/core/ai/sandbox/application/runtime/upgrade';

const targetImage = { repository: 'runtime-image', tag: 'v2' };
const createResource = (
  status: string,
  params: {
    provider?: 'opensandbox' | 'sealosdevbox';
    image?: { repository: string; tag?: string };
    operation?: Record<string, unknown>;
    sandboxId?: string;
  } = {}
) =>
  ({
    _id: 'instance-1',
    provider: params.provider ?? 'opensandbox',
    sandboxId: params.sandboxId ?? 'app-sandbox',
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'app-1',
    userId: 'user-1',
    status,
    lastActiveAt: new Date(),
    metadata: {
      image: params.image ?? targetImage,
      ...(params.operation ? { operation: params.operation } : {})
    }
  }) as any;

const getStatus = (statusInstance?: any) =>
  getSandboxRuntimeUpgradeStatus({
    sandboxId: 'app-sandbox',
    targetProvider: 'opensandbox',
    targetImage,
    statusInstance
  });

describe('getSandboxRuntimeUpgradeStatus', () => {
  it('selects current provider first and an outdated old provider as the upgrade fallback', () => {
    const current = createResource('running', {
      image: { repository: 'runtime-image', tag: 'v1' }
    });
    const stale = createResource('stopped', {
      provider: 'sealosdevbox',
      image: { repository: 'runtime-image', tag: 'v1' }
    });

    expect(
      resolveSandboxRuntimeUpgradeTarget({
        sandboxId: 'app-sandbox',
        targetProvider: 'opensandbox',
        targetImage,
        instances: [stale, current]
      })
    ).toMatchObject({ statusInstance: current, upgradeInstance: current });
    expect(
      resolveSandboxRuntimeUpgradeTarget({
        sandboxId: 'app-sandbox',
        targetProvider: 'opensandbox',
        targetImage,
        instances: [stale]
      })
    ).toMatchObject({ statusInstance: stale, upgradeInstance: stale });
  });

  it('only selects failed lifecycle operations that can safely continue into archive', () => {
    const failedStopping = createResource('stopping', {
      operation: { error: 'stop failed' }
    });
    const failedProvisioning = createResource('provisioning', {
      operation: { error: 'provision failed' }
    });

    expect(
      resolveSandboxRuntimeUpgradeTarget({
        sandboxId: 'app-sandbox',
        targetProvider: 'opensandbox',
        targetImage,
        instances: [failedStopping]
      })
    ).toMatchObject({ upgradeInstance: failedStopping });
    expect(
      resolveSandboxRuntimeUpgradeTarget({
        sandboxId: 'app-sandbox',
        targetProvider: 'opensandbox',
        targetImage,
        instances: [failedProvisioning]
      }).upgradeInstance
    ).toBeUndefined();
  });

  it('allows missing, archived, matched and stale failed restore instances to initialize', () => {
    expect(getStatus()).toEqual({ status: 'readyToInit' });
    expect(getStatus(createResource('archived'))).toEqual({ status: 'readyToInit' });
    expect(getStatus(createResource('running'))).toMatchObject({ status: 'readyToInit' });
    expect(
      getStatus(
        createResource('restoring', {
          operation: { heartbeatAt: new Date(0), error: 'restore failed' }
        })
      )
    ).toEqual({ status: 'readyToInit' });
  });

  it('requires an upgrade when repository/tag is missing or changed', () => {
    const missingImage = createResource('running');
    missingImage.metadata = {};
    expect(getStatus(missingImage)).toEqual({ status: 'upgradeRequired' });
    expect(
      getStatus(createResource('stopped', { image: { repository: 'runtime-image', tag: 'v1' } }))
    ).toEqual({ status: 'upgradeRequired' });
  });

  it('only exposes upgrade actions for failed stop and archive operations', () => {
    expect(getStatus(createResource('archiving'))).toEqual({ status: 'upgrading' });
    expect(
      getStatus(createResource('archiving', { operation: { error: 'archive failed' } }))
    ).toMatchObject({
      status: 'upgradeRequired',
      lastError: 'archive failed'
    });
    expect(getStatus(createResource('deleting'))).toEqual({ status: 'upgrading' });
    expect(
      getStatus(createResource('stopping', { operation: { error: 'stop failed' } }))
    ).toMatchObject({ status: 'upgradeRequired', lastError: 'stop failed' });
    expect(
      getStatus(createResource('deleting', { operation: { error: 'delete failed' } }))
    ).toEqual({ status: 'upgrading', lastError: 'delete failed' });
    expect(
      getStatus(createResource('legacyMigrating', { operation: { error: 'migration failed' } }))
    ).toEqual({ status: 'upgrading', lastError: 'migration failed' });
  });

  it('lets the owning runtime retry failed operations and keeps active operations polling', () => {
    const operation = { heartbeatAt: new Date(), phase: 'claimed' };
    expect(getStatus(createResource('restoring', { operation }))).toEqual({
      status: 'upgrading'
    });
    expect(getStatus(createResource('restoring', { provider: 'sealosdevbox', operation }))).toEqual(
      { status: 'upgrading' }
    );
    expect(
      getStatus(
        createResource('restoring', {
          provider: 'sealosdevbox',
          operation: { ...operation, error: 'restore failed' }
        })
      )
    ).toEqual({ status: 'readyToInit' });
    expect(
      getStatus(createResource('provisioning', { operation: { error: 'provision failed' } }))
    ).toEqual({ status: 'readyToInit' });
    expect(
      getStatus(
        createResource('provisioning', {
          operation: { phase: 'claimed' }
        })
      )
    ).toEqual({ status: 'upgrading' });
    expect(
      getStatus(
        createResource('provisioning', {
          operation: { heartbeatAt: new Date(0), phase: 'claimed' }
        })
      )
    ).toEqual({ status: 'readyToInit' });
  });
});

describe('App sandbox runtime upgrade service', () => {
  const query = {
    sandboxId: 'app-sandbox',
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'app-1',
    userId: 'user-1',
    chatId: 'chat-1'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSandboxAdapterConfig.mockReturnValue({ createConfig: { image: targetImage } });
    mocks.startSandboxRuntimeUpgradeArchive.mockResolvedValue({ success: true });
    mocks.stopSandboxResource.mockResolvedValue(undefined);
  });

  it('loads the sandbox-instance record and returns its image status', async () => {
    mocks.findSandboxResourcesBySource.mockResolvedValue([
      createResource('running', { image: { repository: 'runtime-image', tag: 'v1' } })
    ]);

    await expect(getAppSandboxRuntimeStatus(query)).resolves.toMatchObject({
      status: 'upgradeRequired'
    });
    expect(mocks.findSandboxResourcesBySource).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      userId: 'user-1'
    });
  });

  it('archives an outdated stable App runtime', async () => {
    const instance = createResource('running', {
      image: { repository: 'runtime-image', tag: 'v1' }
    });
    mocks.findSandboxResourcesBySource.mockResolvedValue([instance]);

    await expect(upgradeAppSandboxRuntime(query)).resolves.toEqual({ status: 'upgrading' });
    expect(mocks.startSandboxRuntimeUpgradeArchive).toHaveBeenCalledWith(instance);
  });

  it('finishes a failed stop before starting the runtime archive', async () => {
    const instance = createResource('stopping', {
      operation: { error: 'stop failed' }
    });
    mocks.findSandboxResourcesBySource.mockResolvedValue([instance]);

    await expect(upgradeAppSandboxRuntime(query)).resolves.toEqual({ status: 'upgrading' });
    expect(mocks.stopSandboxResource).toHaveBeenCalledWith(instance);
    expect(mocks.startSandboxRuntimeUpgradeArchive).toHaveBeenCalledWith(instance);
    expect(mocks.stopSandboxResource.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.startSandboxRuntimeUpgradeArchive.mock.invocationCallOrder[0]
    );
  });

  it('returns the refreshed state when a concurrent archive request wins the claim', async () => {
    const instance = createResource('running', {
      image: { repository: 'runtime-image', tag: 'v1' }
    });
    mocks.findSandboxResourcesBySource.mockResolvedValue([instance]);
    mocks.startSandboxRuntimeUpgradeArchive.mockResolvedValue({
      success: false,
      error: 'Resource was modified or occupied'
    });
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(createResource('archived'));

    await expect(upgradeAppSandboxRuntime(query)).resolves.toEqual({ status: 'readyToInit' });
    expect(mocks.findSandboxInstanceBySandboxId).toHaveBeenCalledWith({
      sandboxId: 'app-sandbox'
    });
  });

  it('does not archive a matched runtime and rejects identity corruption', async () => {
    mocks.findSandboxResourcesBySource.mockResolvedValue([createResource('running')]);
    await expect(upgradeAppSandboxRuntime(query)).resolves.toMatchObject({
      status: 'readyToInit'
    });
    expect(mocks.startSandboxRuntimeUpgradeArchive).not.toHaveBeenCalled();

    mocks.findSandboxResourcesBySource.mockResolvedValue([
      createResource('running', { sandboxId: 'unexpected-sandbox' })
    ]);
    await expect(getAppSandboxRuntimeStatus(query)).rejects.toThrow(
      'Sandbox runtime identity mismatch'
    );
  });
});
