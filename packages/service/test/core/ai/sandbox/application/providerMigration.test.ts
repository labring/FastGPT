import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertSandboxSourceActive: vi.fn(),
  findSandboxInstanceBySource: vi.fn(),
  migrateSandboxProviderWithSaga: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => ({
  assertSandboxSourceActive: mocks.assertSandboxSourceActive
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  findSandboxInstanceBySource: mocks.findSandboxInstanceBySource
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lifecycle/service', () => ({
  migrateSandboxProviderWithSaga: mocks.migrateSandboxProviderWithSaga
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

describe('sandbox provider migration Saga routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertSandboxSourceActive.mockResolvedValue(undefined);
    mocks.migrateSandboxProviderWithSaga.mockResolvedValue(undefined);
  });

  it('does not start a migration Saga without a provider change', async () => {
    for (const instance of [null, createInstance({ provider: 'sealosdevbox' })]) {
      mocks.findSandboxInstanceBySource.mockResolvedValueOnce(instance);

      await migrateSandboxProviderBeforeUse(params);
    }
    expect(mocks.assertSandboxSourceActive).toHaveBeenCalledTimes(2);
    expect(mocks.findSandboxInstanceBySource).toHaveBeenCalledTimes(2);
    expect(mocks.migrateSandboxProviderWithSaga).not.toHaveBeenCalled();
  });

  it('delegates provider changes to the migration Saga service', async () => {
    const resource = createInstance();
    mocks.findSandboxInstanceBySource.mockResolvedValueOnce(resource);

    await migrateSandboxProviderBeforeUse(params);

    expect(mocks.migrateSandboxProviderWithSaga).toHaveBeenCalledWith({
      resource,
      targetProvider: 'sealosdevbox'
    });
  });

  it('rejects a stale caller sandboxId before dispatching migration', async () => {
    mocks.findSandboxInstanceBySource.mockResolvedValueOnce(
      createInstance({ sandboxId: 'newer-sandbox' })
    );

    await expect(migrateSandboxProviderBeforeUse(params)).rejects.toThrow(
      'Sandbox provider migration sandboxId mismatch: expected app-sandbox, received newer-sandbox'
    );
    expect(mocks.migrateSandboxProviderWithSaga).not.toHaveBeenCalled();
  });

  it('checks source activity before reading or migrating the resource', async () => {
    mocks.assertSandboxSourceActive.mockRejectedValueOnce(new Error('source deleted'));

    await expect(migrateSandboxProviderBeforeUse(params)).rejects.toThrow('source deleted');

    expect(mocks.findSandboxInstanceBySource).not.toHaveBeenCalled();
    expect(mocks.migrateSandboxProviderWithSaga).not.toHaveBeenCalled();
  });
});
