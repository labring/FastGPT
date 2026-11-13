import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type {
  SystemMigrationFailedRecord,
  SystemMigrationFailureInput
} from '@fastgpt/global/migration/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { serviceEnv } from '@fastgpt/service/env';
import type { SystemMigrationContext } from '@/migration/registry';

vi.mock('@/migration/constants', () => ({ systemMigrationBatchSize: 2 }));

const mocks = vi.hoisted(() => ({
  checkVolumeManagerHealth: vi.fn(async () => undefined),
  deleteLegacyVolume: vi.fn(async () => undefined),
  checkOpenSandboxConnectivity: vi.fn(async () => undefined),
  terminateLegacyOpenSandboxContainers: vi.fn(async () => 1),
  deleteLegacyWorkspaceArchive: vi.fn(async () => undefined),
  sealosDelete: vi.fn(async () => undefined)
}));

vi.mock('@/migration/tasks/4180/sandbox_migration_shared/legacyVolumeClient', () => ({
  checkVolumeManagerHealth: mocks.checkVolumeManagerHealth,
  checkLegacyVolumeExists: vi.fn(async () => true),
  deleteLegacyVolume: mocks.deleteLegacyVolume
}));

vi.mock('@fastgpt/service/core/ai/sandbox/legacy/legacyOpenSandbox', () => ({
  checkOpenSandboxConnectivity: mocks.checkOpenSandboxConnectivity,
  terminateLegacyOpenSandboxContainers: mocks.terminateLegacyOpenSandboxContainers
}));

vi.mock('@/migration/tasks/4180/sandbox_migration_shared/legacyArchiveS3', () => ({
  deleteLegacyWorkspaceArchive: mocks.deleteLegacyWorkspaceArchive
}));

vi.mock('@/migration/tasks/4180/sandbox_migration_shared/sealosClient', () => ({
  createLegacySealosClientFromEnv: () => ({
    delete: mocks.sealosDelete
  })
}));

import {
  buildMatchingV3SandboxFilter,
  getLegacySandboxV2Collection,
  LegacySandboxV2DocSchema
} from '@/migration/tasks/4180/sandbox_migration_shared/legacySchema';
import { cleanupLegacySandboxResources } from '@/migration/tasks/4180/20261111_cleanup_legacy_sandbox_resources';

const createCleanupTestContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  let failures: SystemMigrationFailedRecord[] = [];

  const context = {
    migrationId: '20261111_cleanup_legacy_sandbox_resources',
    runId: 'test-cleanup-run',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint ? schema.parse(structuredClone(checkpoint)) : undefined,
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      checkpoint = structuredClone(value);
    }),
    getFailedRecords: async () => structuredClone(failures),
    reportFailedRecords: vi.fn(async (value: SystemMigrationFailedRecord[]) => {
      failures = structuredClone(value);
    }),
    assertActive: vi.fn(async () => undefined),
    reportProgress: vi.fn<SystemMigrationContext['reportProgress']>(async () => undefined),
    fail: vi.fn(async (input: SystemMigrationFailureInput): Promise<never> => {
      failures = structuredClone(input.failedRecords ?? failures);
      throw new Error(input.message);
    }),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;

  return { context, failures: () => failures };
};

describe('20261111_cleanup_legacy_sandbox_resources', () => {
  const teamId = new Types.ObjectId();
  const tmbId = new Types.ObjectId();

  beforeEach(async () => {
    vi.clearAllMocks();
    await getLegacySandboxV2Collection().deleteMany({});
    await MongoSandboxInstance.deleteMany({});
    await MongoApp.deleteMany({ teamId });

    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://opensandbox.local:8080';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE = 'ghcr.io/labring/fastgpt-sandbox:v0.4.0';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX = 'fastgpt-session';
  });

  it('fast-paths empty v2 collection with cleanedCount=0 without calling external services', async () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = undefined;
    const { context } = createCleanupTestContext();

    await expect(cleanupLegacySandboxResources(context)).resolves.toEqual({
      cleanedCount: 0
    });
    expect(mocks.checkVolumeManagerHealth).not.toHaveBeenCalled();
    expect(mocks.checkOpenSandboxConnectivity).not.toHaveBeenCalled();
  });

  it('refuses to delete active legacy storage if v3 record is missing, and cleans all legacy resources once v3 exists', async () => {
    const activeApp = await MongoApp.create({
      teamId,
      tmbId,
      name: 'cleanup-guard-app',
      type: 'simple',
      modules: []
    });

    const openSandboxDocId = new Types.ObjectId();
    const sealosDocId = new Types.ObjectId();
    const now = new Date();
    const v2Col = getLegacySandboxV2Collection();

    await v2Col.insertMany([
      {
        _id: openSandboxDocId,
        provider: 'opensandbox',
        sandboxId: 'app-os-clean',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(activeApp._id),
        userId: 'u-os',
        status: 'stopped',
        lastActiveAt: now,
        createdAt: now,
        storage: {
          volumes: [
            {
              name: 'workspace',
              claimName: 'fastgpt-session-app-os-clean-oldgen',
              mountPath: '/workspace'
            }
          ]
        }
      },
      {
        _id: sealosDocId,
        provider: 'sealosdevbox',
        sandboxId: 'app-sealos-clean',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(activeApp._id),
        userId: 'u-sealos',
        status: 'archived',
        lastActiveAt: now,
        createdAt: now
      }
    ]);

    // Only create v3 record for sealosDocId first; openSandboxDocId is missing in v3 -> must block!
    await MongoSandboxInstance.create({
      sandboxId: 'app-sealos-clean',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(activeApp._id),
      userId: 'u-sealos',
      teamId: String(teamId),
      status: 'stopped',
      storage: {
        volumes: [
          {
            name: 'workspace',
            claimName: 'fastgpt-session-app-sealos-clean-v3gen',
            mountPath: '/workspace'
          }
        ]
      }
    });

    const state = createCleanupTestContext();
    await expect(cleanupLegacySandboxResources(state.context)).rejects.toThrow(
      'could not be cleaned'
    );
    expect(state.failures()).toEqual([
      expect.objectContaining({
        stageKey: 'cleanup',
        data: { id: String(openSandboxDocId) }
      })
    ]);
    // Unmigrated record preserved in v2; migrated sealos record already cleaned
    expect(await v2Col.countDocuments({})).toBe(1);
    expect(mocks.sealosDelete).toHaveBeenCalledWith('app-sealos-clean', expect.any(AbortSignal));

    // Now persist v3 record for openSandboxDocId with new JuiceFS claimName and retry
    await MongoSandboxInstance.create({
      sandboxId: 'app-os-clean',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(activeApp._id),
      userId: 'u-os',
      teamId: String(teamId),
      status: 'stopped',
      storage: {
        volumes: [
          {
            name: 'workspace',
            claimName: 'fastgpt-session-app-os-clean-v3gen',
            mountPath: '/workspace'
          }
        ]
      }
    });

    await expect(cleanupLegacySandboxResources(state.context)).resolves.toEqual({
      cleanedCount: 2
    });
    expect(await v2Col.countDocuments({})).toBe(0);
    expect(mocks.deleteLegacyVolume).toHaveBeenCalledWith(
      'fastgpt-session-app-os-clean-oldgen',
      expect.any(AbortSignal)
    );
    expect(mocks.deleteLegacyVolume).not.toHaveBeenCalledWith(
      'fastgpt-session-app-os-clean-v3gen',
      expect.anything()
    );
    expect(mocks.deleteLegacyWorkspaceArchive).toHaveBeenCalledWith('app-os-clean');
  });

  it('does not persist checkpoint when cleanup preflight fails', async () => {
    const now = new Date();
    await getLegacySandboxV2Collection().insertOne({
      _id: new Types.ObjectId(),
      provider: 'opensandbox',
      sandboxId: 'app-cleanup-preflight-fail',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(new Types.ObjectId()),
      userId: 'u-preflight',
      status: 'deleting',
      lastActiveAt: now,
      createdAt: now
    });

    mocks.checkVolumeManagerHealth.mockRejectedValueOnce(
      new Error('volume-manager health check failed with HTTP 502')
    );

    const state = createCleanupTestContext();
    await expect(cleanupLegacySandboxResources(state.context)).rejects.toThrow(
      'volume-manager health check failed with HTTP 502'
    );
    expect(state.context.saveCheckpoint).not.toHaveBeenCalled();
  });

  it('cleans malformed v2 documents whose owning App was deleted or status is deleting, while retaining the empty v2 collection', async () => {
    const deletedApp = await MongoApp.create({
      teamId,
      tmbId,
      name: 'deleted-malformed-app',
      type: 'simple',
      modules: [],
      deleteTime: new Date()
    });
    const v2Col = getLegacySandboxV2Collection();
    await v2Col.insertMany([
      {
        _id: new Types.ObjectId(),
        provider: 'opensandbox',
        sandboxId: 'app-corrupt-deleted-owner',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(deletedApp._id),
        userId: 'u-1',
        status: 'not_valid_status',
        storage: {
          volumes: [
            {
              name: 'workspace',
              claimName: 'fastgpt-session-corrupt-deleted-oldgen',
              mountPath: '/workspace'
            }
          ]
        }
      },
      {
        _id: new Types.ObjectId(),
        provider: 'unknown_corrupt_provider',
        sandboxId: 'app-corrupt-deleting',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(new Types.ObjectId()),
        status: 'deleting'
      }
    ]);

    const state = createCleanupTestContext();
    await expect(cleanupLegacySandboxResources(state.context)).resolves.toEqual({
      cleanedCount: 2
    });
    expect(await v2Col.countDocuments({})).toBe(0);
    expect(mocks.deleteLegacyVolume).toHaveBeenCalledWith(
      'fastgpt-session-corrupt-deleted-oldgen',
      expect.any(AbortSignal)
    );

    // Confirm empty collection is retained (not dropped) per upgrade policy
    const collections = await v2Col.db.listCollections({ name: v2Col.collectionName }).toArray();
    expect(collections).toHaveLength(1);
  });

  it('cleans up Old Docker OpenSandbox containers and volumes on separate legacy source cluster after migrating to New K8s', async () => {
    const prevLegacyOsUrl = process.env.AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL;
    const prevLegacyVmUrl = process.env.AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_URL;
    process.env.AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL = 'http://old-docker-os.local:8090';
    process.env.AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_URL = 'http://old-docker-vm.local:3005';

    try {
      const activeApp = await MongoApp.create({
        teamId,
        tmbId,
        name: 'cross-cleanup-app',
        type: 'simple',
        modules: []
      });
      const now = new Date();
      await getLegacySandboxV2Collection().insertOne({
        _id: new Types.ObjectId(),
        provider: 'opensandbox',
        sandboxId: 'app-cross-clean',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(activeApp._id),
        userId: 'u-cross-clean',
        status: 'running',
        lastActiveAt: now,
        createdAt: now,
        storage: {
          volumes: [
            {
              name: 'workspace',
              claimName: 'fastgpt-session-app-cross-clean-oldgen',
              mountPath: '/workspace'
            }
          ]
        }
      });
      await MongoSandboxInstance.create({
        sandboxId: 'app-cross-clean',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(activeApp._id),
        userId: 'u-cross-clean',
        teamId: String(teamId),
        status: 'stopped',
        storage: {
          volumes: [
            {
              name: 'workspace',
              claimName: 'fastgpt-session-app-cross-clean-v3gen',
              mountPath: '/workspace'
            }
          ]
        }
      });

      const state = createCleanupTestContext();
      await expect(cleanupLegacySandboxResources(state.context)).resolves.toEqual({
        cleanedCount: 1
      });
      expect(mocks.terminateLegacyOpenSandboxContainers).toHaveBeenCalledWith(
        expect.objectContaining({
          sandboxId: 'app-cross-clean',
          endpoint: expect.objectContaining({ baseUrl: 'http://old-docker-os.local:8090' })
        })
      );
      expect(mocks.deleteLegacyVolume).toHaveBeenCalledWith(
        'fastgpt-session-app-cross-clean-oldgen',
        expect.any(AbortSignal),
        expect.objectContaining({
          url: 'http://old-docker-vm.local:3005',
          allowLegacyV03Fallback: true
        })
      );
    } finally {
      if (prevLegacyOsUrl === undefined)
        delete process.env.AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL;
      else process.env.AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL = prevLegacyOsUrl;
      if (prevLegacyVmUrl === undefined) delete process.env.AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_URL;
      else process.env.AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_URL = prevLegacyVmUrl;
    }
  });

  it('matches v3 sandboxes by sandboxId without provider filter and strips legacy subPath', async () => {
    const activeApp = await MongoApp.create({
      teamId,
      tmbId,
      name: 'v3-filter-regression-app',
      type: 'simple',
      modules: []
    });
    const now = new Date();
    const rawV2Doc = {
      _id: new Types.ObjectId(),
      provider: 'opensandbox' as const,
      sandboxId: 'app-shared-sbx-id',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(activeApp._id),
      userId: 'u-legacy-user',
      status: 'running',
      lastActiveAt: now,
      createdAt: now,
      storage: {
        volumes: [
          {
            name: 'workspace',
            claimName: 'fastgpt-session-old',
            mountPath: '/workspace',
            subPath: 'nested/path'
          }
        ]
      }
    };

    const parsedV2Doc = LegacySandboxV2DocSchema.parse(rawV2Doc);
    expect(parsedV2Doc.storage?.volumes?.[0]).toEqual({
      name: 'workspace',
      claimName: 'fastgpt-session-old',
      mountPath: '/workspace'
    });
    expect('subPath' in (parsedV2Doc.storage?.volumes?.[0] ?? {})).toBe(false);

    const filter = buildMatchingV3SandboxFilter(parsedV2Doc);
    expect(JSON.stringify(filter)).not.toContain('provider');

    // v3 document has no `provider` field; even when userId differs, sandboxId branch must still match.
    await MongoSandboxInstance.create({
      sandboxId: 'app-shared-sbx-id',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(activeApp._id),
      userId: 'u-different-user',
      teamId: String(teamId),
      status: 'stopped',
      storage: {
        volumes: [
          {
            name: 'workspace',
            claimName: 'fastgpt-session-v3-new',
            mountPath: '/workspace'
          }
        ]
      }
    });

    const matchedV3 = await MongoSandboxInstance.findOne(filter).lean();
    expect(matchedV3).not.toBeNull();
    expect(matchedV3?.sandboxId).toBe('app-shared-sbx-id');
    expect(matchedV3?.storage?.volumes?.[0]?.claimName).toBe('fastgpt-session-v3-new');
  });
});
