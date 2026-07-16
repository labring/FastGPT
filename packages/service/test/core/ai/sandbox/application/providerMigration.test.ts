import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withSandboxLifecycleLease: vi.fn(),
  isRedisLeaseError: vi.fn(),
  createAgentSandboxInitializingError: vi.fn(),
  assertSandboxSourceActive: vi.fn(),
  findSandboxInstanceBySource: vi.fn(),
  claimSandboxOperation: vi.fn(),
  advanceSandboxOperation: vi.fn(),
  completeSandboxOperation: vi.fn(),
  completeSandboxProviderMigration: vi.fn(),
  markSandboxOperationFailed: vi.fn(),
  archiveSandboxResourceForProviderMigration: vi.fn(),
  buildSandboxResourceAdapter: vi.fn(),
  deleteSessionVolume: vi.fn()
}));

vi.mock('@fastgpt/service/common/redis/lock', () => ({
  isRedisLeaseError: mocks.isRedisLeaseError
}));

vi.mock('@fastgpt/service/core/ai/sandbox/error', () => ({
  createAgentSandboxInitializingError: mocks.createAgentSandboxInitializingError
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
  completeSandboxProviderMigration: mocks.completeSandboxProviderMigration,
  findSandboxInstanceBySource: mocks.findSandboxInstanceBySource,
  markSandboxOperationFailed: mocks.markSandboxOperationFailed
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
    archiveSandboxResourceForProviderMigration: mocks.archiveSandboxResourceForProviderMigration
  };
});

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
    mocks.isRedisLeaseError.mockReturnValue(false);
    mocks.createAgentSandboxInitializingError.mockReturnValue(new Error('Sandbox is initializing'));
    mocks.archiveSandboxResourceForProviderMigration.mockResolvedValue({ status: 'success' });
    mocks.advanceSandboxOperation.mockResolvedValue(
      createInstance({ status: 'providerMigrating' })
    );
    mocks.completeSandboxOperation.mockResolvedValue(createInstance({ status: 'archived' }));
    mocks.completeSandboxProviderMigration.mockResolvedValue(
      createInstance({
        provider: 'sealosdevbox',
        status: 'archived'
      })
    );
    mocks.markSandboxOperationFailed.mockResolvedValue(undefined);
    mocks.buildSandboxResourceAdapter.mockReturnValue({ delete: vi.fn(async () => undefined) });
    mocks.deleteSessionVolume.mockResolvedValue(undefined);
    mocks.claimSandboxOperation.mockResolvedValue(
      createInstance({
        status: 'providerMigrating',
        metadata: {
          operation: {
            id: 'migration-1',
            type: 'providerMigration',
            phase: 'claimed',
            startedAt: new Date(),
            heartbeatAt: new Date()
          }
        }
      })
    );
  });

  it.each([null, createInstance({ provider: 'sealosdevbox' })])(
    'returns before taking a lease when no stale provider record exists',
    async (instance) => {
      mocks.findSandboxInstanceBySource.mockResolvedValueOnce(instance);

      await migrateSandboxProviderBeforeUse(params);

      expect(mocks.assertSandboxSourceActive).toHaveBeenCalledWith({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1'
      });
      expect(mocks.withSandboxLifecycleLease).not.toHaveBeenCalled();
    }
  );

  it('archives and provider-switches the same record inside one lifecycle lease', async () => {
    const running = createInstance();
    const archived = createInstance({ status: 'archived' });
    mocks.findSandboxInstanceBySource
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(archived);

    await migrateSandboxProviderBeforeUse(params);

    expect(mocks.archiveSandboxResourceForProviderMigration).toHaveBeenCalledWith(running, lease);
    expect(mocks.claimSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: archived,
        status: 'providerMigrating',
        type: 'providerMigration',
        previousStatus: 'archived',
        fromProvider: 'opensandbox',
        targetProvider: 'sealosdevbox'
      })
    );
    expect(mocks.completeSandboxProviderMigration).toHaveBeenCalledWith({
      resource: expect.objectContaining({ status: 'providerMigrating' }),
      operationId: 'migration-1',
      provider: 'sealosdevbox'
    });
  });

  it('takes over an interrupted providerMigrating operation without re-archiving', async () => {
    const migrating = createInstance({
      status: 'providerMigrating',
      metadata: {
        operation: {
          id: 'old-provider-migration',
          type: 'providerMigration',
          phase: 'targetAdapterValidated',
          previousStatus: 'archived',
          fromProvider: 'opensandbox',
          targetProvider: 'sealosdevbox',
          startedAt: new Date(0),
          heartbeatAt: new Date(0)
        }
      }
    });
    mocks.findSandboxInstanceBySource.mockResolvedValue(migrating);
    mocks.claimSandboxOperation.mockResolvedValueOnce({
      ...migrating,
      metadata: {
        operation: { ...migrating.metadata.operation, id: 'resumed-provider-migration' }
      }
    });

    await migrateSandboxProviderBeforeUse(params);

    expect(mocks.archiveSandboxResourceForProviderMigration).not.toHaveBeenCalled();
    expect(mocks.claimSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: migrating,
        status: 'providerMigrating',
        fromProvider: 'opensandbox',
        targetProvider: 'sealosdevbox'
      })
    );
    expect(mocks.buildSandboxResourceAdapter).not.toHaveBeenCalled();
    expect(mocks.advanceSandboxOperation).not.toHaveBeenCalled();
    expect(mocks.completeSandboxProviderMigration).toHaveBeenCalledTimes(1);
  });

  it('rolls a failed old-provider restore back to archived without deleting S3', async () => {
    const restoring = createInstance({
      status: 'restoring',
      metadata: {
        operation: {
          id: 'old-restore',
          type: 'restore',
          phase: 'claimed',
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
    const providerClaim = createInstance({
      status: 'providerMigrating',
      metadata: {
        operation: {
          id: 'migration-after-rollback',
          type: 'providerMigration',
          phase: 'claimed',
          startedAt: new Date(),
          heartbeatAt: new Date()
        }
      }
    });
    mocks.findSandboxInstanceBySource
      .mockResolvedValueOnce(restoring)
      .mockResolvedValueOnce(restoring);
    mocks.claimSandboxOperation
      .mockResolvedValueOnce(restoreClaim)
      .mockResolvedValueOnce(providerClaim);
    mocks.completeSandboxOperation.mockResolvedValueOnce(archived);

    await migrateSandboxProviderBeforeUse(params);

    const rollbackAdapter = mocks.buildSandboxResourceAdapter.mock.results[0].value;
    expect(rollbackAdapter.delete).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSessionVolume).toHaveBeenCalledWith('app-sandbox');
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: 'restoring', status: 'archived' })
    );
    expect(mocks.completeSandboxProviderMigration).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'migration-after-rollback' })
    );
  });

  it('blocks when archive completes without producing an archived state', async () => {
    const running = createInstance();
    const deleting = createInstance({ status: 'deleting' });
    mocks.findSandboxInstanceBySource
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce(deleting);

    await expect(migrateSandboxProviderBeforeUse(params)).rejects.toMatchObject({
      name: 'SandboxLifecycleStateError',
      state: 'deleting'
    });
    expect(mocks.claimSandboxOperation).not.toHaveBeenCalled();
  });

  it('records the fencing token error when the final provider commit fails', async () => {
    const archived = createInstance({ status: 'archived' });
    mocks.findSandboxInstanceBySource.mockResolvedValue(archived);
    mocks.completeSandboxProviderMigration.mockResolvedValueOnce(null);

    await expect(migrateSandboxProviderBeforeUse(params)).rejects.toThrow('lost ownership');
    expect(mocks.markSandboxOperationFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'migration-1',
        status: 'providerMigrating',
        error: 'Sandbox provider migration lost ownership before commit'
      })
    );
  });

  it('maps lifecycle lease contention to the public initializing error', async () => {
    const leaseError = new Error('lease occupied');
    mocks.findSandboxInstanceBySource.mockResolvedValueOnce(createInstance());
    mocks.withSandboxLifecycleLease.mockRejectedValueOnce(leaseError);
    mocks.isRedisLeaseError.mockReturnValueOnce(true);

    await expect(migrateSandboxProviderBeforeUse(params)).rejects.toThrow(
      'Sandbox is initializing'
    );
  });
});
