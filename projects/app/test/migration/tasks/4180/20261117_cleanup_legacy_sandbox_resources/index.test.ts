import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  createMigrationContext as createSharedMigrationContext,
  getMockS3SandboxSource,
  seedMigrationApp as seedApp,
  seedMigrationSandboxRow as seedSandboxRow
} from '../sandbox_opensandbox_shared/helpers';

const s3State = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  throwOnAccess: false,
  deleteArchiveObjectSpy: vi.fn(),
  deleteSandboxArchivesSpy: vi.fn()
}));

const resourceMockState = vi.hoisted(() => ({
  deletedSandboxIds: [] as string[],
  deleteCalls: [] as Array<{ sandboxId: string; allowDeleteLegacyDevboxPointer?: boolean }>
}));

const leaseMockState = vi.hoisted(() => ({
  sandboxIds: [] as string[]
}));

vi.mock('@fastgpt/service/common/s3/sources/sandbox', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/common/s3/sources/sandbox')>();
  return {
    ...actual,
    getS3SandboxSource: () => getMockS3SandboxSource(s3State)
  };
});

vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/application/lease')>();
  return {
    ...actual,
    withSandboxLease: vi.fn(async (params) => {
      leaseMockState.sandboxIds.push(params.sandboxId);
      return await actual.withSandboxLease(params);
    })
  };
});

vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/application/resource')>();
  return {
    ...actual,
    deleteSandboxResourceWithinLease: vi.fn(
      async ({ current, lease, allowDeleteLegacyDevboxPointer }) => {
        await lease.assertValid();
        resourceMockState.deletedSandboxIds.push(current.sandboxId);
        resourceMockState.deleteCalls.push({
          sandboxId: current.sandboxId,
          allowDeleteLegacyDevboxPointer
        });
        await getMockS3SandboxSource(s3State).deleteSandboxArchives({
          sandboxId: current.sandboxId,
          currentObjectKey: current.storage?.archive?.objectKey
        });
        await MongoSandboxInstance.collection.deleteOne({ _id: current._id as any });
      }
    )
  };
});

import { cleanupLegacySandboxResources } from '@/migration/tasks/4180/20261117_cleanup_legacy_sandbox_resources';

const createMigrationContext = () =>
  createSharedMigrationContext('20261117_cleanup_legacy_sandbox_resources');

describe('cleanupLegacySandboxResources', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    s3State.objects.clear();
    s3State.deleteArchiveObjectSpy.mockReset();
    s3State.deleteSandboxArchivesSpy.mockReset();
    resourceMockState.deletedSandboxIds = [];
    resourceMockState.deleteCalls = [];
    leaseMockState.sandboxIds = [];
  });

  it('fast-paths an empty deployment when Sealos is unconfigured and no legacy zips exist', async () => {
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');

    const { context } = createMigrationContext();
    await expect(cleanupLegacySandboxResources(context)).resolves.toEqual({
      deletedDevboxes: 0,
      deletedZips: 0,
      deletedOrphans: 0
    });
    expect(context.reportProgress).toHaveBeenCalledWith({
      key: 'validation',
      status: 'succeeded'
    });
  });

  it('blocks all deletions in preflight if any active unmigrated sandbox record exists', async () => {
    const activeApp = await seedApp(false);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.internal.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'cleanup-secret');

    const unmigratedRow = await seedSandboxRow({
      provider: 'sealosdevbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.stopped
    });
    const legacyMountRow = await seedSandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.stopped,
      storage: {
        mountPath: '/workspace',
        volumes: [{ name: 'workspace', claimName: 'pvc-legacy-workspace', mountPath: '/workspace' }]
      }
    });
    s3State.objects.set(
      `sandbox/archive/${unmigratedRow.sandboxId}/package.zip`,
      Buffer.from('zip')
    );

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const state = createMigrationContext();
    await expect(cleanupLegacySandboxResources(state.context)).rejects.toThrow(
      'complete migration before cleanup'
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(s3State.deleteArchiveObjectSpy).not.toHaveBeenCalled();
    expect(s3State.objects.has(`sandbox/archive/${unmigratedRow.sandboxId}/package.zip`)).toBe(
      true
    );
    expect(state.failures()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stageKey: 'preflight',
          data: expect.objectContaining({ sandboxId: unmigratedRow.sandboxId })
        }),
        expect.objectContaining({
          stageKey: 'preflight',
          data: expect.objectContaining({ sandboxId: legacyMountRow.sandboxId })
        })
      ])
    );
  });

  it('fails preflight when legacyDevboxPendingCleanup is true and Sealos env is missing', async () => {
    const activeApp = await seedApp(false);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');

    await seedSandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        legacyDevboxPendingCleanup: true,
        archive: {
          objectKey: 'sandbox/archive/pending-devbox/gen1.tar.zst',
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 0,
          archivedAt: new Date()
        }
      }
    });

    const state = createMigrationContext();
    await expect(cleanupLegacySandboxResources(state.context)).rejects.toThrow(
      'Missing AGENT_SANDBOX_SEALOS_BASEURL or AGENT_SANDBOX_SEALOS_TOKEN'
    );
  });

  it('refuses to delete legacy package.zip when target .tar.zst object is missing in S3', async () => {
    const activeApp = await seedApp(false);
    const row = await seedSandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: 'sandbox/archive/missing/gen1.tar.zst',
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 256,
          archivedAt: new Date()
        }
      }
    });
    const zipKey = `sandbox/archive/${row.sandboxId}/package.zip`;
    s3State.objects.set(zipKey, Buffer.from('old-zip'));

    const state = createMigrationContext();
    await expect(cleanupLegacySandboxResources(state.context)).rejects.toThrow(
      'failed safety verification'
    );

    expect(s3State.deleteArchiveObjectSpy).not.toHaveBeenCalled();
    expect(s3State.objects.has(zipKey)).toBe(true);
    expect(state.failures()).toEqual([
      expect.objectContaining({
        stageKey: 'cleanupLegacyZips',
        data: { key: zipKey, sandboxId: row.sandboxId }
      })
    ]);
  });

  it('idempotently deletes legacy Devboxes (including woken rows), verified zips, and orphans', async () => {
    const activeApp = await seedApp(false);
    const deletedApp = await seedApp(true);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.internal.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'cleanup-secret');

    // 1) 已在迁移后重新被用户唤醒进入 OpenSandbox running 的实例：仍需清理同 sandboxId 的 paused Devbox 与旧 zip，并清空待清理标记。
    const wokenRunningRow = await seedSandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.running,
      instanceId: 'osb-live-1',
      storage: {
        legacyDevboxPendingCleanup: true,
        volumes: [{ name: 'workspace', claimName: 'pvc-live-1', mountPath: '/home/sandbox' }]
      }
    });
    const wokenZipKey = `sandbox/archive/${wokenRunningRow.sandboxId}/package.zip`;
    s3State.objects.set(wokenZipKey, Buffer.from('old-zip-woken'));

    // 2) OpenSandbox archived（来自 Devbox 迁移且待清理旧 Devbox）与 S3 .tar.zst 真实存在。
    const archivedRow = await seedSandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        legacyDevboxPendingCleanup: true,
        archive: {
          objectKey: 'sandbox/archive/app-archived/gen1.tar.zst',
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 12,
          archivedAt: new Date()
        }
      }
    });
    const archivedZstKey = 'sandbox/archive/app-archived/gen1.tar.zst';
    const archivedZipKey = `sandbox/archive/${archivedRow.sandboxId}/package.zip`;
    s3State.objects.set(archivedZstKey, Buffer.from('zst-payload!!'));
    s3State.objects.set(archivedZipKey, Buffer.from('old-zip-archived'));

    // 3) 空工作区归档（sizeBytes === 0），无需 S3 .tar.zst 实体即可安全删旧 zip。
    const emptyArchivedRow = await seedSandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: 'sandbox/archive/empty/gen1.tar.zst',
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 0,
          archivedAt: new Date()
        }
      }
    });
    const emptyZipKey = `sandbox/archive/${emptyArchivedRow.sandboxId}/package.zip`;
    s3State.objects.set(emptyZipKey, Buffer.from('old-zip-empty'));

    // 4) 已软删除应用的孤儿记录（分别覆盖 legacy sealosdevbox 与 opensandbox 两类孤儿）。
    const orphanRow = await seedSandboxRow({
      provider: 'sealosdevbox',
      sourceId: deletedApp.appId,
      teamId: deletedApp.teamId,
      status: SandboxInstanceStatusEnum.stopped
    });
    const orphanZipKey = `sandbox/archive/${orphanRow.sandboxId}/package.zip`;
    s3State.objects.set(orphanZipKey, Buffer.from('orphan-zip'));

    const openSandboxOrphanZstKey = 'sandbox/archive/osb-orphan/gen1.tar.zst';
    const openSandboxOrphanRow = await seedSandboxRow({
      provider: 'opensandbox',
      sourceId: deletedApp.appId,
      teamId: deletedApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: openSandboxOrphanZstKey,
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 32,
          archivedAt: new Date()
        }
      }
    });
    s3State.objects.set(openSandboxOrphanZstKey, Buffer.from('orphan-zst'));

    // 5) 无对应 DB 记录的纯 S3 遗留 package.zip。
    const ghostZipKey = 'sandbox/archive/ghost-sb-1/package.zip';
    s3State.objects.set(ghostZipKey, Buffer.from('ghost-zip'));

    const remoteDevboxes = new Set<string>([
      wokenRunningRow.sandboxId,
      archivedRow.sandboxId,
      orphanRow.sandboxId
    ]);
    const deletedRemoteIds: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const pathname = new URL(url).pathname;
      const match = /^\/api\/v1\/devbox\/([^/]+)$/.exec(pathname);
      const name = match ? decodeURIComponent(match[1]) : '';

      if (init?.method === 'GET' && match) {
        if (!remoteDevboxes.has(name)) {
          return new Response(JSON.stringify({ code: 404, message: 'not found', data: null }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(
          JSON.stringify({ code: 200, message: 'ok', data: { name, state: { phase: 'Paused' } } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (init?.method === 'DELETE' && match) {
        remoteDevboxes.delete(name);
        deletedRemoteIds.push(name);
        return new Response(JSON.stringify({ code: 200, message: 'deleted', data: { name } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not Found', { status: 404 });
    });

    const { context } = createMigrationContext();
    await expect(cleanupLegacySandboxResources(context)).resolves.toEqual({
      deletedDevboxes: 3,
      deletedZips: 4,
      deletedOrphans: 2
    });

    expect(new Set(deletedRemoteIds)).toEqual(
      new Set([wokenRunningRow.sandboxId, archivedRow.sandboxId, orphanRow.sandboxId])
    );
    expect(resourceMockState.deletedSandboxIds).toEqual([openSandboxOrphanRow.sandboxId]);
    expect(s3State.objects.has(archivedZstKey)).toBe(true);
    expect(s3State.objects.has(openSandboxOrphanZstKey)).toBe(false);
    expect([...s3State.objects.keys()].filter((key) => key.endsWith('/package.zip'))).toEqual([]);
    expect(await MongoSandboxInstance.collection.findOne({ _id: orphanRow._id })).toBeNull();
    expect(
      await MongoSandboxInstance.collection.findOne({ _id: openSandboxOrphanRow._id })
    ).toBeNull();

    const updatedWokenRow = await MongoSandboxInstance.collection.findOne({
      _id: wokenRunningRow._id
    });
    expect(updatedWokenRow).not.toBeNull();
    expect(updatedWokenRow?.storage).not.toHaveProperty('legacyDevboxPendingCleanup');

    const updatedArchivedRow = await MongoSandboxInstance.collection.findOne({
      _id: archivedRow._id
    });
    expect(updatedArchivedRow?.storage).not.toHaveProperty('legacyDevboxPendingCleanup');
  });

  it('clears stale preflight failure and retries validation zip failure on resume', async () => {
    const activeApp = await seedApp(false);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');

    const zstKey = 'sandbox/archive/resume-zip/gen1.tar.zst';
    const row = await seedSandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: zstKey,
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 16,
          archivedAt: new Date()
        }
      }
    });
    const zipKey = `sandbox/archive/${row.sandboxId}/package.zip`;
    s3State.objects.set(zstKey, Buffer.from('valid-zst-bytes!'));
    s3State.objects.set(zipKey, Buffer.from('stale-package-zip'));

    const state = createMigrationContext();
    await state.context.saveCheckpoint({
      lastDocId: String(row._id),
      devboxesDone: true,
      lastZipKey: zipKey,
      zipsDone: true,
      deletedDevboxes: 0,
      deletedZips: 0,
      deletedOrphans: 0
    });
    await state.context.reportFailedRecords([
      {
        stageKey: 'preflight',
        data: { id: 'stale-preflight-id', sandboxId: 'stale-preflight-sb' },
        reason: { message: 'Previous preflight failure' }
      },
      {
        stageKey: 'validation',
        data: { key: zipKey, sandboxId: row.sandboxId },
        reason: { message: 'Legacy package.zip object still present after cleanup' }
      }
    ]);

    await expect(cleanupLegacySandboxResources(state.context)).resolves.toEqual({
      deletedDevboxes: 0,
      deletedZips: 1,
      deletedOrphans: 0
    });

    expect(state.failures()).toEqual([]);
    expect(s3State.objects.has(zipKey)).toBe(false);
    expect(s3State.objects.has(zstKey)).toBe(true);
  });

  it('fails validation when active unmigrated rows or legacyDevboxPendingCleanup remain in Mongo', async () => {
    const activeApp = await seedApp(false);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.internal.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'cleanup-secret');

    const pendingFlagRow = await seedSandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: 'sandbox/archive/pending-flag/gen1.tar.zst',
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 12,
          archivedAt: new Date()
        },
        legacyDevboxPendingCleanup: true
      }
    });

    const state = createMigrationContext();
    let injectedUnmigratedSandboxId = '';
    const originalReportProgress = state.context.reportProgress;
    state.context.reportProgress = vi.fn(async (progress) => {
      await originalReportProgress(progress);
      if (progress.key === 'preflight' && progress.status === 'succeeded') {
        const residualRow = await seedSandboxRow({
          provider: 'opensandbox',
          sourceId: activeApp.appId,
          teamId: activeApp.teamId,
          status: SandboxInstanceStatusEnum.archiving,
          storage: {
            volumes: [{ name: 'workspace', claimName: 'sb-residual-unmigrated' }]
          },
          operation: {
            id: 'op-delete',
            type: 'delete',
            phase: 'claimed',
            previousStatus: SandboxInstanceStatusEnum.stopped,
            startedAt: new Date(),
            heartbeatAt: new Date()
          }
        });
        injectedUnmigratedSandboxId = residualRow.sandboxId;
      }
    });
    await state.context.saveCheckpoint({
      lastDocId: String(pendingFlagRow._id),
      devboxesDone: true,
      lastZipKey: '',
      zipsDone: true,
      deletedDevboxes: 0,
      deletedZips: 0,
      deletedOrphans: 0
    });

    await expect(cleanupLegacySandboxResources(state.context)).rejects.toThrow(
      'Legacy sandbox resource cleanup validation failed with remaining records'
    );
    expect(state.failures()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stageKey: 'validation',
          data: expect.objectContaining({ sandboxId: pendingFlagRow.sandboxId })
        }),
        expect.objectContaining({
          stageKey: 'validation',
          data: expect.objectContaining({ sandboxId: injectedUnmigratedSandboxId })
        })
      ])
    );
  });

  it('fast-skips active native opensandbox rows without lease and passes allowDeleteLegacyDevboxPointer for pending orphan', async () => {
    const activeApp = await seedApp(false);
    const deletedApp = await seedApp(true);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.internal.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'cleanup-secret');

    const nativeRunningRow = await seedSandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.running,
      instanceId: 'native-live-1',
      storage: {
        volumes: [{ name: 'workspace', claimName: 'pvc-native-1', mountPath: '/home/sandbox' }]
      }
    });
    const nativeArchivedRow = await seedSandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: 'sandbox/archive/native-archived/gen1.tar.zst',
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 0,
          archivedAt: new Date()
        }
      }
    });
    const pendingOrphanRow = await seedSandboxRow({
      provider: 'opensandbox',
      sourceId: deletedApp.appId,
      teamId: deletedApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        legacyDevboxPendingCleanup: true,
        archive: {
          objectKey: 'sandbox/archive/tombstone/deleted.tar.zst',
          generation: 'deleted',
          format: 'tar.zst',
          sizeBytes: 0,
          archivedAt: new Date()
        }
      }
    });

    const deletedRemoteIds: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const match = /^\/api\/v1\/devbox\/([^/]+)$/.exec(new URL(url).pathname);
      if (init?.method === 'GET' && match) {
        const name = decodeURIComponent(match[1]);
        if (name === pendingOrphanRow.sandboxId && !deletedRemoteIds.includes(name)) {
          return new Response(
            JSON.stringify({
              code: 200,
              message: 'ok',
              data: { name, state: { phase: 'Paused' } }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ code: 404, message: 'not found', data: null }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (init?.method === 'DELETE' && match) {
        const name = decodeURIComponent(match[1]);
        deletedRemoteIds.push(name);
        return new Response(JSON.stringify({ code: 200, message: 'deleted', data: { name } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response('Not Found', { status: 404 });
    });

    const { context } = createMigrationContext();
    await expect(cleanupLegacySandboxResources(context)).resolves.toEqual({
      deletedDevboxes: 1,
      deletedZips: 0,
      deletedOrphans: 1
    });

    expect(leaseMockState.sandboxIds).not.toContain(nativeRunningRow.sandboxId);
    expect(leaseMockState.sandboxIds).not.toContain(nativeArchivedRow.sandboxId);
    expect(deletedRemoteIds).toEqual([pendingOrphanRow.sandboxId]);
    expect(resourceMockState.deleteCalls).toEqual([
      { sandboxId: pendingOrphanRow.sandboxId, allowDeleteLegacyDevboxPointer: true }
    ]);
  });

  it('deletes legacy package.zip when concurrent wake-up moves row to running inside recheck lease', async () => {
    const activeApp = await seedApp(false);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');

    const row = await seedSandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: 'sandbox/archive/rotated-missing/gen1.tar.zst',
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 64,
          archivedAt: new Date()
        }
      }
    });
    const zipKey = `sandbox/archive/${row.sandboxId}/package.zip`;
    s3State.objects.set(zipKey, Buffer.from('old-zip'));

    const leaseMod = await import('@fastgpt/service/core/ai/sandbox/application/lease');
    const leaseSpy = vi.mocked(leaseMod.withSandboxLease);
    const prevImpl = leaseSpy.getMockImplementation()!;
    leaseSpy.mockImplementationOnce(async (params) => {
      if (params.label.startsWith('verify-legacy-zip:')) {
        await MongoSandboxInstance.collection.updateOne(
          { _id: row._id },
          {
            $set: {
              status: SandboxInstanceStatusEnum.running,
              storage: {
                volumes: [{ name: 'workspace', claimName: 'pvc-woken', mountPath: '/home/sandbox' }]
              }
            }
          }
        );
      }
      return await prevImpl(params);
    });

    const { context } = createMigrationContext();
    await expect(cleanupLegacySandboxResources(context)).resolves.toEqual({
      deletedDevboxes: 0,
      deletedZips: 1,
      deletedOrphans: 0
    });

    expect(leaseMockState.sandboxIds).toContain(row.sandboxId);
    expect(s3State.objects.has(zipKey)).toBe(false);
  });

  it('replays validation-stage doc failures on retry even when devboxesDone and zipsDone are true', async () => {
    const activeApp = await seedApp(false);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.internal.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'cleanup-secret');

    await seedSandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.running,
      instanceId: 'already-migrated-1',
      storage: {
        volumes: [{ name: 'workspace', claimName: 'pvc-migrated-1', mountPath: '/home/sandbox' }]
      }
    });

    const state = createMigrationContext();
    let lateRowId = '';
    let lateSandboxId = '';
    let injectedLatePendingRow = false;
    vi.mocked(state.context.reportProgress).mockImplementation(async (progress) => {
      if (
        !injectedLatePendingRow &&
        progress.key === 'cleanupDevboxes' &&
        progress.status === 'succeeded'
      ) {
        injectedLatePendingRow = true;
        const lateRow = await seedSandboxRow({
          provider: 'opensandbox',
          sourceId: activeApp.appId,
          teamId: activeApp.teamId,
          status: SandboxInstanceStatusEnum.archived,
          storage: {
            legacyDevboxPendingCleanup: true,
            archive: {
              objectKey: 'sandbox/archive/late-pending/gen1.tar.zst',
              generation: 'gen1',
              format: 'tar.zst',
              sizeBytes: 0,
              archivedAt: new Date()
            }
          }
        });
        lateRowId = String(lateRow._id);
        lateSandboxId = lateRow.sandboxId;
      }
    });

    await expect(cleanupLegacySandboxResources(state.context)).rejects.toThrow(
      'validation failed with remaining records'
    );
    expect(state.failures()).toEqual([
      expect.objectContaining({
        stageKey: 'validation',
        data: { id: lateRowId, sandboxId: lateSandboxId }
      })
    ]);

    const deletedRemoteIds: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const match = /^\/api\/v1\/devbox\/([^/]+)$/.exec(new URL(url).pathname);
      if (init?.method === 'GET' && match) {
        const name = decodeURIComponent(match[1]);
        if (!deletedRemoteIds.includes(name)) {
          return new Response(
            JSON.stringify({
              code: 200,
              message: 'ok',
              data: { name, state: { phase: 'Paused' } }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ code: 404, message: 'not found', data: null }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (init?.method === 'DELETE' && match) {
        deletedRemoteIds.push(decodeURIComponent(match[1]));
        return new Response(
          JSON.stringify({ code: 200, message: 'deleted', data: { name: match[1] } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not Found', { status: 404 });
    });

    await expect(cleanupLegacySandboxResources(state.context)).resolves.toEqual({
      deletedDevboxes: 1,
      deletedZips: 0,
      deletedOrphans: 0
    });

    expect(deletedRemoteIds).toEqual([lateSandboxId]);
    expect(state.failures()).toEqual([]);
    const repaired = await MongoSandboxInstance.collection.findOne({ sandboxId: lateSandboxId });
    expect(repaired?.storage?.legacyDevboxPendingCleanup).toBeUndefined();
  });

  it('propagates real S3 listObjects failures in preflight instead of silently skipping ghost zip cleanup', async () => {
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');
    (s3State as { listError?: Error }).listError = new Error('S3 503 SlowDown');

    try {
      const { context } = createMigrationContext();
      await expect(cleanupLegacySandboxResources(context)).rejects.toThrow('S3 503 SlowDown');
    } finally {
      (s3State as { listError?: Error }).listError = undefined;
    }
  });

  it('preserves existing non-preflight failure records when preflight fails and avoids calling Sealos or counting orphans on tombstones', async () => {
    const activeApp = await seedApp(false);
    const deletedApp = await seedApp(true);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.internal.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'cleanup-secret');

    // 1. preflight 失败时应保留既有的 cleanupLegacyZips 失败记录，不丢历史快照。
    const unmigratedRow = await seedSandboxRow({
      provider: 'sealosdevbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.stopped
    });
    const preservedZipFailure = {
      stageKey: 'cleanupLegacyZips',
      data: { key: 'sandbox/archive/old-zip/package.zip', sandboxId: 'old-zip' },
      reason: { message: 'Temporary S3 error' }
    };
    const state = createMigrationContext();
    await state.context.reportFailedRecords([preservedZipFailure]);

    await expect(cleanupLegacySandboxResources(state.context)).rejects.toThrow(
      'complete migration before cleanup'
    );
    expect(state.failures()).toEqual(
      expect.arrayContaining([
        preservedZipFailure,
        expect.objectContaining({
          stageKey: 'preflight',
          data: expect.objectContaining({ sandboxId: unmigratedRow.sandboxId })
        })
      ])
    );

    // 2. 清理原生 opensandbox 孤儿时即使配置了 Sealos env 也不请求 Sealos Devbox，
    //    且 deleteSandboxResourceWithinLease 仅写墓碑未删文档时不得递增 deletedOrphans。
    await MongoSandboxInstance.collection.deleteOne({ _id: unmigratedRow._id });
    const nativeOrphanRow = await seedSandboxRow({
      provider: 'opensandbox',
      sourceId: deletedApp.appId,
      teamId: deletedApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: 'sandbox/archive/native-orphan/gen1.tar.zst',
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 0,
          archivedAt: new Date()
        }
      }
    });
    const resourceMod = await import('@fastgpt/service/core/ai/sandbox/application/resource');
    vi.mocked(resourceMod.deleteSandboxResourceWithinLease).mockImplementationOnce(async () => {
      // 模拟因无法删除旧 Devbox 指针而保留墓碑文档、不真正 remove 文档。
      return undefined;
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const secondState = createMigrationContext();
    await expect(cleanupLegacySandboxResources(secondState.context)).resolves.toEqual({
      deletedDevboxes: 0,
      deletedZips: 0,
      deletedOrphans: 0
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(resourceMockState.deleteCalls).toEqual([]);
    expect(await MongoSandboxInstance.collection.countDocuments({ _id: nativeOrphanRow._id })).toBe(
      1
    );
  });
});
