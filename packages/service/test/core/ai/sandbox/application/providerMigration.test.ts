import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withSandboxLifecycleLease: vi.fn(),
  assertSandboxSourceActive: vi.fn(),
  findSandboxInstanceBySource: vi.fn(),
  claimSandboxOperation: vi.fn(),
  advanceSandboxOperation: vi.fn(),
  completeSandboxOperation: vi.fn(),
  switchArchivedSandboxProvider: vi.fn(),
  markSandboxOperationFailed: vi.fn(),
  archiveSandboxResourceWithinLease: vi.fn(),
  buildSandboxResourceAdapter: vi.fn(),
  deleteSessionVolume: vi.fn(),
  resolveSandboxRuntimeImage: vi.fn()
}));

vi.mock('@fastgpt/service/common/redis/lock', () => ({
  isRedisLeaseError: () => false
}));

vi.mock('@fastgpt/service/core/ai/sandbox/error', () => ({
  createAgentSandboxInitializingError: () => new Error('Sandbox is initializing')
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxLifecycleLease: mocks.withSandboxLifecycleLease
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => ({
  assertSandboxSourceActive: mocks.assertSandboxSourceActive
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  advanceSandboxOperation: mocks.advanceSandboxOperation,
  claimSandboxOperation: mocks.claimSandboxOperation,
  completeSandboxOperation: mocks.completeSandboxOperation,
  findSandboxInstanceBySource: mocks.findSandboxInstanceBySource,
  markSandboxOperationFailed: mocks.markSandboxOperationFailed,
  switchArchivedSandboxProvider: mocks.switchArchivedSandboxProvider
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter', () => ({
  buildSandboxResourceAdapter: mocks.buildSandboxResourceAdapter
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/volume/service', () => ({
  deleteSessionVolume: mocks.deleteSessionVolume
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/archive', () => {
  class SandboxLifecycleStateError extends Error {
    constructor(readonly state: string) {
      super(`Sandbox is ${state}`);
      this.name = 'SandboxLifecycleStateError';
    }
  }
  return {
    SANDBOX_STALE_ARCHIVING_MINUTES: 45,
    SandboxLifecycleStateError,
    archiveSandboxResourceWithinLease: mocks.archiveSandboxResourceWithinLease
  };
});

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/image', () => ({
  resolveSandboxRuntimeImage: mocks.resolveSandboxRuntimeImage
}));

import { migrateSandboxProviderBeforeUse } from '@fastgpt/service/core/ai/sandbox/application/providerMigration';

const params = {
  provider: 'sealosdevbox' as const,
  sandboxId: 'app-sandbox',
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app-1',
  userId: 'user-1'
};

const createInstance = (overrides: Record<string, unknown> = {}) =>
  ({
    provider: 'opensandbox',
    sandboxId: params.sandboxId,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    userId: params.userId,
    status: 'running',
    lastActiveAt: new Date('2026-07-01T00:00:00.000Z'),
    metadata: {},
    ...overrides
  }) as any;

describe('sandbox provider migration lifecycle', () => {
  const lease = {
    signal: new AbortController().signal,
    assertValid: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertSandboxSourceActive.mockResolvedValue(undefined);
    mocks.withSandboxLifecycleLease.mockImplementation(async ({ fn }: any) => fn(lease));
    mocks.archiveSandboxResourceWithinLease.mockResolvedValue({ status: 'success' });
    mocks.advanceSandboxOperation.mockResolvedValue(createInstance({ status: 'restoring' }));
    mocks.completeSandboxOperation.mockResolvedValue(createInstance({ status: 'archived' }));
    mocks.switchArchivedSandboxProvider.mockResolvedValue(
      createInstance({
        provider: 'sealosdevbox',
        status: 'archived'
      })
    );
    mocks.markSandboxOperationFailed.mockResolvedValue(undefined);
    mocks.buildSandboxResourceAdapter.mockReturnValue({ delete: vi.fn(async () => undefined) });
    mocks.deleteSessionVolume.mockResolvedValue(undefined);
    mocks.resolveSandboxRuntimeImage.mockReturnValue({
      repository: 'registry.example.com/sandbox',
      tag: 'v2'
    });
  });

  it('starts archive with the old provider before switching the archived record', async () => {
    const running = createInstance();
    const archived = createInstance({ status: 'archived' });
    mocks.findSandboxInstanceBySource
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(archived);

    await migrateSandboxProviderBeforeUse(params);

    expect(mocks.buildSandboxResourceAdapter).toHaveBeenCalledWith({
      provider: 'sealosdevbox',
      sandboxId: 'app-sandbox'
    });
    expect(mocks.archiveSandboxResourceWithinLease).toHaveBeenCalledWith(running, lease);
    expect(mocks.archiveSandboxResourceWithinLease.mock.calls[0][0].provider).toBe('opensandbox');
    expect(mocks.switchArchivedSandboxProvider).toHaveBeenCalledWith({
      resource: archived,
      provider: 'sealosdevbox',
      image: { repository: 'registry.example.com/sandbox', tag: 'v2' }
    });
  });

  it('validates the target provider before archiving the current resource', async () => {
    const running = createInstance();
    mocks.findSandboxInstanceBySource.mockResolvedValue(running);
    mocks.buildSandboxResourceAdapter.mockImplementationOnce(() => {
      throw new Error('Target provider is not configured');
    });

    await expect(migrateSandboxProviderBeforeUse(params)).rejects.toThrow(
      'Target provider is not configured'
    );

    expect(mocks.archiveSandboxResourceWithinLease).not.toHaveBeenCalled();
    expect(mocks.switchArchivedSandboxProvider).not.toHaveBeenCalled();
  });

  it('accepts a concurrent archived provider switch without replaying archive', async () => {
    const archived = createInstance({ status: 'archived' });
    const switched = createInstance({ provider: 'sealosdevbox', status: 'archived' });
    mocks.findSandboxInstanceBySource
      .mockResolvedValueOnce(archived)
      .mockResolvedValueOnce(archived)
      .mockResolvedValueOnce(switched);
    mocks.switchArchivedSandboxProvider.mockResolvedValueOnce(null);

    await expect(migrateSandboxProviderBeforeUse(params)).resolves.toBeUndefined();

    expect(mocks.archiveSandboxResourceWithinLease).not.toHaveBeenCalled();
    expect(mocks.switchArchivedSandboxProvider).toHaveBeenCalledWith({
      resource: archived,
      provider: 'sealosdevbox',
      image: { repository: 'registry.example.com/sandbox', tag: 'v2' }
    });
  });

  it('rolls an archiveInstalled old-provider restore back to archived without deleting S3', async () => {
    const restoring = createInstance({
      status: 'restoring',
      metadata: {
        operation: {
          id: 'old-restore',
          type: 'restore',
          phase: 'archiveInstalled',
          previousStatus: 'archived',
          startedAt: new Date(0),
          heartbeatAt: new Date(0),
          error: 'worker stopped'
        }
      }
    });
    const archived = createInstance({ status: 'archived' });
    const restoreClaim = {
      ...restoring,
      metadata: {
        operation: {
          ...restoring.metadata.operation,
          id: 'rollback-restore'
        }
      }
    };
    mocks.findSandboxInstanceBySource
      .mockResolvedValueOnce(restoring)
      .mockResolvedValueOnce(restoring);
    mocks.claimSandboxOperation.mockResolvedValueOnce(restoreClaim);
    mocks.completeSandboxOperation.mockResolvedValueOnce(archived);

    await migrateSandboxProviderBeforeUse(params);

    const rollbackAdapter = mocks.buildSandboxResourceAdapter.mock.results[1].value;
    expect(rollbackAdapter.delete).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSessionVolume).toHaveBeenCalledWith('app-sandbox');
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: 'restoring', status: 'archived' })
    );
    expect(mocks.switchArchivedSandboxProvider).toHaveBeenCalledWith({
      resource: archived,
      provider: 'sealosdevbox',
      image: { repository: 'registry.example.com/sandbox', tag: 'v2' }
    });
  });
});
