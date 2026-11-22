import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  redis: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
  createOpenSandboxResourceClient: vi.fn(),
  disconnectSandbox: vi.fn(),
  killManagedOpenSandboxById: vi.fn(),
  listManagedOpenSandboxes: vi.fn(),
  getOpenSandboxClientConfig: vi.fn(),
  isAgentSandboxOpenSandboxConfigured: vi.fn(),
  deleteSessionVolume: vi.fn(),
  getSessionVolumeClaimName: vi.fn(),
  getOrphanVolumeMarkerKey: vi.fn(),
  listSessionVolumes: vi.fn(),
  getVolumeManagerEnvConfig: vi.fn(),
  deleteSandboxArchives: vi.fn(),
  withSandboxLease: vi.fn(),
  findSandboxInstanceBySandboxId: vi.fn(),
  findExistingSandboxVolumeClaimNames: vi.fn(),
  findSandboxInstancesBySandboxIds: vi.fn(),
  claimSandboxOperation: vi.fn(),
  advanceSandboxOperation: vi.fn(),
  completeSandboxOperation: vi.fn(),
  deleteClaimedSandboxRecord: vi.fn(),
  markSandboxOperationFailed: vi.fn(),
  touchSandboxOperationHeartbeat: vi.fn(),
  findStaleSandboxOperations: vi.fn(),
  findSandboxResourcesBySource: vi.fn(),
  findSkillRelatedSandboxResources: vi.fn()
}));

vi.mock('@fastgpt/dal/redis/adapter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/dal/redis/adapter')>()),
  redisCacheAdapter: mocks.redis
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/config')>()),
  isAgentSandboxOpenSandboxConfigured: mocks.isAgentSandboxOpenSandboxConfigured
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxLease: mocks.withSandboxLease
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/config', () => ({
  getOpenSandboxClientConfig: mocks.getOpenSandboxClientConfig
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox', () => ({
  createOpenSandboxResourceClient: mocks.createOpenSandboxResourceClient,
  disconnectSandbox: mocks.disconnectSandbox,
  killManagedOpenSandboxById: mocks.killManagedOpenSandboxById,
  listManagedOpenSandboxes: mocks.listManagedOpenSandboxes
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/volume/config', () => ({
  getVolumeManagerEnvConfig: mocks.getVolumeManagerEnvConfig
}));

vi.mock(
  '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@fastgpt/service/core/ai/sandbox/infrastructure/volume/service')
      >();
    return {
      ...actual,
      deleteSessionVolume: mocks.deleteSessionVolume,
      getOrphanVolumeMarkerKey: mocks.getOrphanVolumeMarkerKey,
      getSessionVolumeClaimName: mocks.getSessionVolumeClaimName,
      listSessionVolumes: mocks.listSessionVolumes
    };
  }
);

vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({
  buildSandboxArchiveObjectKey: (sandboxId: string, generation: string) =>
    `sandbox/${sandboxId}/${generation}.tar.zst`,
  getS3SandboxSource: () => ({ deleteSandboxArchives: mocks.deleteSandboxArchives })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  advanceSandboxOperation: mocks.advanceSandboxOperation,
  claimSandboxOperation: mocks.claimSandboxOperation,
  completeSandboxOperation: mocks.completeSandboxOperation,
  deleteClaimedSandboxRecord: mocks.deleteClaimedSandboxRecord,
  findExistingSandboxVolumeClaimNames: mocks.findExistingSandboxVolumeClaimNames,
  findStaleSandboxOperations: mocks.findStaleSandboxOperations,
  findSandboxInstanceBySandboxId: mocks.findSandboxInstanceBySandboxId,
  findSandboxInstancesBySandboxIds: mocks.findSandboxInstancesBySandboxIds,
  findSandboxResourcesBySource: mocks.findSandboxResourcesBySource,
  findSkillRelatedSandboxResources: mocks.findSkillRelatedSandboxResources,
  markSandboxOperationFailed: mocks.markSandboxOperationFailed,
  touchSandboxOperationHeartbeat: mocks.touchSandboxOperationHeartbeat
}));

import {
  deleteSandboxResourcesBySource,
  deleteSandboxResource,
  deleteSandboxResourceWithinLease,
  deleteSkillEditSandboxes,
  reconcileOrphanSandboxResources,
  reconcileOrphanSandboxVolumes,
  retryStaleStoppingSandboxes,
  stopSandboxResource,
  stopSandboxResources
} from '@fastgpt/service/core/ai/sandbox/application/resource';

const createResource = (overrides: Record<string, unknown> = {}) =>
  ({
    provider: 'opensandbox',
    sandboxId: 'sandbox-1',
    instanceId: 'remote-1',
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'app-1',
    userId: 'user-1',
    status: 'running',
    lastActiveAt: new Date('2026-07-01T00:00:00.000Z'),
    storage: {
      volumes: [
        {
          name: 'workspace',
          claimName: 'fastgpt-session-sandbox-1-current',
          mountPath: '/workspace'
        }
      ],
      mountPath: '/workspace',
      archive: {
        objectKey: 'sandbox/sandbox-1/gen1.tar.zst',
        generation: 'gen1',
        format: 'tar.zst',
        sizeBytes: 64,
        archivedAt: new Date('2026-07-01T00:00:00.000Z')
      }
    },
    ...overrides
  }) as any;

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
    mocks.isAgentSandboxOpenSandboxConfigured.mockReturnValue(true);
    mocks.getVolumeManagerEnvConfig.mockReturnValue({ volumeNamePrefix: 'fastgpt-session' });
    mocks.getOpenSandboxClientConfig.mockReturnValue({});
    mocks.listManagedOpenSandboxes.mockResolvedValue([]);
    mocks.findExistingSandboxVolumeClaimNames.mockResolvedValue(new Set());
    mocks.getOrphanVolumeMarkerKey.mockImplementation((claimName: string) => `orphan:${claimName}`);
    mocks.redis.get.mockResolvedValue(null);
    mocks.redis.set.mockResolvedValue(undefined);
    mocks.redis.delete.mockResolvedValue(undefined);
    mocks.withSandboxLease.mockImplementation(async ({ fn }: any) =>
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
    mocks.getSessionVolumeClaimName.mockImplementation(
      (storage: any) =>
        storage?.volumes?.find((volume: any) => volume.name === 'workspace')?.claimName
    );
    mocks.deleteSandboxArchives.mockResolvedValue(undefined);
    mocks.findSandboxResourcesBySource.mockResolvedValue([]);
    mocks.findSkillRelatedSandboxResources.mockResolvedValue([]);
    mocks.findStaleSandboxOperations.mockResolvedValue([]);
    mocks.disconnectSandbox.mockResolvedValue(undefined);
    mocks.findSandboxInstancesBySandboxIds.mockResolvedValue([]);
    mocks.createOpenSandboxResourceClient.mockImplementation(() => ({
      stop: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined)
    }));
  });

  it('claims running -> stopping before the opensandbox call and commits stopped', async () => {
    await stopSandboxResource(createResource());

    const client = await mocks.createOpenSandboxResourceClient.mock.results[0].value;
    expect(mocks.claimSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'stopping', type: 'stop', matchLastActiveAt: true })
    );
    expect(mocks.claimSandboxOperation.mock.invocationCallOrder[0]).toBeLessThan(
      client.stop.mock.invocationCallOrder[0]
    );
    expect(mocks.advanceSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'operation-1', phase: 'providerStopped' })
    );
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: 'stopping', status: 'stopped', unset: ['instanceId'] })
    );
  });

  it.each(['provisioning', 'restoring'])(
    'does not delete a recent failed %s operation whose remote call may still be active',
    async (status) => {
      mocks.findSandboxInstanceBySandboxId.mockResolvedValue(
        createResource({
          status,
          operation: {
            id: 'failed',
            type: status === 'provisioning' ? 'provision' : 'restore',
            phase: 'claimed',
            heartbeatAt: new Date(),
            error: 'request timed out'
          }
        })
      );
      await expect(deleteSandboxResource(createResource())).rejects.toThrow('isolation window');
      expect(mocks.createOpenSandboxResourceClient).not.toHaveBeenCalled();
      expect(mocks.claimSandboxOperation).not.toHaveBeenCalled();
    }
  );

  it('uses the cron candidate timestamp so a concurrent touch skips or loses the stop CAS', async () => {
    const candidate = createResource({
      lastActiveAt: new Date('2026-07-01T00:00:00.000Z')
    });
    // Short-circuit before Mongo CAS when freshly-read lastActiveAt already differs.
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(
      createResource({ lastActiveAt: new Date('2026-07-01T00:01:00.000Z') })
    );

    await stopSandboxResource(candidate);

    expect(mocks.claimSandboxOperation).not.toHaveBeenCalled();
    expect(mocks.createOpenSandboxResourceClient).not.toHaveBeenCalled();

    // If a touch occurs between read and claim CAS, matchLastActiveAt rejects the stale CAS cleanly.
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(createResource());
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

  it('keeps stopping with an operation error when provider stop fails', async () => {
    mocks.createOpenSandboxResourceClient.mockReturnValueOnce({
      stop: vi.fn(async () => {
        throw new Error('provider stop failed');
      }),
      delete: vi.fn(),
      close: vi.fn()
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
      now: new Date('2026-07-10T00:00:00.000Z'),
      heartbeatBefore: new Date('2026-07-09T23:59:00.000Z')
    });
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

  it('deletes container, volume and archives before token-guarded record cleanup', async () => {
    await deleteSandboxResource(createResource());

    const client = await mocks.createOpenSandboxResourceClient.mock.results[0].value;
    expect(client.delete).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSessionVolume).toHaveBeenCalledWith('fastgpt-session-sandbox-1-current', {
      allowLegacyUnlabeled: true
    });
    expect(mocks.deleteSandboxArchives).toHaveBeenCalledWith({
      sandboxId: 'sandbox-1',
      currentObjectKey: 'sandbox/sandbox-1/gen1.tar.zst'
    });
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
    mocks.deleteSandboxArchives.mockRejectedValueOnce(new Error('archive delete failed'));

    await expect(deleteSandboxResource(createResource())).rejects.toThrow('archive delete failed');

    expect(mocks.deleteClaimedSandboxRecord).not.toHaveBeenCalled();
    expect(mocks.markSandboxOperationFailed).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'deleting', error: 'archive delete failed' })
    );
  });

  it('finishes archiveDeleted delete phase without replaying remote side effects', async () => {
    const deleting = createClaimed('deleting', 'delete');
    deleting.operation.phase = 'archiveDeleted';
    deleting.operation.heartbeatAt = new Date(0);
    const reclaimed = createClaimed('deleting', 'delete');
    reclaimed.operation.id = 'resumed-delete';
    reclaimed.operation.phase = 'archiveDeleted';
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(deleting);
    mocks.claimSandboxOperation.mockResolvedValueOnce(reclaimed);

    await deleteSandboxResource(deleting);

    expect(mocks.createOpenSandboxResourceClient).not.toHaveBeenCalled();
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
    expect(mocks.deleteSandboxArchives).not.toHaveBeenCalled();
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
      expect(mocks.withSandboxLease).toHaveBeenCalledTimes(1);
    }
  );

  it('does not acquire leases when the source has no resources', async () => {
    await deleteSandboxResourcesBySource({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1'
    });

    expect(mocks.withSandboxLease).not.toHaveBeenCalled();
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
    expect(mocks.withSandboxLease).toHaveBeenCalledTimes(1);
  });

  it('records every failed resource after bulk deletion settles', async () => {
    const resources = [
      createResource({ sandboxId: 'sandbox-a' }),
      createResource({ sandboxId: 'sandbox-b' }),
      createResource({ sandboxId: 'sandbox-c' })
    ];
    mocks.findSandboxResourcesBySource.mockResolvedValueOnce(resources);
    mocks.withSandboxLease.mockImplementation(async ({ sandboxId, fn }: any) => {
      if (sandboxId === 'sandbox-a') throw new Error('delete a failed');
      if (sandboxId === 'sandbox-b') throw new Error('delete b failed');
      return fn({ signal: new AbortController().signal, assertValid });
    });

    await expect(
      deleteSandboxResourcesBySource({ sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' })
    ).rejects.toThrow('Failed to delete 2 sandbox resources');

    expect(mocks.withSandboxLease).toHaveBeenCalledTimes(3);
    expect(mocks.logger.error).toHaveBeenCalledWith('Failed to delete sandbox resources', {
      failureCount: 2,
      failures: [
        { sandboxId: 'sandbox-a', error: 'delete a failed' },
        { sandboxId: 'sandbox-b', error: 'delete b failed' }
      ]
    });
  });

  it('isolates failures while stopping a cron batch', async () => {
    mocks.createOpenSandboxResourceClient.mockReturnValueOnce({
      stop: vi.fn(async () => {
        throw new Error('stop failed');
      }),
      delete: vi.fn(),
      close: vi.fn()
    });

    await stopSandboxResources([createResource()]);

    expect(mocks.logger.error).toHaveBeenCalledWith(
      'Failed to stop sandbox',
      expect.objectContaining({ sandboxId: 'sandbox-1' })
    );
  });

  it('reconciles managed generation orphan PVCs while skipping no-generation or foreign-prefix PVCs without false warnings on referenced claims', async () => {
    const now = new Date('2026-07-10T01:00:00.000Z');
    const firstSeenExpired = String(now.getTime() - 31 * 60_000);
    const rawVolumes = [
      'fastgpt-session-legacy-referenced',
      'fastgpt-session-legacy-no-generation',
      'other-prefix-sandbox-1-0',
      'fastgpt-session-sandbox-1-0'
    ];
    mocks.listSessionVolumes.mockResolvedValueOnce(rawVolumes);
    mocks.findExistingSandboxVolumeClaimNames.mockImplementation(async (claims: string[]) =>
      claims.includes('fastgpt-session-legacy-referenced')
        ? new Set(['fastgpt-session-legacy-referenced'])
        : new Set()
    );
    mocks.redis.get.mockImplementation(async (key: string) =>
      key === 'orphan:fastgpt-session-sandbox-1-0' ? firstSeenExpired : null
    );

    await reconcileOrphanSandboxVolumes({ now });

    expect(mocks.findExistingSandboxVolumeClaimNames).toHaveBeenCalledWith(rawVolumes);
    expect(mocks.logger.warn).toHaveBeenCalledTimes(2);
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      'Skipping unmanaged PVC during orphan volume reconciliation',
      { claimName: 'fastgpt-session-legacy-no-generation', volumeNamePrefix: 'fastgpt-session' }
    );
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      'Skipping unmanaged PVC during orphan volume reconciliation',
      { claimName: 'other-prefix-sandbox-1-0', volumeNamePrefix: 'fastgpt-session' }
    );
    expect(mocks.redis.delete).toHaveBeenCalledWith('orphan:fastgpt-session-legacy-referenced');
    expect(mocks.deleteSessionVolume).toHaveBeenCalledWith('fastgpt-session-sandbox-1-0');
    expect(mocks.deleteSessionVolume).toHaveBeenCalledTimes(1);
  });

  it('tombstones opensandbox record to archived when legacyDevboxPendingCleanup is true by default', async () => {
    const resource = createResource({
      storage: {
        volumes: [{ name: 'workspace', claimName: 'fastgpt-session-sandbox-1-current' }],
        mountPath: '/workspace',
        archive: {
          objectKey: 'sandbox/sandbox-1/gen1.tar.zst',
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 64,
          archivedAt: new Date('2026-07-01T00:00:00Z')
        },
        legacyDevboxPendingCleanup: true
      }
    });
    const claimed = {
      ...resource,
      status: 'deleting',
      operation: { id: 'op-tombstone', type: 'delete', phase: 'claimed' }
    };
    mocks.claimSandboxOperation.mockResolvedValueOnce(claimed);

    await deleteSandboxResourceWithinLease({
      current: resource,
      lease: { signal: new AbortController().signal, assertValid: vi.fn() } as any
    });

    expect(mocks.deleteClaimedSandboxRecord).not.toHaveBeenCalled();
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: 'deleting',
        status: 'archived',
        unset: ['instanceId'],
        set: {
          storage: {
            archive: expect.objectContaining({
              objectKey: 'sandbox/sandbox-1/deleted.tar.zst',
              generation: 'deleted',
              format: 'tar.zst',
              sizeBytes: 0
            }),
            legacyDevboxPendingCleanup: true
          }
        }
      })
    );
  });

  it('physically deletes opensandbox record with legacyDevboxPendingCleanup when allowDeleteLegacyDevboxPointer is true', async () => {
    const resource = createResource({
      storage: {
        legacyDevboxPendingCleanup: true
      }
    });

    await deleteSandboxResourceWithinLease({
      current: resource,
      lease: { signal: new AbortController().signal, assertValid: vi.fn() } as any,
      allowDeleteLegacyDevboxPointer: true
    });

    expect(mocks.completeSandboxOperation).not.toHaveBeenCalled();
    expect(mocks.deleteClaimedSandboxRecord).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'operation-1' })
    );
  });

  it('reconciles young late containers with superseded operationId immediately while preserving current operation and running instance containers', async () => {
    const now = new Date('2026-07-10T01:00:00.000Z');
    const createdRecently = new Date(now.getTime() - 30_000);

    const lateDoc = createResource({
      sandboxId: 'sb-late',
      instanceId: undefined,
      status: 'provisioning',
      operation: {
        id: 'op-new',
        type: 'provision',
        phase: 'claimed',
        startedAt: createdRecently,
        heartbeatAt: createdRecently
      }
    });
    const activeProvisionDoc = createResource({
      sandboxId: 'sb-active',
      instanceId: undefined,
      status: 'provisioning',
      operation: {
        id: 'op-cur',
        type: 'provision',
        phase: 'claimed',
        startedAt: createdRecently,
        heartbeatAt: createdRecently
      }
    });
    const activeRunningDoc = createResource({
      sandboxId: 'sb-run',
      instanceId: 'c-run',
      status: 'running',
      operation: undefined
    });

    mocks.listManagedOpenSandboxes.mockResolvedValueOnce([
      {
        id: 'c-late',
        sessionId: 'sb-late',
        state: 'Running',
        createdAt: createdRecently,
        metadata: { app: 'fastgpt', sessionId: 'sb-late', operationId: 'op-old' }
      },
      {
        id: 'c-active',
        sessionId: 'sb-active',
        state: 'Running',
        createdAt: createdRecently,
        metadata: { app: 'fastgpt', sessionId: 'sb-active', operationId: 'op-cur' }
      },
      {
        id: 'c-run',
        sessionId: 'sb-run',
        state: 'Running',
        createdAt: createdRecently,
        metadata: { app: 'fastgpt', sessionId: 'sb-run', operationId: 'op-run' }
      }
    ]);
    mocks.findSandboxInstancesBySandboxIds.mockResolvedValueOnce([
      lateDoc,
      activeProvisionDoc,
      activeRunningDoc
    ]);
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(lateDoc);

    await reconcileOrphanSandboxResources(now);

    expect(mocks.killManagedOpenSandboxById).toHaveBeenCalledTimes(1);
    expect(mocks.killManagedOpenSandboxById).toHaveBeenCalledWith(
      { sessionId: 'sb-late', remoteSandboxId: 'c-late' },
      {}
    );
  });

  it('restricts orphan container and volume reconciliation to the provided scope without touching unrelated sessions', async () => {
    const now = new Date('2026-07-10T01:00:00.000Z');
    const createdPastGrace = new Date(now.getTime() - 20 * 60_000);
    const firstSeenExpired = String(now.getTime() - 35 * 60_000);

    mocks.listManagedOpenSandboxes.mockResolvedValueOnce([
      {
        id: 'c-scoped',
        sessionId: 'app-scoped',
        state: 'Running',
        createdAt: createdPastGrace,
        metadata: { app: 'fastgpt', sessionId: 'app-scoped' }
      },
      {
        id: 'c-other',
        sessionId: 'app-other',
        state: 'Running',
        createdAt: createdPastGrace,
        metadata: { app: 'fastgpt', sessionId: 'app-other' }
      },
      {
        id: 'c-unlabeled',
        state: 'Running',
        createdAt: createdPastGrace,
        metadata: { app: 'fastgpt' }
      }
    ]);
    mocks.findSandboxInstancesBySandboxIds.mockResolvedValueOnce([]);
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(null);

    // 仅传 sessionIds 时只清理目标会话，且不得扫描/修改未指定 claimNames 的持久卷
    await reconcileOrphanSandboxResources(now, {
      sessionIds: new Set(['app-scoped'])
    });

    expect(mocks.listSessionVolumes).not.toHaveBeenCalled();
    expect(mocks.findSandboxInstancesBySandboxIds).toHaveBeenCalledWith(['app-scoped']);
    expect(mocks.killManagedOpenSandboxById).toHaveBeenCalledTimes(1);
    expect(mocks.killManagedOpenSandboxById).toHaveBeenCalledWith(
      { sessionId: 'app-scoped', remoteSandboxId: 'c-scoped' },
      {}
    );

    vi.clearAllMocks();
    mocks.isAgentSandboxOpenSandboxConfigured.mockReturnValue(true);
    mocks.getOpenSandboxClientConfig.mockReturnValue({});
    mocks.getVolumeManagerEnvConfig.mockReturnValue({ volumeNamePrefix: 'fastgpt-session' });
    mocks.withSandboxLease.mockImplementation(
      async ({ fn }: { fn: (lease: any) => Promise<void> }) =>
        fn({ signal: new AbortController().signal, assertValid: vi.fn() })
    );
    mocks.findExistingSandboxVolumeClaimNames.mockResolvedValue(new Set());
    mocks.listSessionVolumes.mockResolvedValueOnce([
      'fastgpt-session-scoped-0',
      'fastgpt-session-unrelated-0'
    ]);
    mocks.listManagedOpenSandboxes.mockResolvedValueOnce([]);
    mocks.redis.get.mockResolvedValue(firstSeenExpired);

    await reconcileOrphanSandboxVolumes({
      now,
      scope: {
        claimNames: new Set(['fastgpt-session-scoped-0'])
      }
    });

    expect(mocks.findExistingSandboxVolumeClaimNames).toHaveBeenCalledWith([
      'fastgpt-session-scoped-0'
    ]);
    expect(mocks.deleteSessionVolume).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSessionVolume).toHaveBeenCalledWith('fastgpt-session-scoped-0');
  });

  it('deletes purely archived opensandbox resource without requiring OpenSandbox control plane config', async () => {
    mocks.isAgentSandboxOpenSandboxConfigured.mockReturnValue(false);
    const archivedResource = createResource({
      status: 'archived',
      instanceId: undefined,
      storage: {
        archive: {
          objectKey: 'sandbox/sandbox-1/gen1.tar.zst',
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 32,
          archivedAt: new Date('2026-07-01T00:00:00Z')
        }
      }
    });
    const claimedArchived = {
      ...archivedResource,
      status: 'deleting',
      operation: {
        id: 'operation-archived-del',
        type: 'delete',
        phase: 'claimed',
        previousStatus: 'archived'
      }
    };
    mocks.claimSandboxOperation.mockResolvedValueOnce(claimedArchived);
    mocks.advanceSandboxOperation.mockImplementation(async ({ phase }: { phase: string }) => ({
      ...claimedArchived,
      operation: { ...claimedArchived.operation, phase }
    }));

    await deleteSandboxResourceWithinLease({
      current: archivedResource,
      lease: { signal: new AbortController().signal, assertValid: vi.fn() } as any
    });

    expect(mocks.createOpenSandboxResourceClient).not.toHaveBeenCalled();
    expect(mocks.deleteSandboxArchives).toHaveBeenCalledWith({
      sandboxId: 'sandbox-1',
      currentObjectKey: 'sandbox/sandbox-1/gen1.tar.zst'
    });
    expect(mocks.deleteClaimedSandboxRecord).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'operation-archived-del' })
    );
  });

  it('shares a single listManagedOpenSandboxes call across container/volume reconciliation and skips listing when all volumes are referenced', async () => {
    const now = new Date('2026-07-10T01:00:00.000Z');
    mocks.isAgentSandboxOpenSandboxConfigured.mockReturnValue(true);
    mocks.getOpenSandboxClientConfig.mockReturnValue({});
    mocks.getVolumeManagerEnvConfig.mockReturnValue({ volumeNamePrefix: 'fastgpt-session' });
    mocks.listManagedOpenSandboxes.mockResolvedValue([]);
    mocks.listSessionVolumes.mockResolvedValue(['fastgpt-session-orphan-0']);
    mocks.findExistingSandboxVolumeClaimNames.mockResolvedValue(new Set());

    await reconcileOrphanSandboxResources(now);
    expect(mocks.listManagedOpenSandboxes).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mocks.isAgentSandboxOpenSandboxConfigured.mockReturnValue(true);
    mocks.getOpenSandboxClientConfig.mockReturnValue({});
    mocks.getVolumeManagerEnvConfig.mockReturnValue({ volumeNamePrefix: 'fastgpt-session' });
    mocks.listSessionVolumes.mockResolvedValue(['fastgpt-session-active-0']);
    mocks.findExistingSandboxVolumeClaimNames.mockResolvedValue(
      new Set(['fastgpt-session-active-0'])
    );

    await reconcileOrphanSandboxVolumes({ now });
    expect(mocks.listManagedOpenSandboxes).not.toHaveBeenCalled();
    expect(mocks.redis.delete).toHaveBeenCalledTimes(1);
  });

  it('does not suppress old-generation orphan PVC when Mongo holds a different active claimName for the running session', async () => {
    const now = new Date('2026-07-10T01:00:00.000Z');
    const firstSeenExpired = String(now.getTime() - 31 * 60_000);
    const oldClaim = 'fastgpt-session-sb-gen-0';
    const newClaim = 'fastgpt-session-sb-gen-11223344';

    mocks.listSessionVolumes.mockResolvedValueOnce([oldClaim, newClaim]);
    mocks.findExistingSandboxVolumeClaimNames.mockImplementation(async (claims: string[]) =>
      claims.includes(newClaim) ? new Set([newClaim]) : new Set()
    );
    mocks.findSandboxInstancesBySandboxIds.mockResolvedValueOnce([
      createResource({
        sandboxId: 'sb-gen',
        status: 'running',
        storage: {
          volumes: [{ name: 'workspace', claimName: newClaim }]
        }
      })
    ]);
    mocks.listManagedOpenSandboxes.mockResolvedValueOnce([
      {
        id: 'remote-gen-2',
        sessionId: 'sb-gen',
        createdAt: new Date('2026-07-10T00:50:00.000Z')
      }
    ]);
    mocks.redis.get.mockResolvedValueOnce(firstSeenExpired);

    await reconcileOrphanSandboxVolumes({ now });

    expect(mocks.deleteSessionVolume).toHaveBeenCalledExactlyOnceWith(oldClaim);
  });
});
