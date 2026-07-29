import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findSandboxInstanceBySandboxId: vi.fn(),
  findSandboxResourcesBySource: vi.fn(),
  getSandboxAdapterConfig: vi.fn(),
  archiveSandboxResourceNow: vi.fn(),
  migrateSandboxProviderBeforeUse: vi.fn(),
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
  archiveSandboxResourceNow: mocks.archiveSandboxResourceNow,
  startSandboxRuntimeUpgradeArchive: mocks.startSandboxRuntimeUpgradeArchive
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/providerMigration', () => ({
  migrateSandboxProviderBeforeUse: mocks.migrateSandboxProviderBeforeUse
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  stopSandboxResource: mocks.stopSandboxResource
}));

import {
  ensureAppSandboxRuntimeReady,
  getSandboxRuntimeUpgradeStatus,
  resolveSandboxRuntimeUpgradeTarget,
  triggerSandboxRuntimeUpgrade
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
    vi.resetAllMocks();
    mocks.getSandboxAdapterConfig.mockReturnValue({ createConfig: { image: targetImage } });
    mocks.archiveSandboxResourceNow.mockResolvedValue({ status: 'success' });
    mocks.migrateSandboxProviderBeforeUse.mockResolvedValue(undefined);
    mocks.startSandboxRuntimeUpgradeArchive.mockResolvedValue({ success: true });
    mocks.stopSandboxResource.mockResolvedValue(undefined);
  });

  it('continues directly when provider and image already match', async () => {
    mocks.findSandboxResourcesBySource.mockResolvedValue([createResource('running')]);
    const onUpgrade = vi.fn();

    await expect(ensureAppSandboxRuntimeReady({ query, onUpgrade })).resolves.toBe(false);
    expect(mocks.findSandboxResourcesBySource).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      userId: 'user-1'
    });
    expect(onUpgrade).not.toHaveBeenCalled();
    expect(mocks.archiveSandboxResourceNow).not.toHaveBeenCalled();
    expect(mocks.migrateSandboxProviderBeforeUse).not.toHaveBeenCalled();
  });

  it('silently archives an outdated image and reports upgrading once', async () => {
    const instance = createResource('running', {
      image: { repository: 'runtime-image', tag: 'v1' }
    });
    mocks.findSandboxResourcesBySource
      .mockResolvedValueOnce([instance])
      .mockResolvedValueOnce([createResource('archived', { image: instance.metadata.image })]);
    const onUpgrade = vi.fn();

    await expect(ensureAppSandboxRuntimeReady({ query, onUpgrade })).resolves.toBe(true);
    expect(onUpgrade).toHaveBeenCalledOnce();
    expect(mocks.archiveSandboxResourceNow).toHaveBeenCalledWith(instance);
    expect(mocks.startSandboxRuntimeUpgradeArchive).not.toHaveBeenCalled();
  });

  it('silently migrates an old provider before runtime initialization', async () => {
    const oldProviderInstance = createResource('running', { provider: 'sealosdevbox' });
    mocks.findSandboxResourcesBySource
      .mockResolvedValueOnce([oldProviderInstance])
      .mockResolvedValueOnce([createResource('archived')]);
    const onUpgrade = vi.fn();

    await expect(ensureAppSandboxRuntimeReady({ query, onUpgrade })).resolves.toBe(true);
    expect(onUpgrade).toHaveBeenCalledOnce();
    expect(mocks.migrateSandboxProviderBeforeUse).toHaveBeenCalledWith({
      provider: 'opensandbox',
      sandboxId: 'app-sandbox',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      userId: 'user-1'
    });
    expect(mocks.archiveSandboxResourceNow).not.toHaveBeenCalled();
  });

  it('finishes a failed stop before archiving an outdated image', async () => {
    const instance = createResource('stopping', {
      image: { repository: 'runtime-image', tag: 'v1' },
      operation: { error: 'stop failed' }
    });
    const stoppedInstance = createResource('stopped', { image: instance.metadata.image });
    mocks.findSandboxResourcesBySource
      .mockResolvedValueOnce([instance])
      .mockResolvedValueOnce([stoppedInstance])
      .mockResolvedValueOnce([createResource('archived', { image: instance.metadata.image })]);

    await expect(ensureAppSandboxRuntimeReady({ query })).resolves.toBe(true);
    expect(mocks.stopSandboxResource).toHaveBeenCalledWith(instance);
    expect(mocks.archiveSandboxResourceNow).toHaveBeenCalledWith(stoppedInstance);
    expect(mocks.stopSandboxResource.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.archiveSandboxResourceNow.mock.invocationCallOrder[0]
    );
  });

  it('throws the concrete archive failure reason', async () => {
    const instance = createResource('running', {
      image: { repository: 'runtime-image', tag: 'v1' }
    });
    mocks.findSandboxResourcesBySource.mockResolvedValue([instance]);
    mocks.archiveSandboxResourceNow.mockResolvedValue({
      status: 'failed',
      error: 'archive upload failed'
    });

    await expect(ensureAppSandboxRuntimeReady({ query })).rejects.toThrow('archive upload failed');
  });

  it('throws the concrete identity corruption reason', async () => {
    mocks.findSandboxResourcesBySource.mockResolvedValue([
      createResource('running', { sandboxId: 'unexpected-sandbox' })
    ]);
    await expect(ensureAppSandboxRuntimeReady({ query })).rejects.toThrow(
      'Sandbox runtime identity mismatch'
    );
  });

  it('keeps the explicit background upgrade entry for Skill', async () => {
    const instance = createResource('running', {
      image: { repository: 'runtime-image', tag: 'v1' }
    });
    const context = {
      sandboxId: 'app-sandbox',
      targetProvider: 'opensandbox' as const,
      targetImage,
      statusInstance: instance,
      upgradeInstance: instance
    };

    await expect(triggerSandboxRuntimeUpgrade(context)).resolves.toEqual({ status: 'upgrading' });
    expect(mocks.startSandboxRuntimeUpgradeArchive).toHaveBeenCalledWith(instance);
  });
});
