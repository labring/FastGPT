import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  buildSandboxResourceAdapter: vi.fn(),
  deleteSessionVolume: vi.fn(),
  deleteWorkspaceArchiveNow: vi.fn(),
  withSandboxLifecycleLease: vi.fn(),
  findSandboxInstanceBySandboxId: vi.fn(),
  claimSandboxOperation: vi.fn(),
  advanceSandboxOperation: vi.fn(),
  completeSandboxOperation: vi.fn(),
  deleteClaimedSandboxRecord: vi.fn(),
  markSandboxOperationFailed: vi.fn(),
  findStaleSandboxOperations: vi.fn(),
  findSandboxResourcesBySource: vi.fn(),
  findSkillRelatedSandboxResources: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxLifecycleLease: mocks.withSandboxLifecycleLease
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter', () => ({
  buildSandboxResourceAdapter: mocks.buildSandboxResourceAdapter
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/volume/service', () => ({
  deleteSessionVolume: mocks.deleteSessionVolume
}));

vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({
  getS3SandboxSource: () => ({ deleteWorkspaceArchiveNow: mocks.deleteWorkspaceArchiveNow })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  advanceSandboxOperation: mocks.advanceSandboxOperation,
  claimSandboxOperation: mocks.claimSandboxOperation,
  completeSandboxOperation: mocks.completeSandboxOperation,
  deleteClaimedSandboxRecord: mocks.deleteClaimedSandboxRecord,
  findInactiveRunningSandboxResources: vi.fn(),
  findStaleSandboxOperations: mocks.findStaleSandboxOperations,
  findSandboxInstanceBySandboxId: mocks.findSandboxInstanceBySandboxId,
  findSandboxResourcesBySource: mocks.findSandboxResourcesBySource,
  findSkillRelatedSandboxResources: mocks.findSkillRelatedSandboxResources,
  markSandboxOperationFailed: mocks.markSandboxOperationFailed
}));

import {
  deleteAppSandboxes,
  deleteSandboxResource,
  deleteSkillEditSandboxes,
  retryStaleStoppingSandboxes,
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

const createClaimed = (status: string, type: string) =>
  createResource({
    status,
    metadata: {
      operation: {
        id: 'operation-1',
        type,
        phase: 'claimed',
        startedAt: new Date(),
        heartbeatAt: new Date()
      }
    }
  });

describe('sandbox resource lifecycle', () => {
  const assertValid = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withSandboxLifecycleLease.mockImplementation(async ({ fn }: any) =>
      fn({ signal: new AbortController().signal, assertValid })
    );
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(createResource());
    mocks.claimSandboxOperation.mockImplementation(async ({ status, type }: any) =>
      createClaimed(status, type)
    );
    mocks.advanceSandboxOperation.mockResolvedValue(createClaimed('stopping', 'stop'));
    mocks.completeSandboxOperation.mockResolvedValue(createResource({ status: 'stopped' }));
    mocks.deleteClaimedSandboxRecord.mockResolvedValue({ deletedCount: 1 });
    mocks.markSandboxOperationFailed.mockResolvedValue(undefined);
    mocks.deleteSessionVolume.mockResolvedValue(undefined);
    mocks.deleteWorkspaceArchiveNow.mockResolvedValue(undefined);
    mocks.findSandboxResourcesBySource.mockResolvedValue([]);
    mocks.findSkillRelatedSandboxResources.mockResolvedValue([]);
    mocks.findStaleSandboxOperations.mockResolvedValue([]);
    mocks.buildSandboxResourceAdapter.mockReturnValue({
      stop: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined)
    });
  });

  it('claims running -> stopping before the provider call and commits stopped', async () => {
    await stopSandboxResource(createResource());

    const adapter = mocks.buildSandboxResourceAdapter.mock.results[0].value;
    expect(mocks.claimSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'stopping', type: 'stop', matchLastActiveAt: true })
    );
    expect(mocks.claimSandboxOperation.mock.invocationCallOrder[0]).toBeLessThan(
      adapter.stop.mock.invocationCallOrder[0]
    );
    expect(mocks.advanceSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'operation-1', phase: 'providerStopped' })
    );
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: 'stopping', status: 'stopped' })
    );
  });

  it('uses the cron candidate timestamp so a concurrent touch wins the stop CAS', async () => {
    const candidate = createResource({
      lastActiveAt: new Date('2026-07-01T00:00:00.000Z')
    });
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(
      createResource({ lastActiveAt: new Date('2026-07-01T00:01:00.000Z') })
    );
    mocks.claimSandboxOperation.mockResolvedValueOnce(null);

    await stopSandboxResource(candidate);

    expect(mocks.claimSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: expect.objectContaining({ lastActiveAt: candidate.lastActiveAt }),
        matchLastActiveAt: true
      })
    );
    expect(mocks.buildSandboxResourceAdapter).not.toHaveBeenCalled();
  });

  it('keeps stopping with an operation error when provider stop fails', async () => {
    mocks.buildSandboxResourceAdapter.mockReturnValueOnce({
      stop: vi.fn(async () => {
        throw new Error('provider stop failed');
      }),
      delete: vi.fn()
    });

    await expect(stopSandboxResource(createResource())).rejects.toThrow('provider stop failed');
    expect(mocks.markSandboxOperationFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'operation-1',
        status: 'stopping',
        error: 'provider stop failed'
      })
    );
    expect(mocks.completeSandboxOperation).not.toHaveBeenCalled();
  });

  it('re-fences stale stopping operations before replaying provider stop', async () => {
    const stale = createClaimed('stopping', 'stop');
    mocks.findStaleSandboxOperations.mockResolvedValueOnce([stale]);
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(stale);

    await retryStaleStoppingSandboxes(new Date('2026-07-10T00:00:00.000Z'));

    expect(mocks.findStaleSandboxOperations).toHaveBeenCalledWith({
      statuses: ['stopping'],
      heartbeatBefore: new Date('2026-07-09T23:45:00.000Z')
    });
    expect(mocks.claimSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: stale,
        status: 'stopping',
        type: 'stop',
        matchLastActiveAt: false
      })
    );
    expect(mocks.buildSandboxResourceAdapter).toHaveBeenCalledTimes(1);
  });

  it('deletes provider, volume and archive before token-guarded record cleanup', async () => {
    await deleteSandboxResource(createResource());

    const adapter = mocks.buildSandboxResourceAdapter.mock.results[0].value;
    expect(adapter.delete).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSessionVolume).toHaveBeenCalledWith('sandbox-1');
    expect(mocks.deleteWorkspaceArchiveNow).toHaveBeenCalledWith({ sandboxId: 'sandbox-1' });
    expect(mocks.advanceSandboxOperation.mock.calls.map((call) => call[0].phase)).toEqual([
      'providerDeleted',
      'volumeDeleted',
      'archiveDeleted'
    ]);
    expect(mocks.deleteClaimedSandboxRecord).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'operation-1' })
    );
  });

  it('does not delete the record after an archive deletion failure', async () => {
    mocks.deleteWorkspaceArchiveNow.mockRejectedValueOnce(new Error('archive delete failed'));

    await expect(deleteSandboxResource(createResource())).rejects.toThrow('archive delete failed');

    expect(mocks.deleteClaimedSandboxRecord).not.toHaveBeenCalled();
    expect(mocks.markSandboxOperationFailed).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'deleting', error: 'archive delete failed' })
    );
  });

  it('finishes archiveDeleted delete phase without replaying remote side effects', async () => {
    const deleting = createClaimed('deleting', 'delete');
    deleting.metadata.operation.phase = 'archiveDeleted';
    const reclaimed = createClaimed('deleting', 'delete');
    reclaimed.metadata.operation.id = 'resumed-delete';
    reclaimed.metadata.operation.phase = 'archiveDeleted';
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(deleting);
    mocks.claimSandboxOperation.mockResolvedValueOnce(reclaimed);

    await deleteSandboxResource(deleting);

    expect(mocks.buildSandboxResourceAdapter).not.toHaveBeenCalled();
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
    expect(mocks.deleteWorkspaceArchiveNow).not.toHaveBeenCalled();
    expect(mocks.deleteClaimedSandboxRecord).toHaveBeenCalledWith({
      resource: reclaimed,
      operationId: 'resumed-delete'
    });
  });

  it('uses source queries for app and skill bulk deletion', async () => {
    const app = createResource();
    const skill = createResource({
      sandboxId: 'skill-sandbox',
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill-1',
      userId: ChatSourceTypeEnum.skillEdit
    });
    mocks.findSandboxResourcesBySource.mockResolvedValueOnce([app]);
    mocks.findSkillRelatedSandboxResources.mockResolvedValueOnce([skill]);

    await deleteAppSandboxes('app-1');
    await deleteSkillEditSandboxes(['skill-1']);

    expect(mocks.findSandboxResourcesBySource).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1'
    });
    expect(mocks.findSkillRelatedSandboxResources).toHaveBeenCalledWith(['skill-1']);
    expect(mocks.withSandboxLifecycleLease).toHaveBeenCalledTimes(2);
  });

  it('isolates failures while stopping a cron batch', async () => {
    mocks.buildSandboxResourceAdapter.mockReturnValueOnce({
      stop: vi.fn(async () => {
        throw new Error('stop failed');
      }),
      delete: vi.fn()
    });

    await stopSandboxResources([createResource()]);

    expect(mocks.logger.error).toHaveBeenCalledWith(
      'Failed to stop sandbox',
      expect.objectContaining({ sandboxId: 'sandbox-1' })
    );
  });
});
