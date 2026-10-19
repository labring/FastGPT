import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectedOperationByStatus } from '@fastgpt/service/core/ai/sandbox/constants';
import type { SandboxInstanceStatusType } from '@fastgpt/service/core/ai/sandbox/type';

const mocks = vi.hoisted(() => ({
  findSandboxInstanceBySandboxId: vi.fn(),
  findSandboxResourcesBySource: vi.fn(),
  getSandboxAdapterConfig: vi.fn(),
  archiveSandboxResourceNow: vi.fn(),
  startSandboxRuntimeUpgradeArchive: vi.fn(),
  stopSandboxResource: vi.fn(),
  configuration: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/service', () => ({
  ensureSandboxRuntimeConfiguration: mocks.configuration
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
  archiveSandboxResourceNow: mocks.archiveSandboxResourceNow,
  startSandboxRuntimeUpgradeArchive: mocks.startSandboxRuntimeUpgradeArchive
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
  status: SandboxInstanceStatusType,
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
    image: params.image ?? targetImage,
    ...(params.operation
      ? {
          operation: {
            type: expectedOperationByStatus[status],
            phase: 'claimed',
            heartbeatAt: new Date(),
            ...params.operation
          }
        }
      : {})
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
      operation: { type: 'stop', retryAfter: new Date(0), error: 'stop failed' }
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
    delete missingImage.image;
    expect(getStatus(missingImage)).toEqual({ status: 'upgradeRequired' });
    expect(
      getStatus(createResource('stopped', { image: { repository: 'runtime-image', tag: 'v1' } }))
    ).toEqual({ status: 'upgradeRequired' });
  });

  it('only exposes upgrade actions for failed stop and archive operations', () => {
    expect(getStatus(createResource('archiving'))).toEqual({ status: 'upgrading' });
    expect(
      getStatus(
        createResource('archiving', {
          operation: { type: 'archive', retryAfter: new Date(0), error: 'archive failed' }
        })
      )
    ).toMatchObject({
      status: 'upgradeRequired',
      lastError: 'archive failed'
    });
    expect(getStatus(createResource('deleting'))).toEqual({ status: 'upgrading' });
    expect(
      getStatus(
        createResource('stopping', {
          operation: { type: 'stop', retryAfter: new Date(0), error: 'stop failed' }
        })
      )
    ).toMatchObject({ status: 'upgradeRequired', lastError: 'stop failed' });
    expect(
      getStatus(createResource('deleting', { operation: { error: 'delete failed' } }))
    ).toEqual({ status: 'upgrading', lastError: 'delete failed' });
    expect(
      getStatus(createResource('legacyMigrating', { operation: { error: 'migration failed' } }))
    ).toEqual({ status: 'upgrading', lastError: 'migration failed' });
  });

  it('does not offer takeover before retryAfter even when an error is displayed', () => {
    const instance = createResource('archiving', {
      operation: { type: 'archive', error: 'timeout', retryAfter: new Date(Date.now() + 60_000) }
    });
    expect(getStatus(instance)).toEqual({ status: 'upgrading', lastError: 'timeout' });
    expect(
      resolveSandboxRuntimeUpgradeTarget({
        sandboxId: 'app-sandbox',
        targetProvider: 'opensandbox',
        targetImage,
        instances: [instance]
      }).upgradeInstance
    ).toBeUndefined();
  });

  it('waits through failure isolation and allows stale operations to recover', () => {
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
    ).toEqual({ status: 'upgrading' });
    expect(
      getStatus(createResource('provisioning', { operation: { error: 'provision failed' } }))
    ).toEqual({ status: 'upgrading', lastError: 'provision failed' });
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
    mocks.startSandboxRuntimeUpgradeArchive.mockResolvedValue({ success: true });
    mocks.stopSandboxResource.mockResolvedValue(undefined);
  });

  it('prepares configuration through the shared runtime entry', async () => {
    mocks.configuration.mockResolvedValue(undefined);
    await expect(ensureAppSandboxRuntimeReady({ query })).resolves.toBe(false);
    expect(mocks.configuration).toHaveBeenCalledWith({ query, onUpgrade: expect.any(Function) });
  });
  it('reports an observed migration once even when multiple stages report progress', async () => {
    mocks.configuration.mockImplementationOnce(async ({ onUpgrade }) => {
      onUpgrade();
      onUpgrade();
    });
    const onUpgrade = vi.fn();
    await expect(ensureAppSandboxRuntimeReady({ query, onUpgrade })).resolves.toBe(true);
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
  it('preserves a concrete preparation failure', async () => {
    mocks.configuration.mockRejectedValueOnce(new Error('archive upload failed'));
    await expect(ensureAppSandboxRuntimeReady({ query })).rejects.toThrow('archive upload failed');
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
