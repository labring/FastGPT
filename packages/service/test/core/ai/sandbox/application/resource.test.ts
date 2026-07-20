import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  stopSandboxResourceWithSaga: vi.fn(),
  deleteSandboxResourceWithSaga: vi.fn(),
  findInactiveRunningSandboxResources: vi.fn(),
  findSandboxInstanceBySandboxId: vi.fn(),
  findSandboxInstanceBySandboxIdAndTeam: vi.fn(),
  findSandboxResourceBySandboxIdAndTeam: vi.fn(),
  findSandboxResourcesBySource: vi.fn(),
  findSkillRelatedSandboxResources: vi.fn(),
  getSandboxProviderConfig: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));

vi.mock('@fastgpt/global/common/system/utils', () => ({
  batchRun: async (items: unknown[], handler: (item: unknown) => Promise<unknown>) => {
    const results = [];
    for (const item of items) results.push(await handler(item));
    return results;
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lifecycle/service', () => ({
  stopSandboxResourceWithSaga: mocks.stopSandboxResourceWithSaga,
  deleteSandboxResourceWithSaga: mocks.deleteSandboxResourceWithSaga
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  findInactiveRunningSandboxResources: mocks.findInactiveRunningSandboxResources,
  findSandboxInstanceBySandboxId: mocks.findSandboxInstanceBySandboxId,
  findSandboxInstanceBySandboxIdAndTeam: mocks.findSandboxInstanceBySandboxIdAndTeam,
  findSandboxResourceBySandboxIdAndTeam: mocks.findSandboxResourceBySandboxIdAndTeam,
  findSandboxResourcesBySource: mocks.findSandboxResourcesBySource,
  findSkillRelatedSandboxResources: mocks.findSkillRelatedSandboxResources
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/config', () => ({
  getSandboxProviderConfig: mocks.getSandboxProviderConfig
}));

import {
  deleteAppSandboxes,
  deleteSandbox,
  deleteSandboxResource,
  deleteSkillEditSandboxes,
  getSandboxInfo,
  settleActiveSandboxSagasBySource,
  stopSandboxResource,
  stopSandboxResources
} from '@fastgpt/service/core/ai/sandbox/application/resource';

const createResource = (overrides: Record<string, unknown> = {}) =>
  ({
    provider: 'opensandbox',
    sandboxId: 'sandbox-1',
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'app-1',
    userId: 'user-1',
    status: 'running',
    lastActiveAt: new Date('2026-07-01T00:00:00.000Z'),
    metadata: {},
    ...overrides
  }) as any;

describe('sandbox resource Saga routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stopSandboxResourceWithSaga.mockResolvedValue(undefined);
    mocks.deleteSandboxResourceWithSaga.mockResolvedValue(undefined);
    mocks.findSandboxResourcesBySource.mockResolvedValue([]);
    mocks.findSkillRelatedSandboxResources.mockResolvedValue([]);
    mocks.getSandboxProviderConfig.mockReturnValue({ provider: 'opensandbox' });
  });

  it('reloads a partial resource before dispatching the stop Saga', async () => {
    const resource = createResource();
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(resource);

    await stopSandboxResource({ provider: 'opensandbox', sandboxId: 'sandbox-1' });

    expect(mocks.findSandboxInstanceBySandboxId).toHaveBeenCalledWith({
      sandboxId: 'sandbox-1'
    });
    expect(mocks.stopSandboxResourceWithSaga).toHaveBeenCalledWith(resource);
  });

  it('dispatches complete running and stopping resources directly', async () => {
    const resources = [
      createResource(),
      createResource({ sandboxId: 'stopping', status: 'stopping' })
    ];

    for (const resource of resources) await stopSandboxResource(resource);

    expect(mocks.findSandboxInstanceBySandboxId).not.toHaveBeenCalled();
    expect(mocks.stopSandboxResourceWithSaga.mock.calls).toEqual(
      resources.map((resource) => [resource])
    );
  });

  it('does not start a stop Saga outside running or stopping', async () => {
    await stopSandboxResource(createResource({ status: 'archived' }));

    expect(mocks.stopSandboxResourceWithSaga).not.toHaveBeenCalled();
  });

  it('routes a complete resource to the delete Saga without reloading it', async () => {
    const resource = createResource({ status: 'restoring' });

    await deleteSandboxResource(resource);

    expect(mocks.findSandboxInstanceBySandboxId).not.toHaveBeenCalled();
    expect(mocks.deleteSandboxResourceWithSaga).toHaveBeenCalledWith(resource);
  });

  it('reloads a partial resource before dispatching the delete Saga', async () => {
    const resource = createResource({ status: 'restoring' });
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(resource);

    await deleteSandboxResource({ provider: 'opensandbox', sandboxId: 'sandbox-1' });

    expect(mocks.deleteSandboxResourceWithSaga).toHaveBeenCalledWith(resource);
  });

  it('returns sandbox info only through the provider and team scoped query', async () => {
    const value = createResource();
    const toObject = vi.fn(() => value);
    mocks.findSandboxInstanceBySandboxIdAndTeam.mockResolvedValueOnce({ toObject });

    await expect(getSandboxInfo({ sandboxId: 'sandbox-1', teamId: 'team-1' })).resolves.toBe(value);

    expect(mocks.findSandboxInstanceBySandboxIdAndTeam).toHaveBeenCalledWith({
      provider: 'opensandbox',
      sandboxId: 'sandbox-1',
      teamId: 'team-1'
    });
    expect(toObject).toHaveBeenCalledTimes(1);
  });

  it('dispatches an authorized delete through the Saga service', async () => {
    const resource = createResource({ status: 'archived' });
    mocks.findSandboxResourceBySandboxIdAndTeam.mockResolvedValueOnce(resource);

    await deleteSandbox({ sandboxId: 'sandbox-1', teamId: 'team-1' });

    expect(mocks.findSandboxResourceBySandboxIdAndTeam).toHaveBeenCalledWith({
      provider: 'opensandbox',
      sandboxId: 'sandbox-1',
      teamId: 'team-1'
    });
    expect(mocks.deleteSandboxResourceWithSaga).toHaveBeenCalledWith(resource);
  });

  it('batches all app resources through the delete Saga', async () => {
    const resources = [
      createResource({ sandboxId: 'app-sandbox-1' }),
      createResource({ sandboxId: 'app-sandbox-2', status: 'archived' })
    ];
    mocks.findSandboxResourcesBySource.mockResolvedValueOnce(resources);

    await deleteAppSandboxes('app-1');

    expect(mocks.findSandboxResourcesBySource).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1'
    });
    expect(mocks.deleteSandboxResourceWithSaga).toHaveBeenCalledTimes(2);
    expect(mocks.deleteSandboxResourceWithSaga).toHaveBeenCalledWith(resources[0]);
    expect(mocks.deleteSandboxResourceWithSaga).toHaveBeenCalledWith(resources[1]);
  });

  it('batches all related skill resources through the delete Saga', async () => {
    const resources = [
      createResource({ sandboxId: 'skill-sandbox-1', sourceType: ChatSourceTypeEnum.skillEdit }),
      createResource({ sandboxId: 'skill-sandbox-2', sourceType: ChatSourceTypeEnum.skillEdit })
    ];
    mocks.findSkillRelatedSandboxResources.mockResolvedValueOnce(resources);

    await deleteSkillEditSandboxes(['skill-1', 'skill-2']);

    expect(mocks.findSkillRelatedSandboxResources).toHaveBeenCalledWith(['skill-1', 'skill-2']);
    expect(mocks.deleteSandboxResourceWithSaga).toHaveBeenCalledTimes(2);
  });

  it('settles only resources with an active Saga before source deletion', async () => {
    const activeResources = [
      createResource({
        sandboxId: 'active-archive',
        metadata: { activeSaga: { sagaId: 'archive-saga' } }
      }),
      createResource({
        sandboxId: 'active-restore',
        metadata: { activeSaga: { sagaId: 'restore-saga' } }
      })
    ];
    const stableResource = createResource({ sandboxId: 'stable', metadata: {} });
    mocks.findSandboxResourcesBySource.mockResolvedValueOnce([
      activeResources[0],
      stableResource,
      activeResources[1]
    ]);

    await settleActiveSandboxSagasBySource({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1'
    });

    expect(mocks.findSandboxResourcesBySource).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1'
    });
    expect(mocks.deleteSandboxResourceWithSaga).toHaveBeenCalledTimes(2);
    expect(mocks.deleteSandboxResourceWithSaga).toHaveBeenCalledWith(activeResources[0]);
    expect(mocks.deleteSandboxResourceWithSaga).toHaveBeenCalledWith(activeResources[1]);
    expect(mocks.deleteSandboxResourceWithSaga).not.toHaveBeenCalledWith(stableResource);
  });

  it('isolates stop failures so the rest of a cron batch still reaches the Saga service', async () => {
    const resources = [
      createResource({ sandboxId: 'failed' }),
      createResource({ sandboxId: 'success-1' }),
      createResource({ sandboxId: 'success-2', status: 'stopping' })
    ];
    mocks.stopSandboxResourceWithSaga.mockImplementation(async (resource) => {
      if (resource.sandboxId === 'failed') throw new Error('stop failed');
    });

    await stopSandboxResources(resources);

    expect(mocks.stopSandboxResourceWithSaga).toHaveBeenCalledTimes(3);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      'Failed to stop sandbox',
      expect.objectContaining({ sandboxId: 'failed', error: expect.any(Error) })
    );
  });
});
