import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildSandboxArchiveObjectKey,
  LEGACY_SANDBOX_ARCHIVE_PREFIX,
  SANDBOX_ARCHIVE_PREFIX
} from '@fastgpt/service/common/s3/sources/sandbox';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import {
  getLegacySandboxInstanceCollection,
  MongoSandboxInstance
} from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  createMigrationContext as createSharedMigrationContext,
  getMockS3SandboxSource,
  insertLegacySandboxRow,
  insertV3SandboxRow,
  seedMigrationApp as seedApp
} from '../sandbox_opensandbox_shared/helpers';

const s3State = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  throwOnAccess: false,
  deleteArchiveObjectSpy: vi.fn(),
  deleteSandboxArchivesSpy: vi.fn()
}));

const resourceMockState = vi.hoisted(() => ({
  deletedContainers: [] as Array<{ sandboxId: string; allowLegacyUnlabeled?: boolean }>,
  deletedVolumes: [] as Array<{
    claimName: string;
    options?: { allowLegacyUnlabeled?: boolean; signal?: AbortSignal };
  }>
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
    deleteOpenSandboxContainer: vi.fn(async ({ sandboxId, allowLegacyUnlabeled }) => {
      resourceMockState.deletedContainers.push({ sandboxId, allowLegacyUnlabeled });
    })
  };
});

vi.mock(
  '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@fastgpt/service/core/ai/sandbox/infrastructure/volume/service')
      >();
    return {
      ...actual,
      deleteSessionVolume: vi.fn(async (claimName, options) => {
        resourceMockState.deletedVolumes.push({ claimName, options });
      })
    };
  }
);

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
    resourceMockState.deletedContainers = [];
    resourceMockState.deletedVolumes = [];
    leaseMockState.sandboxIds = [];
    await getLegacySandboxInstanceCollection().deleteMany({});
    await MongoSandboxInstance.collection.deleteMany({});
  });

  it('fast-paths an empty deployment when v2 and v3 are empty and no legacy zips exist', async () => {
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');

    const { context } = createMigrationContext();
    await expect(cleanupLegacySandboxResources(context)).resolves.toEqual({
      deletedDevboxes: 0,
      deletedVolumes: 0,
      deletedZips: 0,
      deletedOrphans: 0
    });
    expect(context.reportProgress).toHaveBeenCalledWith({
      key: 'validation',
      status: 'succeeded'
    });
  });

  it('blocks all deletions in preflight if any active v2 record has no migrated v3 record', async () => {
    const activeApp = await seedApp(false);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.internal.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'cleanup-secret');

    const unmigratedDevboxRow = await insertLegacySandboxRow({
      provider: 'sealosdevbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.stopped
    });
    const legacyMountRow = await insertLegacySandboxRow({
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
      `${LEGACY_SANDBOX_ARCHIVE_PREFIX}/${unmigratedDevboxRow.sandboxId}/package.zip`,
      Buffer.from('zip')
    );

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const state = createMigrationContext();
    await expect(cleanupLegacySandboxResources(state.context)).rejects.toThrow(
      'complete migration before cleanup'
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(resourceMockState.deletedContainers).toEqual([]);
    expect(resourceMockState.deletedVolumes).toEqual([]);
    expect(s3State.deleteArchiveObjectSpy).not.toHaveBeenCalled();
    expect(
      s3State.objects.has(
        `${LEGACY_SANDBOX_ARCHIVE_PREFIX}/${unmigratedDevboxRow.sandboxId}/package.zip`
      )
    ).toBe(true);
    expect(await getLegacySandboxInstanceCollection().countDocuments({})).toBe(2);
    expect(state.failures()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stageKey: 'preflight',
          data: expect.objectContaining({ sandboxId: unmigratedDevboxRow.sandboxId })
        }),
        expect.objectContaining({
          stageKey: 'preflight',
          data: expect.objectContaining({ sandboxId: legacyMountRow.sandboxId })
        })
      ])
    );
  });

  it('fails preflight when v2 contains sealosdevbox rows and Sealos env is missing', async () => {
    const activeApp = await seedApp(false);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');

    const legacyRow = await insertLegacySandboxRow({
      provider: 'sealosdevbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.stopped
    });
    await insertV3SandboxRow({
      _id: legacyRow._id,
      provider: 'opensandbox',
      sandboxId: legacyRow.sandboxId,
      sourceType: legacyRow.sourceType,
      sourceId: legacyRow.sourceId,
      userId: legacyRow.userId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: buildSandboxArchiveObjectKey(legacyRow.sandboxId, 'gen1'),
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

  it('refuses to delete legacy package.zip when target v3 .tar.zst object is missing in S3 or outside sandbox/archive-v2/', async () => {
    const activeApp = await seedApp(false);
    const missingRow = await insertV3SandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: buildSandboxArchiveObjectKey('missing-obj', 'gen1'),
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 256,
          archivedAt: new Date()
        }
      }
    });
    const missingZipKey = `${LEGACY_SANDBOX_ARCHIVE_PREFIX}/${missingRow.sandboxId}/package.zip`;
    s3State.objects.set(missingZipKey, Buffer.from('old-zip'));

    const legacyPrefixRow = await insertV3SandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: `${LEGACY_SANDBOX_ARCHIVE_PREFIX}/wrong-prefix/gen1.tar.zst`,
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 16,
          archivedAt: new Date()
        }
      }
    });
    const wrongPrefixZipKey = `${LEGACY_SANDBOX_ARCHIVE_PREFIX}/${legacyPrefixRow.sandboxId}/package.zip`;
    s3State.objects.set(wrongPrefixZipKey, Buffer.from('old-zip-2'));

    const state = createMigrationContext();
    await expect(cleanupLegacySandboxResources(state.context)).rejects.toThrow(
      'failed safety verification'
    );

    expect(s3State.deleteArchiveObjectSpy).not.toHaveBeenCalled();
    expect(s3State.objects.has(missingZipKey)).toBe(true);
    expect(s3State.objects.has(wrongPrefixZipKey)).toBe(true);
    expect(state.failures()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stageKey: 'cleanupLegacyZips',
          data: { key: missingZipKey, sandboxId: missingRow.sandboxId }
        }),
        expect.objectContaining({
          stageKey: 'cleanupLegacyZips',
          data: { key: wrongPrefixZipKey, sandboxId: legacyPrefixRow.sandboxId }
        })
      ])
    );
  });

  it('refuses to delete legacy Devbox or legacy PVC when active target v3 .tar.zst object is missing in S3 or outside sandbox/archive-v2/', async () => {
    const activeApp = await seedApp(false);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.internal.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'cleanup-secret');

    const devboxV2 = await insertLegacySandboxRow({
      provider: 'sealosdevbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.stopped
    });
    await insertV3SandboxRow({
      _id: devboxV2._id,
      provider: 'opensandbox',
      sandboxId: devboxV2.sandboxId,
      sourceType: devboxV2.sourceType,
      sourceId: devboxV2.sourceId,
      userId: devboxV2.userId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: buildSandboxArchiveObjectKey(devboxV2.sandboxId, 'gen1'),
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 256,
          archivedAt: new Date()
        }
      }
    });

    const osbV2 = await insertLegacySandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.stopped,
      storage: {
        mountPath: '/workspace',
        volumes: [
          { name: 'workspace', claimName: 'pvc-legacy-missing-zst', mountPath: '/workspace' }
        ]
      }
    });
    await insertV3SandboxRow({
      _id: osbV2._id,
      provider: 'opensandbox',
      sandboxId: osbV2.sandboxId,
      sourceType: osbV2.sourceType,
      sourceId: osbV2.sourceId,
      userId: osbV2.userId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: buildSandboxArchiveObjectKey(osbV2.sandboxId, 'gen1'),
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 128,
          archivedAt: new Date()
        }
      }
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const state = createMigrationContext();
    await expect(cleanupLegacySandboxResources(state.context)).rejects.toThrow(
      'failed safety verification'
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(resourceMockState.deletedVolumes).toEqual([]);
    expect(resourceMockState.deletedContainers).toEqual([]);
    expect(await getLegacySandboxInstanceCollection().countDocuments({})).toBe(2);
    expect(state.failures()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stageKey: 'cleanupDevboxes',
          data: { id: String(devboxV2._id), sandboxId: devboxV2.sandboxId },
          reason: {
            message: expect.stringContaining('missing in S3')
          }
        }),
        expect.objectContaining({
          stageKey: 'cleanupDevboxes',
          data: { id: String(osbV2._id), sandboxId: osbV2.sandboxId },
          reason: {
            message: expect.stringContaining('missing in S3')
          }
        })
      ])
    );
  });

  it('idempotently deletes v2 Devboxes, legacy PVCs, v2 rows, verified zips, and v2 orphans without harming live v3 containers or PVCs', async () => {
    const activeApp = await seedApp(false);
    const deletedApp = await seedApp(true);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.internal.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'cleanup-secret');

    // 1) 已迁移并重新在 v3 唤醒运行的原 Devbox：清理同名暂停 Devbox、v2 行与旧 zip，保留 v3 活容器与新 PVC。
    const wokenDevboxV2 = await insertLegacySandboxRow({
      provider: 'sealosdevbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.running
    });
    await insertV3SandboxRow({
      _id: wokenDevboxV2._id,
      provider: 'opensandbox',
      sandboxId: wokenDevboxV2.sandboxId,
      sourceType: wokenDevboxV2.sourceType,
      sourceId: wokenDevboxV2.sourceId,
      userId: wokenDevboxV2.userId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.running,
      instanceId: 'osb-live-v3-1',
      storage: {
        mountPath: '/home/sandbox',
        volumes: [{ name: 'workspace', claimName: 'pvc-live-v3-1', mountPath: '/home/sandbox' }]
      }
    });
    const wokenZipKey = `${LEGACY_SANDBOX_ARCHIVE_PREFIX}/${wokenDevboxV2.sandboxId}/package.zip`;
    s3State.objects.set(wokenZipKey, Buffer.from('old-zip-woken'));

    // 2) 已迁移至 v3 archived + sandbox/archive-v2/ 的原 Devbox：清理 Devbox、v2 行与旧 zip，保留 v3 行与 .tar.zst。
    const archivedDevboxV2 = await insertLegacySandboxRow({
      provider: 'sealosdevbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.stopped
    });
    const archivedZstKey = buildSandboxArchiveObjectKey(archivedDevboxV2.sandboxId, 'gen1');
    await insertV3SandboxRow({
      _id: archivedDevboxV2._id,
      provider: 'opensandbox',
      sandboxId: archivedDevboxV2.sandboxId,
      sourceType: archivedDevboxV2.sourceType,
      sourceId: archivedDevboxV2.sourceId,
      userId: archivedDevboxV2.userId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: archivedZstKey,
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 12,
          archivedAt: new Date()
        }
      }
    });
    const archivedZipKey = `${LEGACY_SANDBOX_ARCHIVE_PREFIX}/${archivedDevboxV2.sandboxId}/package.zip`;
    s3State.objects.set(archivedZstKey, Buffer.from('zst-payload!!'));
    s3State.objects.set(archivedZipKey, Buffer.from('old-zip-archived'));

    // 3) 已迁移并已在 v3 重建新 PVC 的原 OpenSandbox /workspace 行：
    //    绝不调用 deleteOpenSandboxContainer（targetV3 存在），删除旧 PVC pvc-v2-old，绝不触碰 v3 新 PVC pvc-v3-new。
    const migratedLegacyOsbV2 = await insertLegacySandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      instanceId: 'old-v2-container',
      status: SandboxInstanceStatusEnum.running,
      storage: {
        mountPath: '/workspace',
        volumes: [{ name: 'workspace', claimName: 'pvc-v2-old', mountPath: '/workspace' }]
      }
    });
    const migratedLegacyOsbV3 = await insertV3SandboxRow({
      _id: migratedLegacyOsbV2._id,
      provider: 'opensandbox',
      sandboxId: migratedLegacyOsbV2.sandboxId,
      sourceType: migratedLegacyOsbV2.sourceType,
      sourceId: migratedLegacyOsbV2.sourceId,
      userId: migratedLegacyOsbV2.userId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.running,
      instanceId: 'live-v3-container',
      storage: {
        mountPath: '/home/sandbox',
        volumes: [{ name: 'workspace', claimName: 'pvc-v3-new', mountPath: '/home/sandbox' }]
      }
    });

    // 4) 若 targetV3 仍引用同一 claimName，不得删除该共享 PVC。
    const sharedClaimV2 = await insertLegacySandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.stopped,
      storage: {
        mountPath: '/home/sandbox',
        volumes: [{ name: 'workspace', claimName: 'pvc-shared-v3', mountPath: '/home/sandbox' }]
      }
    });
    await insertV3SandboxRow({
      _id: sharedClaimV2._id,
      provider: 'opensandbox',
      sandboxId: sharedClaimV2.sandboxId,
      sourceType: sharedClaimV2.sourceType,
      sourceId: sharedClaimV2.sourceId,
      userId: sharedClaimV2.userId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.stopped,
      storage: {
        mountPath: '/home/sandbox',
        volumes: [{ name: 'workspace', claimName: 'pvc-shared-v3', mountPath: '/home/sandbox' }]
      }
    });

    // 5) v2 中的 deleting 墓碑行（分别覆盖 sealosdevbox 与 opensandbox）：无 targetV3，回收远端容器/旧 PVC 并删 v2 行计入 deletedOrphans。
    const deletingDevboxV2 = await insertLegacySandboxRow({
      provider: 'sealosdevbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.deleting
    });
    const deletingOsbV2 = await insertLegacySandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      instanceId: 'deleting-v2-osb-container',
      status: SandboxInstanceStatusEnum.deleting,
      storage: {
        volumes: [{ name: 'workspace', claimName: 'pvc-v2-deleting', mountPath: '/workspace' }]
      }
    });

    // 6) v2 中源已软删除的孤儿行（sealosdevbox + opensandbox）：无 targetV3，回收 Devbox/容器/PVC/v2 行。
    const orphanDevboxV2 = await insertLegacySandboxRow({
      provider: 'sealosdevbox',
      sourceId: deletedApp.appId,
      teamId: deletedApp.teamId,
      status: SandboxInstanceStatusEnum.stopped
    });
    s3State.objects.set(
      `${LEGACY_SANDBOX_ARCHIVE_PREFIX}/${orphanDevboxV2.sandboxId}/package.zip`,
      Buffer.from('orphan-zip')
    );

    const orphanOsbV2 = await insertLegacySandboxRow({
      provider: 'opensandbox',
      sourceId: deletedApp.appId,
      teamId: deletedApp.teamId,
      instanceId: 'orphan-v2-osb-container',
      status: SandboxInstanceStatusEnum.stopped,
      storage: {
        volumes: [{ name: 'workspace', claimName: 'pvc-v2-orphan', mountPath: '/workspace' }]
      }
    });

    // 7) 无对应 DB 记录的纯 S3 遗留 package.zip。
    const ghostZipKey = `${LEGACY_SANDBOX_ARCHIVE_PREFIX}/ghost-sb-1/package.zip`;
    s3State.objects.set(ghostZipKey, Buffer.from('ghost-zip'));

    const remoteDevboxes = new Set<string>([
      wokenDevboxV2.sandboxId,
      archivedDevboxV2.sandboxId,
      deletingDevboxV2.sandboxId,
      orphanDevboxV2.sandboxId
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
      deletedDevboxes: 4,
      deletedVolumes: 3,
      deletedZips: 4,
      deletedOrphans: 4
    });

    // Devbox 清理验证
    expect(new Set(deletedRemoteIds)).toEqual(
      new Set([
        wokenDevboxV2.sandboxId,
        archivedDevboxV2.sandboxId,
        deletingDevboxV2.sandboxId,
        orphanDevboxV2.sandboxId
      ])
    );

    // 仅无 targetV3 的 v2 OpenSandbox 行会触发 deleteOpenSandboxContainer（携带 allowLegacyUnlabeled: true）；绝不触碰活 v3 容器。
    expect(resourceMockState.deletedContainers).toHaveLength(2);
    expect(resourceMockState.deletedContainers).toEqual(
      expect.arrayContaining([
        { sandboxId: deletingOsbV2.sandboxId, allowLegacyUnlabeled: true },
        { sandboxId: orphanOsbV2.sandboxId, allowLegacyUnlabeled: true }
      ])
    );
    expect(resourceMockState.deletedContainers.map((item) => item.sandboxId)).not.toContain(
      migratedLegacyOsbV2.sandboxId
    );
    expect(resourceMockState.deletedContainers.map((item) => item.sandboxId)).not.toContain(
      sharedClaimV2.sandboxId
    );

    // 旧 PVC 清理验证：删除 pvc-v2-old、pvc-v2-deleting、pvc-v2-orphan，保留 pvc-v3-new 与 pvc-shared-v3。
    expect(new Set(resourceMockState.deletedVolumes.map((item) => item.claimName))).toEqual(
      new Set(['pvc-v2-old', 'pvc-v2-deleting', 'pvc-v2-orphan'])
    );
    for (const call of resourceMockState.deletedVolumes) {
      expect(call.options).toEqual({
        allowLegacyUnlabeled: true,
        signal: expect.any(AbortSignal)
      });
    }

    // 保留所有活跃 v3 行与 sandbox/archive-v2/ 归档；清理全部 package.zip。
    expect(s3State.objects.has(archivedZstKey)).toBe(true);
    expect([...s3State.objects.keys()].filter((key) => key.endsWith('/package.zip'))).toEqual([]);

    // v2 集合全部清空，v3 活跃记录完好无损。
    expect(await getLegacySandboxInstanceCollection().countDocuments({})).toBe(0);
    expect(
      await MongoSandboxInstance.collection.findOne({ _id: migratedLegacyOsbV3._id })
    ).toMatchObject({
      status: SandboxInstanceStatusEnum.running,
      instanceId: 'live-v3-container',
      storage: {
        mountPath: '/home/sandbox',
        volumes: [{ name: 'workspace', claimName: 'pvc-v3-new', mountPath: '/home/sandbox' }]
      }
    });

    // 幂等二次执行应全部返回 0。
    const secondRun = createMigrationContext();
    await expect(cleanupLegacySandboxResources(secondRun.context)).resolves.toEqual({
      deletedDevboxes: 0,
      deletedVolumes: 0,
      deletedZips: 0,
      deletedOrphans: 0
    });
  });

  it('clears stale preflight failure, parses legacy checkpoint defaults, and retries validation zip failure on resume', async () => {
    const activeApp = await seedApp(false);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');

    const zstKey = `${SANDBOX_ARCHIVE_PREFIX}/resume-zip/gen1.tar.zst`;
    const row = await insertV3SandboxRow({
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
    const zipKey = `${LEGACY_SANDBOX_ARCHIVE_PREFIX}/${row.sandboxId}/package.zip`;
    s3State.objects.set(zstKey, Buffer.from('valid-zst-bytes!'));
    s3State.objects.set(zipKey, Buffer.from('stale-package-zip'));

    const state = createMigrationContext();
    // 模拟缺少可选计数默认值的旧 checkpoint（不含 deletedVolumes）也能通过默认值解析续跑。
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
      deletedVolumes: 0,
      deletedZips: 1,
      deletedOrphans: 0
    });

    expect(state.failures()).toEqual([]);
    expect(s3State.objects.has(zipKey)).toBe(false);
    expect(s3State.objects.has(zstKey)).toBe(true);
  });

  it('fast-skips active v3 rows without acquiring lease and succeeds for v2 opensandbox archived rows without OpenSandbox env', async () => {
    const activeApp = await seedApp(false);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');

    const nativeRunningRow = await insertV3SandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.running,
      instanceId: 'native-live-1',
      storage: {
        volumes: [{ name: 'workspace', claimName: 'pvc-native-1', mountPath: '/home/sandbox' }]
      }
    });
    const nativeArchivedRow = await insertV3SandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: `${SANDBOX_ARCHIVE_PREFIX}/native-archived/gen1.tar.zst`,
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 0,
          archivedAt: new Date()
        }
      }
    });

    // v2 仅有旧 OpenSandbox archived + 旧 PVC 记录（无 Sealos、无 OpenSandbox 配置）。
    const v2ArchivedRow = await insertLegacySandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        volumes: [{ name: 'workspace', claimName: 'pvc-v2-archived', mountPath: '/workspace' }]
      }
    });
    await insertV3SandboxRow({
      _id: v2ArchivedRow._id,
      provider: 'opensandbox',
      sandboxId: v2ArchivedRow.sandboxId,
      sourceType: v2ArchivedRow.sourceType,
      sourceId: v2ArchivedRow.sourceId,
      userId: v2ArchivedRow.userId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: buildSandboxArchiveObjectKey(v2ArchivedRow.sandboxId, 'gen1'),
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 0,
          archivedAt: new Date()
        }
      }
    });

    const { context } = createMigrationContext();
    await expect(cleanupLegacySandboxResources(context)).resolves.toEqual({
      deletedDevboxes: 0,
      deletedVolumes: 1,
      deletedZips: 0,
      deletedOrphans: 0
    });

    expect(leaseMockState.sandboxIds).not.toContain(nativeRunningRow.sandboxId);
    expect(leaseMockState.sandboxIds).not.toContain(nativeArchivedRow.sandboxId);
    expect(resourceMockState.deletedContainers).toEqual([]);
    expect(resourceMockState.deletedVolumes.map((item) => item.claimName)).toEqual([
      'pvc-v2-archived'
    ]);
    expect(await getLegacySandboxInstanceCollection().countDocuments({})).toBe(0);
  });

  it('deletes legacy package.zip when concurrent wake-up moves v3 row to running inside recheck lease', async () => {
    const activeApp = await seedApp(false);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');

    const row = await insertV3SandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: `${SANDBOX_ARCHIVE_PREFIX}/rotated-missing/gen1.tar.zst`,
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 64,
          archivedAt: new Date()
        }
      }
    });
    const zipKey = `${LEGACY_SANDBOX_ARCHIVE_PREFIX}/${row.sandboxId}/package.zip`;
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
      deletedVolumes: 0,
      deletedZips: 1,
      deletedOrphans: 0
    });

    expect(leaseMockState.sandboxIds).toContain(row.sandboxId);
    expect(s3State.objects.has(zipKey)).toBe(false);
  });

  it('preserves package.zip when a non-deleting active v2 row still exists during cleanupLegacyZips', async () => {
    const activeApp = await seedApp(false);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');

    const v2Row = await insertLegacySandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived
    });
    const zstKey = buildSandboxArchiveObjectKey(v2Row.sandboxId, 'gen1');
    await insertV3SandboxRow({
      _id: v2Row._id,
      provider: 'opensandbox',
      sandboxId: v2Row.sandboxId,
      sourceType: v2Row.sourceType,
      sourceId: v2Row.sourceId,
      userId: v2Row.userId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: zstKey,
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 12,
          archivedAt: new Date()
        }
      }
    });
    const zipKey = `${LEGACY_SANDBOX_ARCHIVE_PREFIX}/${v2Row.sandboxId}/package.zip`;
    s3State.objects.set(zstKey, Buffer.from('zst-payload!!'));
    s3State.objects.set(zipKey, Buffer.from('legacy-zip'));

    const state = createMigrationContext();
    await state.context.saveCheckpoint({
      lastDocId: String(v2Row._id),
      devboxesDone: true,
      lastZipKey: null,
      zipsDone: false,
      deletedDevboxes: 0,
      deletedVolumes: 0,
      deletedZips: 0,
      deletedOrphans: 0
    });

    await expect(cleanupLegacySandboxResources(state.context)).rejects.toThrow(
      'failed safety verification'
    );
    expect(s3State.objects.has(zipKey)).toBe(true);
    expect(state.failures()).toEqual([
      expect.objectContaining({
        stageKey: 'cleanupLegacyZips',
        data: { key: zipKey, sandboxId: v2Row.sandboxId }
      })
    ]);
  });

  it('fails validation when residual v2 records remain and replays validation doc failures on retry', async () => {
    const activeApp = await seedApp(false);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.internal.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'cleanup-secret');

    const preMigratedV2 = await insertLegacySandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived
    });
    await insertV3SandboxRow({
      _id: preMigratedV2._id,
      provider: 'opensandbox',
      sandboxId: preMigratedV2.sandboxId,
      sourceType: preMigratedV2.sourceType,
      sourceId: preMigratedV2.sourceId,
      userId: preMigratedV2.userId,
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
    let injectedLateRow = false;
    vi.mocked(state.context.reportProgress).mockImplementation(async (progress) => {
      if (
        !injectedLateRow &&
        progress.key === 'cleanupDevboxes' &&
        progress.status === 'succeeded'
      ) {
        injectedLateRow = true;
        const lateV2Row = await insertLegacySandboxRow({
          provider: 'sealosdevbox',
          sourceId: activeApp.appId,
          teamId: activeApp.teamId,
          status: SandboxInstanceStatusEnum.stopped
        });
        await insertV3SandboxRow({
          _id: lateV2Row._id,
          provider: 'opensandbox',
          sandboxId: lateV2Row.sandboxId,
          sourceType: lateV2Row.sourceType,
          sourceId: lateV2Row.sourceId,
          userId: lateV2Row.userId,
          teamId: activeApp.teamId,
          status: SandboxInstanceStatusEnum.archived,
          storage: {
            archive: {
              objectKey: buildSandboxArchiveObjectKey(lateV2Row.sandboxId, 'gen1'),
              generation: 'gen1',
              format: 'tar.zst',
              sizeBytes: 0,
              archivedAt: new Date()
            }
          }
        });
        lateRowId = String(lateV2Row._id);
        lateSandboxId = lateV2Row.sandboxId;
      }
    });

    await expect(cleanupLegacySandboxResources(state.context)).rejects.toThrow(
      'validation failed with remaining v2 records'
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
      deletedVolumes: 0,
      deletedZips: 0,
      deletedOrphans: 0
    });

    expect(deletedRemoteIds).toEqual([lateSandboxId]);
    expect(state.failures()).toEqual([]);
    expect(await getLegacySandboxInstanceCollection().countDocuments({})).toBe(0);
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

  it('preserves existing non-preflight failure records on preflight failure, fast-noops fresh v3 deployments, and cleans v2 restoring containers', async () => {
    const activeApp = await seedApp(false);
    const deletedApp = await seedApp(true);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.internal.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'cleanup-secret');

    // 1. preflight 失败时应保留既有的 cleanupLegacyZips 失败记录，不丢历史快照。
    const unmigratedRow = await insertLegacySandboxRow({
      provider: 'sealosdevbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.stopped
    });
    const preservedZipFailure = {
      stageKey: 'cleanupLegacyZips',
      data: { key: `${LEGACY_SANDBOX_ARCHIVE_PREFIX}/old-zip/package.zip`, sandboxId: 'old-zip' },
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

    // 2. 全新 4.18 部署（v2 空、无旧 zip，仅有活 v3 记录）应直接 fast-noop，不获取租约或调用 Sealos/S3 删除。
    await getLegacySandboxInstanceCollection().deleteOne({ _id: unmigratedRow._id });
    const liveV3Row = await insertV3SandboxRow({
      provider: 'opensandbox',
      sourceId: activeApp.appId,
      teamId: activeApp.teamId,
      status: SandboxInstanceStatusEnum.archived,
      storage: {
        archive: {
          objectKey: `${SANDBOX_ARCHIVE_PREFIX}/live-v3-only/gen1.tar.zst`,
          generation: 'gen1',
          format: 'tar.zst',
          sizeBytes: 0,
          archivedAt: new Date()
        }
      }
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const secondState = createMigrationContext();
    await expect(cleanupLegacySandboxResources(secondState.context)).resolves.toEqual({
      deletedDevboxes: 0,
      deletedVolumes: 0,
      deletedZips: 0,
      deletedOrphans: 0
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(leaseMockState.sandboxIds).toEqual([]);
    expect(s3State.deleteArchiveObjectSpy).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.collection.countDocuments({ _id: liveV3Row._id })).toBe(1);

    // 3. v2 restoring（operation.previousStatus = 'archived'）无 targetV3 时也必须携带 allowLegacyUnlabeled: true 清理残留容器。
    const restoringOrphanV2 = await insertLegacySandboxRow({
      provider: 'opensandbox',
      sourceId: deletedApp.appId,
      teamId: deletedApp.teamId,
      status: SandboxInstanceStatusEnum.restoring,
      operation: {
        id: 'op-restore-legacy',
        type: 'restore',
        phase: 'claimed',
        previousStatus: SandboxInstanceStatusEnum.archived
      }
    });

    const thirdState = createMigrationContext();
    await expect(cleanupLegacySandboxResources(thirdState.context)).resolves.toEqual({
      deletedDevboxes: 0,
      deletedVolumes: 0,
      deletedZips: 0,
      deletedOrphans: 1
    });
    expect(resourceMockState.deletedContainers).toEqual([
      { sandboxId: restoringOrphanV2.sandboxId, allowLegacyUnlabeled: true }
    ]);
  });
});
