import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { RedisLeaseUnavailableError } from '@fastgpt/dal/redis/caches';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedOpenSandboxItem } from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox';

const DEPLOYMENT_ID = '0123456789abcdef0123456789abcdef';

vi.mock('@fastgpt/service/common/system/config/instanceId', () => ({
  getInstanceId: async () => DEPLOYMENT_ID
}));

const mocks = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  createOpenSandboxResourceClient: vi.fn(),
  deleteSessionVolume: vi.fn(),
  unmountSessionVolume: vi.fn(),
  listSessionVolumes: vi.fn(),
  getSessionVolumeClaimName: vi.fn(),
  withSandboxLifecycleLease: vi.fn(),
  findSandboxInstanceBySandboxId: vi.fn(),
  findSandboxInstancesBySandboxIds: vi.fn(),
  findExistingSandboxVolumeClaimNames: vi.fn(),
  claimSandboxOperation: vi.fn(),
  advanceSandboxOperation: vi.fn(),
  completeSandboxOperation: vi.fn(),
  deleteClaimedSandboxRecord: vi.fn(),
  markSandboxOperationFailed: vi.fn(),
  findStaleSandboxOperations: vi.fn(),
  findSandboxResourcesBySource: vi.fn(),
  findSkillRelatedSandboxResources: vi.fn(),
  listManagedOpenSandboxes: vi.fn(),
  killManagedOpenSandboxById: vi.fn(),
  getOpenSandboxClientConfig: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  redisDelete: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxLifecycleLease: mocks.withSandboxLifecycleLease
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/config', () => ({
  getOpenSandboxClientConfig: mocks.getOpenSandboxClientConfig
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox', () => ({
  createOpenSandboxResourceClient: mocks.createOpenSandboxResourceClient,
  listManagedOpenSandboxes: mocks.listManagedOpenSandboxes,
  killManagedOpenSandboxById: mocks.killManagedOpenSandboxById
}));

vi.mock(
  '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@fastgpt/service/core/ai/sandbox/infrastructure/volume/service')
    >()),
    deleteSessionVolume: mocks.deleteSessionVolume,
    unmountSessionVolume: mocks.unmountSessionVolume,
    listSessionVolumes: mocks.listSessionVolumes,
    getSessionVolumeClaimName: mocks.getSessionVolumeClaimName
  })
);

vi.mock('@fastgpt/dal/redis/adapter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/dal/redis/adapter')>()),
  redisCacheAdapter: {
    get: mocks.redisGet,
    set: mocks.redisSet,
    delete: mocks.redisDelete
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  advanceSandboxOperation: mocks.advanceSandboxOperation,
  claimSandboxOperation: mocks.claimSandboxOperation,
  completeSandboxOperation: mocks.completeSandboxOperation,
  deleteClaimedSandboxRecord: mocks.deleteClaimedSandboxRecord,
  findExistingSandboxVolumeClaimNames: mocks.findExistingSandboxVolumeClaimNames,
  findInactiveRunningSandboxResources: vi.fn(),
  findStaleSandboxOperations: mocks.findStaleSandboxOperations,
  findSandboxInstanceBySandboxId: mocks.findSandboxInstanceBySandboxId,
  findSandboxInstancesBySandboxIds: mocks.findSandboxInstancesBySandboxIds,
  findSandboxResourcesBySource: mocks.findSandboxResourcesBySource,
  findSkillRelatedSandboxResources: mocks.findSkillRelatedSandboxResources,
  markSandboxOperationFailed: mocks.markSandboxOperationFailed
}));

import {
  deleteSandboxResourcesBySource,
  deleteSandboxResource,
  deleteSkillEditSandboxes,
  reconcileOrphanSandboxContainers,
  reconcileOrphanSandboxVolumes,
  retryStaleDeletingSandboxes,
  retryStaleStoppingSandboxes,
  stopSandboxResource,
  stopSandboxResources
} from '@fastgpt/service/core/ai/sandbox/application/resource';
import { serviceEnv } from '@fastgpt/service/env';

const createResource = (overrides: Record<string, unknown> = {}) =>
  ({
    provider: 'opensandbox',
    sandboxId: 'sandbox-1',
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'app-1',
    userId: 'user-1',
    status: 'running',
    instanceId: 'committed-container',
    lastActiveAt: new Date('2026-07-01T00:00:00.000Z'),
    storage: {
      volumes: [
        {
          name: 'workspace',
          claimName: 'fastgpt-session-sandbox-1-current',
          mountPath: '/workspace'
        }
      ]
    },
    ...overrides
  }) as any;

const createRemote = (overrides: Partial<ManagedOpenSandboxItem> = {}): ManagedOpenSandboxItem => ({
  id: 'committed-container',
  sessionId: 'sandbox-1',
  state: 'Running',
  createdAt: new Date('2026-07-01T00:30:00.000Z'),
  metadata: { app: 'fastgpt', deploymentId: DEPLOYMENT_ID },
  ...overrides
});

const createClaimed = (status: string, type: string) =>
  createResource({
    status,
    operation: {
      id: 'operation-1',
      type,
      phase: 'claimed',
      startedAt: new Date(),
      heartbeatAt: new Date()
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
    mocks.unmountSessionVolume.mockResolvedValue(undefined);
    mocks.getSessionVolumeClaimName.mockImplementation(
      (storage: any) =>
        storage?.volumes?.find((volume: any) => volume.name === 'workspace')?.claimName
    );
    mocks.findSandboxResourcesBySource.mockResolvedValue([]);
    mocks.findSkillRelatedSandboxResources.mockResolvedValue([]);
    mocks.findStaleSandboxOperations.mockResolvedValue([]);
    mocks.createOpenSandboxResourceClient.mockReturnValue({
      delete: vi.fn(async () => undefined)
    });
  });

  it('claims running -> stopping before the remote delete call and commits stopped', async () => {
    await stopSandboxResource(createResource());

    const client = mocks.createOpenSandboxResourceClient.mock.results[0].value;
    expect(mocks.claimSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'stopping', type: 'stop', matchLastActiveAt: true })
    );
    expect(mocks.claimSandboxOperation.mock.invocationCallOrder[0]).toBeLessThan(
      client.delete.mock.invocationCallOrder[0]
    );
    expect(mocks.advanceSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'operation-1', phase: 'providerStopped' })
    );
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: 'stopping', status: 'stopped' })
    );
  });

  it('immediately fences and deletes a failed provisioning operation once Lifecycle Lease is held', async () => {
    const failedProvisioning = createResource({
      status: 'provisioning',
      operation: {
        id: 'failed',
        type: 'provision',
        phase: 'claimed',
        heartbeatAt: new Date(),
        error: 'request timed out'
      }
    });
    const deleting = createClaimed('deleting', 'delete');
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(failedProvisioning);
    mocks.claimSandboxOperation.mockResolvedValueOnce(deleting);
    mocks.advanceSandboxOperation
      .mockResolvedValueOnce({
        ...deleting,
        operation: { ...deleting.operation, phase: 'providerDeleted' }
      })
      .mockResolvedValueOnce({
        ...deleting,
        operation: { ...deleting.operation, phase: 'volumeDeleted' }
      });

    await deleteSandboxResource(createResource());

    expect(mocks.claimSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: failedProvisioning,
        status: 'deleting',
        type: 'delete'
      })
    );
    expect(mocks.createOpenSandboxResourceClient).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSessionVolume).toHaveBeenCalledWith('fastgpt-session-sandbox-1-current');
    expect(mocks.deleteClaimedSandboxRecord).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'operation-1' })
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
    expect(mocks.createOpenSandboxResourceClient).not.toHaveBeenCalled();
  });

  it('keeps stopping with an operation error when container delete fails', async () => {
    mocks.createOpenSandboxResourceClient.mockReturnValueOnce({
      delete: vi.fn(async () => {
        throw new Error('provider stop failed');
      })
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
    stale.operation.heartbeatAt = new Date(0);
    mocks.findStaleSandboxOperations.mockResolvedValueOnce([stale]);
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(stale);

    await retryStaleStoppingSandboxes(new Date('2026-07-10T00:00:00.000Z'));

    expect(mocks.findStaleSandboxOperations).toHaveBeenCalledWith({
      statuses: ['stopping'],
      heartbeatBefore: new Date('2026-07-09T23:59:00.000Z')
    });
    expect(mocks.withSandboxLifecycleLease).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: 'sandbox-1', waitTimeoutMs: 0 })
    );
    expect(mocks.claimSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: stale,
        status: 'stopping',
        type: 'stop',
        matchLastActiveAt: false
      })
    );
    expect(mocks.createOpenSandboxResourceClient).toHaveBeenCalledTimes(1);
  });

  it('deletes provider and volume before token-guarded record cleanup', async () => {
    await deleteSandboxResource(createResource());

    const client = mocks.createOpenSandboxResourceClient.mock.results[0].value;
    expect(client.delete).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSessionVolume).toHaveBeenCalledWith('fastgpt-session-sandbox-1-current');
    expect(mocks.advanceSandboxOperation.mock.calls.map((call) => call[0].phase)).toEqual([
      'providerDeleted',
      'volumeDeleted'
    ]);
    expect(mocks.deleteClaimedSandboxRecord).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'operation-1' })
    );
  });

  it('does not delete the record after a volume deletion failure', async () => {
    mocks.deleteSessionVolume.mockRejectedValueOnce(new Error('volume delete failed'));

    await expect(deleteSandboxResource(createResource())).rejects.toThrow('volume delete failed');

    expect(mocks.deleteClaimedSandboxRecord).not.toHaveBeenCalled();
    expect(mocks.markSandboxOperationFailed).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'deleting', error: 'volume delete failed' })
    );
  });

  it('finishes volumeDeleted delete phase without replaying remote side effects', async () => {
    const deleting = createClaimed('deleting', 'delete');
    deleting.operation.phase = 'volumeDeleted';
    deleting.operation.heartbeatAt = new Date(0);
    const reclaimed = createClaimed('deleting', 'delete');
    reclaimed.operation.id = 'resumed-delete';
    reclaimed.operation.phase = 'volumeDeleted';
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(deleting);
    mocks.claimSandboxOperation.mockResolvedValueOnce(reclaimed);

    await deleteSandboxResource(deleting);

    expect(mocks.createOpenSandboxResourceClient).not.toHaveBeenCalled();
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
    expect(mocks.deleteClaimedSandboxRecord).toHaveBeenCalledWith({
      resource: reclaimed,
      operationId: 'resumed-delete'
    });
  });

  it.each([ChatSourceTypeEnum.app, ChatSourceTypeEnum.workflowBuilder])(
    'queries and deletes only the requested %s source',
    async (sourceType) => {
      mocks.findSandboxResourcesBySource.mockResolvedValueOnce([createResource({ sourceType })]);

      await deleteSandboxResourcesBySource({ sourceType, sourceId: 'app-1' });

      expect(mocks.findSandboxResourcesBySource).toHaveBeenCalledExactlyOnceWith({
        sourceType,
        sourceId: 'app-1'
      });
      expect(mocks.withSandboxLifecycleLease).toHaveBeenCalledTimes(1);
    }
  );

  it('does not acquire lifecycle leases when the source has no resources', async () => {
    await deleteSandboxResourcesBySource({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1'
    });

    expect(mocks.withSandboxLifecycleLease).not.toHaveBeenCalled();
  });

  it('uses the skill query for skill bulk deletion', async () => {
    const skill = createResource({
      sandboxId: 'skill-sandbox',
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'skill-1',
      userId: ChatSourceTypeEnum.skillEdit
    });
    mocks.findSkillRelatedSandboxResources.mockResolvedValueOnce([skill]);

    await deleteSkillEditSandboxes(['skill-1']);

    expect(mocks.findSandboxResourcesBySource).not.toHaveBeenCalled();
    expect(mocks.findSkillRelatedSandboxResources).toHaveBeenCalledWith(['skill-1']);
    expect(mocks.withSandboxLifecycleLease).toHaveBeenCalledTimes(1);
  });

  it('records every failed resource after bulk deletion settles', async () => {
    const resources = [
      createResource({ sandboxId: 'sandbox-a' }),
      createResource({ sandboxId: 'sandbox-b' }),
      createResource({ sandboxId: 'sandbox-c' })
    ];
    mocks.findSandboxResourcesBySource.mockResolvedValueOnce(resources);
    mocks.withSandboxLifecycleLease.mockImplementation(async ({ sandboxId, fn }: any) => {
      if (sandboxId === 'sandbox-a') throw new Error('delete a failed');
      if (sandboxId === 'sandbox-b') throw new Error('delete b failed');
      return fn({ signal: new AbortController().signal, assertValid });
    });

    await expect(
      deleteSandboxResourcesBySource({ sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' })
    ).rejects.toThrow('Failed to delete 2 sandbox resources');

    expect(mocks.withSandboxLifecycleLease).toHaveBeenCalledTimes(3);
    expect(mocks.logger.error).toHaveBeenCalledWith('Failed to delete sandbox resources', {
      failureCount: 2,
      failures: [
        { sandboxId: 'sandbox-a', error: 'delete a failed' },
        { sandboxId: 'sandbox-b', error: 'delete b failed' }
      ]
    });
  });

  it('isolates failures while stopping a cron batch and silently skips live leased sandboxes', async () => {
    mocks.withSandboxLifecycleLease.mockRejectedValueOnce(
      new RedisLeaseUnavailableError({ key: 'agent-sandbox:lifecycle:busy', label: 'stop' })
    );
    await stopSandboxResources([createResource({ sandboxId: 'busy' })]);
    expect(mocks.logger.error).not.toHaveBeenCalled();

    mocks.createOpenSandboxResourceClient.mockReturnValueOnce({
      delete: vi.fn(async () => {
        throw new Error('stop failed');
      })
    });

    await stopSandboxResources([createResource()]);

    expect(mocks.logger.error).toHaveBeenCalledWith(
      'Failed to stop sandbox',
      expect.objectContaining({ sandboxId: 'sandbox-1' })
    );
  });

  it('reconciles orphan containers older than 10 minutes while skipping young or active containers', async () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://opensandbox.local';
    mocks.getOpenSandboxClientConfig.mockReturnValue({
      baseUrl: 'http://opensandbox.local',
      apiKey: 'secret'
    });
    const now = new Date('2026-07-01T01:00:00.000Z');
    const oldTime = new Date('2026-07-01T00:30:00.000Z');
    const youngTime = new Date('2026-07-01T00:55:00.000Z');

    mocks.listManagedOpenSandboxes.mockResolvedValueOnce([
      createRemote({ id: 'young-orphan', sessionId: 'sbx-missing', createdAt: youngTime }),
      createRemote({ id: 'old-active', sessionId: 'sbx-active', createdAt: oldTime }),
      createRemote({ id: 'old-stopped', sessionId: 'sbx-stopped', createdAt: oldTime })
    ]);
    mocks.findSandboxInstancesBySandboxIds.mockResolvedValueOnce([
      createResource({ sandboxId: 'sbx-active', status: 'running', instanceId: 'old-active' }),
      createResource({ sandboxId: 'sbx-stopped', status: 'stopped' })
    ]);
    mocks.findSandboxInstanceBySandboxId.mockImplementation(async ({ sandboxId }: any) => {
      if (sandboxId === 'sbx-stopped') {
        return createResource({ sandboxId: 'sbx-stopped', status: 'stopped' });
      }
      return null;
    });
    mocks.killManagedOpenSandboxById.mockResolvedValue(undefined);

    await reconcileOrphanSandboxContainers(now);

    expect(mocks.listManagedOpenSandboxes).toHaveBeenCalledWith(expect.anything(), DEPLOYMENT_ID);
    expect(mocks.killManagedOpenSandboxById).toHaveBeenCalledTimes(1);
    expect(mocks.killManagedOpenSandboxById).toHaveBeenCalledWith(expect.anything(), {
      deploymentId: DEPLOYMENT_ID,
      sessionId: 'sbx-stopped',
      remoteSandboxId: 'old-stopped'
    });
  });

  it('preserves the committed running instance when a newer uncommitted duplicate exists', async () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://shared.local';
    mocks.getOpenSandboxClientConfig.mockReturnValue({
      baseUrl: 'http://shared.local',
      apiKey: 'secret'
    });
    mocks.listManagedOpenSandboxes.mockResolvedValueOnce([
      createRemote(),
      createRemote({
        id: 'newer-duplicate',
        createdAt: new Date('2026-07-01T00:40:00.000Z')
      })
    ]);
    mocks.findSandboxInstancesBySandboxIds.mockResolvedValueOnce([createResource()]);
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(createResource());

    await reconcileOrphanSandboxContainers(new Date('2026-07-01T01:00:00.000Z'));

    expect(mocks.killManagedOpenSandboxById).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      deploymentId: DEPLOYMENT_ID,
      sessionId: 'sandbox-1',
      remoteSandboxId: 'newer-duplicate'
    });
  });

  it('recovers stale deleting operations after the delete isolation window and isolates batch failures', async () => {
    const stale = createClaimed('deleting', 'delete');
    stale.operation.phase = 'providerDeleted';
    stale.operation.heartbeatAt = new Date(0);
    const failing = createClaimed('deleting', 'delete');
    failing.sandboxId = 'sandbox-fail';
    failing.operation.phase = 'providerDeleted';
    failing.operation.heartbeatAt = new Date(0);

    mocks.findStaleSandboxOperations.mockResolvedValueOnce([failing, stale]);
    mocks.findSandboxInstanceBySandboxId
      .mockResolvedValueOnce(failing)
      .mockResolvedValueOnce(stale);
    mocks.claimSandboxOperation.mockResolvedValueOnce(failing).mockResolvedValueOnce(stale);
    mocks.deleteSessionVolume
      .mockRejectedValueOnce(new Error('volume still failing'))
      .mockResolvedValueOnce(undefined);

    const now = new Date('2026-07-10T00:30:00.000Z');
    await retryStaleDeletingSandboxes(now);

    expect(mocks.findStaleSandboxOperations).toHaveBeenCalledWith({
      statuses: ['deleting'],
      heartbeatBefore: new Date('2026-07-10T00:29:00.000Z')
    });
    expect(mocks.withSandboxLifecycleLease).toHaveBeenCalledWith(
      expect.objectContaining({ waitTimeoutMs: 0 })
    );
    expect(mocks.createOpenSandboxResourceClient).not.toHaveBeenCalled();
    expect(mocks.deleteSessionVolume).toHaveBeenCalledTimes(2);
    expect(mocks.deleteClaimedSandboxRecord).toHaveBeenCalledTimes(1);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      'Failed to recover stale deleting sandbox',
      expect.objectContaining({ sandboxId: 'sandbox-fail', phase: 'providerDeleted' })
    );
  });

  it.each([
    createResource({ status: 'provisioning', operation: { id: 'operation' } }),
    createResource({ status: 'running', instanceId: 'candidate-container' })
  ])(
    'rechecks the authoritative record inside the lease before killing a duplicate',
    async (latest) => {
      serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://shared.local';
      mocks.getOpenSandboxClientConfig.mockReturnValue({
        baseUrl: 'http://shared.local',
        apiKey: 'secret'
      });
      mocks.listManagedOpenSandboxes.mockResolvedValueOnce([
        createRemote({
          id: 'candidate-container'
        })
      ]);
      mocks.findSandboxInstancesBySandboxIds.mockResolvedValueOnce([createResource()]);
      mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(latest);

      await reconcileOrphanSandboxContainers(new Date('2026-07-01T01:00:00.000Z'));

      expect(mocks.withSandboxLifecycleLease).toHaveBeenCalledTimes(1);
      expect(mocks.killManagedOpenSandboxById).not.toHaveBeenCalled();
    }
  );

  it('preserves duplicate candidates while the record is provisioning', async () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://shared.local';
    mocks.getOpenSandboxClientConfig.mockReturnValue({
      baseUrl: 'http://shared.local',
      apiKey: 'secret'
    });
    mocks.listManagedOpenSandboxes.mockResolvedValueOnce([createRemote()]);
    mocks.findSandboxInstancesBySandboxIds.mockResolvedValueOnce([
      createResource({
        status: 'provisioning',
        instanceId: 'old-instance',
        operation: { id: 'operation' }
      })
    ]);

    await reconcileOrphanSandboxContainers(new Date('2026-07-01T01:00:00.000Z'));

    expect(mocks.withSandboxLifecycleLease).not.toHaveBeenCalled();
    expect(mocks.killManagedOpenSandboxById).not.toHaveBeenCalled();
  });

  it('uses two-phase mark-and-sweep (30 min grace) for orphan volumes', async () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://opensandbox.local';
    const t0 = new Date('2026-07-01T01:00:00.000Z');
    const t1 = new Date('2026-07-01T01:35:00.000Z');

    mocks.listSessionVolumes.mockResolvedValue(['vol-active', 'vol-orphan']);
    mocks.redisSet.mockResolvedValue(undefined);
    mocks.redisDelete.mockResolvedValue(true);
    mocks.findExistingSandboxVolumeClaimNames.mockImplementation(async (names: string[]) => {
      return new Set(names.filter((n) => n === 'vol-active'));
    });

    // Phase 1: first seen -> mark in Redis, do not delete
    mocks.redisGet.mockResolvedValueOnce(null);
    await reconcileOrphanSandboxVolumes(t0);
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
    expect(mocks.redisSet).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'sandbox:gc:orphan-volume:vol-orphan',
        value: JSON.stringify({ firstSeenAt: t0.getTime() })
      })
    );

    // Phase 2: 35 minutes later -> still absent in Mongo & marker unchanged -> delete volume and clear marker
    mocks.redisGet.mockResolvedValue(JSON.stringify({ firstSeenAt: t0.getTime() }));
    await reconcileOrphanSandboxVolumes(t1);
    expect(mocks.deleteSessionVolume).toHaveBeenCalledExactlyOnceWith('vol-orphan');
    expect(mocks.redisDelete).toHaveBeenCalledWith('sandbox:gc:orphan-volume:vol-orphan');
  });

  it('skips orphan volume deletion if marker is concurrently cleared or reset during Mongo recheck', async () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://opensandbox.local';
    const t0 = new Date('2026-07-01T01:00:00.000Z');
    const t1 = new Date('2026-07-01T01:35:00.000Z');
    const redisStore = new Map<string, string>([
      ['sandbox:gc:orphan-volume:vol-race', JSON.stringify({ firstSeenAt: t0.getTime() })]
    ]);

    mocks.listSessionVolumes.mockResolvedValue(['vol-race']);
    mocks.redisGet.mockImplementation(async (key: string) => redisStore.get(key) ?? null);
    mocks.findExistingSandboxVolumeClaimNames.mockImplementation(async (names: string[]) => {
      if (names.length === 1 && names[0] === 'vol-race') {
        // Simulate concurrent ensureSessionVolume clearing the marker while Mongo doc is not yet inserted
        redisStore.delete('sandbox:gc:orphan-volume:vol-race');
      }
      return new Set();
    });

    await reconcileOrphanSandboxVolumes(t1);
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
  });

  it('does not sweep a retried deterministic migration volume after its orphan marker is reset', async () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://opensandbox.local';
    const t0 = new Date('2026-07-01T01:00:00.000Z');
    const tRetry = new Date('2026-07-01T01:31:00.000Z');
    const tSweep = new Date('2026-07-01T01:35:00.000Z');
    const redisStore = new Map<string, string>();

    mocks.listSessionVolumes.mockResolvedValue(['fastgpt-session-mig-det-1']);
    mocks.findExistingSandboxVolumeClaimNames.mockResolvedValue(new Set());
    mocks.redisGet.mockImplementation(async (key: string) => redisStore.get(key) ?? null);
    mocks.redisSet.mockImplementation(async ({ key, value }: { key: string; value: string }) => {
      redisStore.set(key, value);
    });
    mocks.redisDelete.mockImplementation(async (key: string) => redisStore.delete(key));

    // T=0: failed migration rollback left empty volume -> cron marks firstSeenAt
    await reconcileOrphanSandboxVolumes(t0);
    expect(redisStore.has('sandbox:gc:orphan-volume:fastgpt-session-mig-det-1')).toBe(true);
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();

    // T=31m: admin retries migration; ensureSessionVolume clears the stale orphan marker
    expect(tRetry.getTime() - t0.getTime()).toBeGreaterThan(30 * 60 * 1000);
    redisStore.delete('sandbox:gc:orphan-volume:fastgpt-session-mig-det-1');

    // T=35m: while large workspace files are still copying into the volume (Mongo doc not written yet),
    // cron treats it as newly observed and starts a fresh 30-min grace window instead of deleting it!
    await reconcileOrphanSandboxVolumes(tSweep);
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
    expect(redisStore.get('sandbox:gc:orphan-volume:fastgpt-session-mig-det-1')).toBe(
      JSON.stringify({ firstSeenAt: tSweep.getTime() })
    );
  });
});
