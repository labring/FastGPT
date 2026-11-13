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
  ensureSessionVolume: vi.fn(async (claimName: string) => claimName),
  unmountSessionVolume: vi.fn(async () => undefined),
  deleteSessionVolume: vi.fn(async () => undefined),
  checkVolumeManagerHealth: vi.fn(async () => undefined),
  checkLegacyVolumeExists: vi.fn(async () => true),
  checkOpenSandboxConnectivity: vi.fn(async () => undefined),
  terminateLegacyOpenSandboxContainers: vi.fn(async () => 1),
  withLegacyExportOpenSandbox: vi.fn(),
  withTemporaryMigrationSandbox: vi.fn(),
  inspectLegacyWorkspaceArchive: vi.fn(),
  openLegacyWorkspaceArchiveWebStream: vi.fn(),
  sealosResumeAndWaitReady: vi.fn(async () => undefined),
  sealosExec: vi.fn(async () => ({ exitCode: 0, stdout: 'EMPTY_WORKDIR\n', stderr: '' })),
  sealosDownloadStream: vi.fn(
    async () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        }
      })
  ),
  sealosPause: vi.fn(async () => undefined)
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
      ensureSessionVolume: mocks.ensureSessionVolume,
      unmountSessionVolume: mocks.unmountSessionVolume,
      deleteSessionVolume: mocks.deleteSessionVolume
    };
  }
);

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/volume/config', () => ({
  getVolumeManagerEnvConfig: () => ({
    url: 'http://volume-manager.local:3000',
    token: 'vm-secret-token',
    volumeNamePrefix: 'fastgpt-session',
    storageSize: '2Gi'
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxLifecycleLease: async <T>(params: {
    fn: (ctx: { assertValid: () => void }) => Promise<T>;
  }) => params.fn({ assertValid: () => undefined })
}));

vi.mock('@/migration/tasks/4180/sandbox_migration_shared/legacyVolumeClient', () => ({
  checkVolumeManagerHealth: mocks.checkVolumeManagerHealth,
  checkLegacyVolumeExists: mocks.checkLegacyVolumeExists,
  deleteLegacyVolume: vi.fn(async () => undefined)
}));

vi.mock('@fastgpt/service/core/ai/sandbox/legacy/legacyOpenSandbox', () => ({
  LEGACY_WORKSPACE_MOUNT_PATH: '/legacy-workspace',
  checkOpenSandboxConnectivity: mocks.checkOpenSandboxConnectivity,
  terminateLegacyOpenSandboxContainers: mocks.terminateLegacyOpenSandboxContainers,
  withLegacyExportOpenSandbox: mocks.withLegacyExportOpenSandbox,
  withTemporaryMigrationSandbox: mocks.withTemporaryMigrationSandbox
}));

vi.mock('@/migration/tasks/4180/sandbox_migration_shared/legacyArchiveS3', () => ({
  inspectLegacyWorkspaceArchive: mocks.inspectLegacyWorkspaceArchive,
  openLegacyWorkspaceArchiveWebStream: mocks.openLegacyWorkspaceArchiveWebStream,
  deleteLegacyWorkspaceArchive: vi.fn(async () => undefined)
}));

vi.mock('@/migration/tasks/4180/sandbox_migration_shared/sealosClient', () => ({
  createLegacySealosClientFromEnv: () => ({
    resumeAndWaitReady: mocks.sealosResumeAndWaitReady,
    exec: mocks.sealosExec,
    downloadFileWebStream: mocks.sealosDownloadStream,
    pause: mocks.sealosPause,
    delete: vi.fn(async () => undefined)
  })
}));

import { getLegacySandboxV2Collection } from '@/migration/tasks/4180/sandbox_migration_shared/legacySchema';
import { migrateSandboxToJuicefs } from '@/migration/tasks/4180/20261111_migrate_sandbox_to_juicefs';

const createMigrationTestContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  let failures: SystemMigrationFailedRecord[] = [];
  const callOrder: string[] = [];

  const context = {
    migrationId: '20261111_migrate_sandbox_to_juicefs',
    runId: 'test-run-1',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint ? schema.parse(structuredClone(checkpoint)) : undefined,
    saveCheckpoint: vi.fn(async (value: Record<string, unknown>) => {
      callOrder.push('saveCheckpoint');
      checkpoint = structuredClone(value);
    }),
    getFailedRecords: async () => structuredClone(failures),
    reportFailedRecords: vi.fn(async (value: SystemMigrationFailedRecord[]) => {
      callOrder.push('reportFailedRecords');
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

  return { context, failures: () => failures, callOrder };
};

describe('20261111_migrate_sandbox_to_juicefs', () => {
  const teamId = new Types.ObjectId();
  const tmbId = new Types.ObjectId();

  beforeEach(async () => {
    vi.clearAllMocks();
    await getLegacySandboxV2Collection().deleteMany({});
    await MongoSandboxInstance.deleteMany({});
    await MongoApp.deleteMany({ teamId });

    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://opensandbox.local:8080';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE = 'ghcr.io/labring/fastgpt-sandbox:v0.4.0';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME = 'kubernetes';

    mocks.withTemporaryMigrationSandbox.mockImplementation(async ({ fn }) =>
      fn({
        exec: vi.fn(async () => ({ stdout: '', stderr: '' })),
        uploadStream: vi.fn(async () => undefined),
        createDirectories: vi.fn(async () => undefined),
        setPermissions: vi.fn(async () => undefined)
      })
    );
    mocks.inspectLegacyWorkspaceArchive.mockResolvedValue({
      exists: true,
      key: 'sandbox/archive/sbx/package.zip',
      isEmptyZip: false
    });
    mocks.openLegacyWorkspaceArchiveWebStream.mockResolvedValue({
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        }
      }),
      close: vi.fn()
    });
  });

  it('fast-paths empty v2 collection without requiring sandbox environment or preflight connectivity', async () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = undefined;
    const { context } = createMigrationTestContext();

    await expect(migrateSandboxToJuicefs(context)).resolves.toEqual({
      migratedCount: 0,
      skippedCount: 0
    });
    expect(mocks.checkOpenSandboxConnectivity).not.toHaveBeenCalled();
    expect(mocks.checkVolumeManagerHealth).not.toHaveBeenCalled();
  });

  it('migrates OpenSandbox volume, S3 archive, and Sealos Devbox sources into v3 while skipping deleted apps and preserving v2 docs', async () => {
    const activeApp = await MongoApp.create({
      teamId,
      tmbId,
      name: 'active-sandbox-app',
      type: 'simple',
      modules: []
    });
    const deletedApp = await MongoApp.create({
      teamId,
      tmbId,
      name: 'deleted-sandbox-app',
      type: 'simple',
      modules: [],
      deleteTime: new Date()
    });

    const v2Col = getLegacySandboxV2Collection();
    const now = new Date('2026-11-10T00:00:00.000Z');
    await v2Col.insertMany([
      {
        _id: new Types.ObjectId(),
        provider: 'opensandbox',
        sandboxId: 'app-os-vol',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(activeApp._id),
        userId: 'u-vol',
        status: 'running',
        lastActiveAt: now,
        createdAt: now,
        image: { repository: 'old-repo/sandbox', tag: 'v0.2.0' },
        limit: { cpuCount: 2, memoryMiB: 2048, storageSize: '5Gi' },
        versionId: '507f1f77bcf86cd799439099',
        storage: {
          volumes: [
            {
              name: 'workspace',
              claimName: 'fastgpt-session-app-os-vol-legacy',
              mountPath: '/workspace'
            }
          ]
        }
      },
      {
        _id: new Types.ObjectId(),
        provider: 'opensandbox',
        sandboxId: 'app-s3-zip',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(activeApp._id),
        userId: 'u-s3',
        status: 'archived',
        lastActiveAt: now,
        createdAt: now
      },
      {
        _id: new Types.ObjectId(),
        provider: 'sealosdevbox',
        sandboxId: 'app-sealos-1',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(activeApp._id),
        userId: 'u-sealos',
        status: 'stopped',
        lastActiveAt: now,
        createdAt: now
      },
      {
        _id: new Types.ObjectId(),
        provider: 'opensandbox',
        sandboxId: 'app-deleted-src',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(deletedApp._id),
        userId: 'u-del',
        status: 'stopped',
        lastActiveAt: now,
        createdAt: now
      },
      {
        _id: new Types.ObjectId(),
        provider: 'opensandbox',
        sandboxId: 'app-deleting-state',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(activeApp._id),
        userId: 'u-deleting',
        status: 'deleting',
        lastActiveAt: now,
        createdAt: now
      }
    ]);

    const { context } = createMigrationTestContext();
    const result = await migrateSandboxToJuicefs(context);
    expect(result).toEqual({ migratedCount: 3, skippedCount: 2 });

    // v2 documents are completely preserved for rollback before Task 2
    expect(await v2Col.countDocuments({})).toBe(5);

    // v3 contains the 3 active migrated records in stopped status with string image and new JuiceFS claimName
    const v3Docs = await MongoSandboxInstance.find({}).lean();
    expect(v3Docs).toHaveLength(3);
    for (const v3Doc of v3Docs) {
      expect(v3Doc.status).toBe('stopped');
      expect(v3Doc.instanceId).toBeUndefined();
      expect(v3Doc.image).toBe('ghcr.io/labring/fastgpt-sandbox:v0.4.0');
      expect(v3Doc.teamId).toBe(String(teamId));
      const newClaim = v3Doc.storage?.volumes?.[0]?.claimName;
      expect(newClaim).toMatch(/^fastgpt-session-/);
      expect(newClaim).not.toBe('fastgpt-session-app-os-vol-legacy');
    }
    const migratedOsVol = v3Docs.find((doc) => doc.sandboxId === 'app-os-vol');
    expect(migratedOsVol?.resourceLimits).toEqual({
      cpuCount: 2,
      memoryMiB: 2048
    });
    expect(migratedOsVol?.context).toEqual({
      skillVersionId: '507f1f77bcf86cd799439099'
    });

    expect(mocks.openLegacyWorkspaceArchiveWebStream).toHaveBeenCalledWith(
      'sandbox/archive/sbx/package.zip'
    );
    expect(mocks.sealosResumeAndWaitReady).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'app-sealos-1' })
    );
    expect(mocks.sealosPause).toHaveBeenCalledWith('app-sealos-1');

    const tempCallsBySandbox = new Map(
      mocks.withTemporaryMigrationSandbox.mock.calls.map((call) => [call[0].sandboxId, call[0]])
    );
    expect(
      tempCallsBySandbox.get('app-os-vol')?.ephemeralStorageWorkspaceMultiplier
    ).toBeUndefined();
    expect(tempCallsBySandbox.get('app-s3-zip')?.ephemeralStorageWorkspaceMultiplier).toBe(2);
    expect(tempCallsBySandbox.has('app-sealos-1')).toBe(false);
  });

  it('persists failedRecords before checkpoint and recovers cleanly on retry without duplicating volumes', async () => {
    const activeApp = await MongoApp.create({
      teamId,
      tmbId,
      name: 'retry-sandbox-app',
      type: 'simple',
      modules: []
    });

    const badId = new Types.ObjectId();
    const goodId = new Types.ObjectId();
    const now = new Date();
    await getLegacySandboxV2Collection().insertMany([
      {
        _id: badId,
        provider: 'opensandbox',
        sandboxId: 'app-missing-pvc',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(activeApp._id),
        userId: 'u-bad',
        status: 'stopped',
        lastActiveAt: now,
        createdAt: now,
        storage: {
          volumes: [
            {
              name: 'workspace',
              claimName: 'fastgpt-session-missing-pvc',
              mountPath: '/workspace'
            }
          ]
        }
      },
      {
        _id: goodId,
        provider: 'opensandbox',
        sandboxId: 'app-good-pvc',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(activeApp._id),
        userId: 'u-good',
        status: 'stopped',
        lastActiveAt: now,
        createdAt: now,
        storage: {
          volumes: [
            {
              name: 'workspace',
              claimName: 'fastgpt-session-good-pvc',
              mountPath: '/workspace'
            }
          ]
        }
      }
    ]);

    mocks.checkLegacyVolumeExists.mockImplementation(
      async (claimName: string) => claimName !== 'fastgpt-session-missing-pvc'
    );

    const state = createMigrationTestContext();
    await expect(migrateSandboxToJuicefs(state.context)).rejects.toThrow('require repair');

    // Verify reportFailedRecords was persisted BEFORE saveCheckpoint
    expect(state.callOrder.indexOf('reportFailedRecords')).toBeLessThan(
      state.callOrder.lastIndexOf('saveCheckpoint')
    );
    expect(state.failures()).toEqual([
      expect.objectContaining({
        stageKey: 'instances',
        data: { id: String(badId) }
      })
    ]);
    // Good record already committed to v3
    expect(await MongoSandboxInstance.countDocuments({})).toBe(1);

    // Repair missing PVC and retry
    mocks.checkLegacyVolumeExists.mockResolvedValue(true);
    await expect(migrateSandboxToJuicefs(state.context)).resolves.toEqual({
      migratedCount: 2,
      skippedCount: 0
    });
    expect(state.failures()).toEqual([]);
    expect(await MongoSandboxInstance.countDocuments({})).toBe(2);
  });

  it('retries truncated Sealos Devbox tar downloads until container byte size matches expected bytes', async () => {
    const activeApp = await MongoApp.create({
      teamId,
      tmbId,
      name: 'sealos-retry-app',
      type: 'simple',
      modules: []
    });

    const now = new Date();
    await getLegacySandboxV2Collection().insertOne({
      _id: new Types.ObjectId(),
      provider: 'sealosdevbox',
      sandboxId: 'app-sealos-truncated',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(activeApp._id),
      userId: 'u-sealos-retry',
      status: 'stopped',
      lastActiveAt: now,
      createdAt: now
    });

    mocks.sealosExec.mockImplementation(async ({ command }: { command: string[] }) => {
      if (command[0] === 'rm') return { exitCode: 0, stdout: '', stderr: '' };
      return { exitCode: 0, stdout: '  176\n', stderr: '' };
    });

    let wcCalls = 0;
    const execMock = vi.fn(async (cmd: string) => {
      if (cmd.startsWith('wc -c <')) {
        wcCalls += 1;
        return { stdout: wcCalls === 1 ? '0\n' : '176\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });
    const uploadMock = vi.fn(async () => undefined);
    mocks.withTemporaryMigrationSandbox.mockImplementation(async ({ fn }) =>
      fn({
        exec: execMock,
        uploadStream: uploadMock,
        createDirectories: vi.fn(async () => undefined),
        setPermissions: vi.fn(async () => undefined)
      })
    );

    const { context } = createMigrationTestContext();
    await expect(migrateSandboxToJuicefs(context)).resolves.toEqual({
      migratedCount: 1,
      skippedCount: 0
    });
    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(wcCalls).toBe(2);
    expect(mocks.withTemporaryMigrationSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: 'app-sealos-truncated',
        ephemeralStorageWorkspaceMultiplier: 2
      })
    );
  });

  it('does not freeze checkpoint when preflight fails, preserving empty-table fast path if v2 is later cleared', async () => {
    const activeApp = await MongoApp.create({
      teamId,
      tmbId,
      name: 'preflight-fail-app',
      type: 'simple',
      modules: []
    });
    const now = new Date();
    await getLegacySandboxV2Collection().insertOne({
      _id: new Types.ObjectId(),
      provider: 'opensandbox',
      sandboxId: 'app-preflight-fail',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(activeApp._id),
      userId: 'u-preflight',
      status: 'stopped',
      lastActiveAt: now,
      createdAt: now
    });

    mocks.checkVolumeManagerHealth.mockRejectedValueOnce(
      new Error('volume-manager health check failed with HTTP 503')
    );

    const state = createMigrationTestContext();
    await expect(migrateSandboxToJuicefs(state.context)).rejects.toThrow(
      'volume-manager health check failed with HTTP 503'
    );
    expect(state.context.saveCheckpoint).not.toHaveBeenCalled();

    // If legacy rows are dropped before retry, empty-table fast path still works without credentials
    await getLegacySandboxV2Collection().deleteMany({});
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = undefined;
    await expect(migrateSandboxToJuicefs(state.context)).resolves.toEqual({
      migratedCount: 0,
      skippedCount: 0
    });
  });

  it('rolls back newly created JuiceFS volume when mid-extraction fails and cleans orphan target volume if app is deleted before retry', async () => {
    const brokenApp = await MongoApp.create({
      teamId,
      tmbId,
      name: 'corrupted-zip-app',
      type: 'simple',
      modules: []
    });
    const now = new Date();
    const docId = new Types.ObjectId();
    await getLegacySandboxV2Collection().insertOne({
      _id: docId,
      provider: 'opensandbox',
      sandboxId: 'app-corrupt-zip',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(brokenApp._id),
      userId: 'u-corrupt',
      status: 'archived',
      lastActiveAt: now,
      createdAt: now
    });

    mocks.withTemporaryMigrationSandbox.mockRejectedValueOnce(
      new Error('Migration container command failed (1): zipfile.BadZipFile: Bad CRC-32 for file')
    );

    const state = createMigrationTestContext();
    await expect(migrateSandboxToJuicefs(state.context)).rejects.toThrow('require repair');

    // Target JuiceFS volume was created and immediately rolled back on failure
    expect(mocks.ensureSessionVolume).toHaveBeenCalledTimes(1);
    const createdClaimName = mocks.ensureSessionVolume.mock.calls[0]?.[0];
    expect(mocks.deleteSessionVolume).toHaveBeenCalledWith(createdClaimName);
    expect(await MongoSandboxInstance.countDocuments({})).toBe(0);

    // Admin deletes the broken app instead of repairing the archive, then retries
    mocks.deleteSessionVolume.mockClear();
    await MongoApp.updateOne({ _id: brokenApp._id }, { $set: { deleteTime: new Date() } });
    await expect(migrateSandboxToJuicefs(state.context)).resolves.toEqual({
      migratedCount: 0,
      skippedCount: 1
    });
    expect(mocks.deleteSessionVolume).toHaveBeenCalledWith(createdClaimName);
  });

  it('reports readable Zod field errors on corrupted v2 docs and catches missing active v3 docs in validation stage', async () => {
    const activeApp = await MongoApp.create({
      teamId,
      tmbId,
      name: 'corrupt-and-validation-app',
      type: 'simple',
      modules: []
    });
    const corruptId = new Types.ObjectId();
    const validId = new Types.ObjectId();
    const now = new Date();
    const v2Col = getLegacySandboxV2Collection();

    await v2Col.insertMany([
      {
        _id: corruptId,
        provider: 'opensandbox',
        sandboxId: 'app-corrupt-doc',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(activeApp._id),
        userId: 'u-corrupt-doc',
        status: 'not_a_valid_status',
        lastActiveAt: now,
        createdAt: now
      },
      {
        _id: validId,
        provider: 'opensandbox',
        sandboxId: 'app-partial-limit',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(activeApp._id),
        userId: 'u-partial-limit',
        status: 'stopped',
        lastActiveAt: now,
        createdAt: now,
        limit: { cpuCount: 4 },
        storage: { volumes: [{ name: 'workspace', claimName: 'fastgpt-session-partial-legacy' }] }
      }
    ]);

    const state = createMigrationTestContext();
    await expect(migrateSandboxToJuicefs(state.context)).rejects.toThrow('require repair');
    const failureReason = state.failures()[0]?.reason.message ?? '';
    expect(failureReason).toContain('status:');
    expect(failureReason).not.toBe('[ -> ]');

    // Fix corrupted status in DB, but simulate accidental deletion of the already-migrated v3 doc before validation
    await v2Col.updateOne({ _id: corruptId }, { $set: { status: 'deleting' } });
    await MongoSandboxInstance.deleteMany({ sandboxId: 'app-partial-limit' });

    await expect(migrateSandboxToJuicefs(state.context)).rejects.toThrow(
      'validation detected unmigrated active records'
    );
    expect(state.failures()).toEqual([
      expect.objectContaining({
        stageKey: 'validation',
        data: { id: String(validId) }
      })
    ]);

    // Retrying automatically re-migrates the validation failure and succeeds
    await expect(migrateSandboxToJuicefs(state.context)).resolves.toEqual({
      migratedCount: 2,
      skippedCount: 1
    });
    expect(await MongoSandboxInstance.exists({ sandboxId: 'app-partial-limit' })).toBeTruthy();
  });

  it('blocks active legacyMigrating record on first run, then skips cleanly when its App is soft-deleted', async () => {
    const legacyV1App = await MongoApp.create({
      teamId,
      tmbId,
      name: 'legacy-v1-stuck-app',
      type: 'simple',
      modules: []
    });
    const stuckId = new Types.ObjectId();
    const now = new Date();
    const v2Col = getLegacySandboxV2Collection();

    await v2Col.insertOne({
      _id: stuckId,
      provider: 'opensandbox',
      sandboxId: 'app-stuck-v1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(legacyV1App._id),
      userId: 'u-stuck-v1',
      status: 'legacyMigrating',
      lastActiveAt: now,
      createdAt: now
    });

    const state = createMigrationTestContext();
    await expect(migrateSandboxToJuicefs(state.context)).rejects.toThrow('require repair');
    expect(state.failures()[0]?.reason.message).toContain('legacyMigrating');

    // Admin deletes the obsolete App in Studio and retries migration
    await MongoApp.updateOne({ _id: legacyV1App._id }, { $set: { deleteTime: new Date() } });
    await expect(migrateSandboxToJuicefs(state.context)).resolves.toEqual({
      migratedCount: 0,
      skippedCount: 1
    });
  });

  it('fast-paths without external preflight when v2 only contains deleting or soft-deleted-source records, counts already_migrated as skipped, and pauses Sealos Devbox even if resumeAndWaitReady times out', async () => {
    // 1. Only deleting + soft-deleted App records in v2 -> skip preflight connectivity checks
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = undefined;
    const deletedApp = await MongoApp.create({
      teamId,
      tmbId,
      name: 'soft-deleted-fast-path-app',
      type: 'simple',
      modules: [],
      deleteTime: new Date()
    });
    const v2Col = getLegacySandboxV2Collection();
    const now = new Date();
    await v2Col.insertMany([
      {
        _id: new Types.ObjectId(),
        provider: 'opensandbox',
        sandboxId: 'app-only-deleting',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(new Types.ObjectId()),
        userId: 'u-del',
        status: 'deleting',
        lastActiveAt: now,
        createdAt: now
      },
      {
        _id: new Types.ObjectId(),
        provider: 'opensandbox',
        sandboxId: 'app-soft-deleted-orphan',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(deletedApp._id),
        userId: 'u-orphan',
        status: 'stopped',
        lastActiveAt: now,
        createdAt: now
      }
    ]);

    const fastState = createMigrationTestContext();
    await expect(migrateSandboxToJuicefs(fastState.context)).resolves.toEqual({
      migratedCount: 0,
      skippedCount: 2
    });
    expect(mocks.checkOpenSandboxConnectivity).not.toHaveBeenCalled();
    expect(mocks.checkVolumeManagerHealth).not.toHaveBeenCalled();

    // 2. Pre-existing v3 record (already_migrated) increments skippedCount rather than migratedCount
    await v2Col.deleteMany({});
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://opensandbox.local:8080';
    const preMigratedApp = await MongoApp.create({
      teamId,
      tmbId,
      name: 'pre-migrated-app',
      type: 'simple',
      modules: []
    });
    await v2Col.insertOne({
      _id: new Types.ObjectId(),
      provider: 'opensandbox',
      sandboxId: 'app-already-in-v3',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(preMigratedApp._id),
      userId: 'u-already',
      status: 'stopped',
      lastActiveAt: now,
      createdAt: now
    });
    await MongoSandboxInstance.create({
      sandboxId: 'app-already-in-v3',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(preMigratedApp._id),
      userId: 'u-already',
      status: 'stopped',
      lastActiveAt: now,
      createdAt: now,
      storage: {
        volumes: [
          {
            name: 'workspace',
            claimName: 'fastgpt-session-preexisting',
            mountPath: '/workspace'
          }
        ]
      },
      teamId: String(teamId),
      image: 'ghcr.io/labring/fastgpt-sandbox:v0.4.0'
    });

    const alreadyState = createMigrationTestContext();
    await expect(migrateSandboxToJuicefs(alreadyState.context)).resolves.toEqual({
      migratedCount: 0,
      skippedCount: 1
    });

    // 3. Sealos Devbox resumeAndWaitReady timeout still triggers pause() in finally
    await v2Col.deleteMany({});
    await MongoSandboxInstance.deleteMany({});
    const activeApp = await MongoApp.create({
      teamId,
      tmbId,
      name: 'sealos-timeout-app',
      type: 'simple',
      modules: []
    });
    await v2Col.insertOne({
      _id: new Types.ObjectId(),
      provider: 'sealosdevbox',
      sandboxId: 'app-sealos-timeout',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: String(activeApp._id),
      userId: 'u-timeout',
      status: 'stopped',
      lastActiveAt: now,
      createdAt: now
    });
    mocks.sealosResumeAndWaitReady.mockRejectedValueOnce(
      new Error('Timed out waiting for Sealos Devbox app-sealos-timeout exec channel')
    );

    const timeoutState = createMigrationTestContext();
    await expect(migrateSandboxToJuicefs(timeoutState.context)).rejects.toThrow('require repair');
    expect(mocks.sealosPause).toHaveBeenCalledWith('app-sealos-timeout');
  });

  it('migrates Old Docker OpenSandbox volumes across clusters into New K8s JuiceFS PVC via streaming export', async () => {
    const prevLegacyOsUrl = process.env.AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL;
    const prevLegacyVmUrl = process.env.AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_URL;
    process.env.AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL = 'http://old-docker-os.local:8090';
    process.env.AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_URL = 'http://old-docker-vm.local:3005';

    try {
      const activeApp = await MongoApp.create({
        teamId,
        tmbId,
        name: 'docker-to-k8s-app',
        type: 'simple',
        modules: []
      });
      const now = new Date();
      await getLegacySandboxV2Collection().insertOne({
        _id: new Types.ObjectId(),
        provider: 'opensandbox',
        sandboxId: 'app-docker-to-k8s',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(activeApp._id),
        userId: 'u-cross',
        status: 'running',
        lastActiveAt: now,
        createdAt: now,
        storage: {
          volumes: [
            {
              name: 'workspace',
              claimName: 'fastgpt-session-app-docker-to-k8s-old',
              mountPath: '/workspace'
            }
          ]
        }
      });

      const exportExec = vi.fn(async () => ({ stdout: '[]', stderr: '' }));
      const listDirectory = vi.fn(async (dirPath: string, depth?: number) => {
        if (dirPath === '/legacy-workspace' && depth === 1) {
          return [
            { path: '/legacy-workspace/sessions', type: 'directory' as const, mode: 755 },
            { path: '/legacy-workspace/projects', type: 'directory' as const, mode: 755 }
          ];
        }
        if (dirPath === '/legacy-workspace/sessions') {
          return [
            {
              path: '/legacy-workspace/sessions/note.txt',
              type: 'file' as const,
              size: 248,
              mode: 644
            }
          ];
        }
        return [];
      });
      const openFileStream = vi.fn(() => {
        return new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(248));
            controller.close();
          }
        });
      });
      mocks.withLegacyExportOpenSandbox.mockImplementation(async ({ fn }) =>
        fn({ exec: exportExec, listDirectory, openFileStream })
      );

      const importExec = vi.fn(async () => ({ stdout: '', stderr: '' }));
      const uploadStream = vi.fn(async () => undefined);
      const createDirectories = vi.fn(async () => undefined);
      const setPermissions = vi.fn(async () => undefined);
      mocks.withTemporaryMigrationSandbox.mockImplementation(async ({ fn }) =>
        fn({
          exec: importExec,
          uploadStream,
          createDirectories,
          setPermissions
        })
      );

      const { context } = createMigrationTestContext();
      await expect(migrateSandboxToJuicefs(context)).resolves.toEqual({
        migratedCount: 1,
        skippedCount: 0
      });

      expect(mocks.checkVolumeManagerHealth).toHaveBeenCalledWith(
        expect.any(AbortSignal),
        expect.objectContaining({ url: 'http://old-docker-vm.local:3005' })
      );
      expect(mocks.checkOpenSandboxConnectivity).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'http://old-docker-os.local:8090',
          runtime: 'docker'
        })
      );
      expect(mocks.terminateLegacyOpenSandboxContainers).toHaveBeenCalledWith(
        expect.objectContaining({
          sandboxId: 'app-docker-to-k8s',
          endpoint: expect.objectContaining({ baseUrl: 'http://old-docker-os.local:8090' })
        })
      );
      expect(mocks.withLegacyExportOpenSandbox).toHaveBeenCalledWith(
        expect.objectContaining({
          sandboxId: 'app-docker-to-k8s',
          legacyClaimName: 'fastgpt-session-app-docker-to-k8s-old'
        })
      );
      expect(exportExec).not.toHaveBeenCalled();
      expect(createDirectories).toHaveBeenCalledWith([
        { path: '/workspace/projects', mode: 755 },
        { path: '/workspace/sessions', mode: 755 }
      ]);
      expect(openFileStream).toHaveBeenCalledWith('/legacy-workspace/sessions/note.txt');
      expect(uploadStream).toHaveBeenCalledWith(
        '/workspace/sessions/note.txt',
        expect.any(ReadableStream),
        644
      );

      const v3Doc = await MongoSandboxInstance.findOne({ sandboxId: 'app-docker-to-k8s' }).lean();
      expect(v3Doc?.status).toBe('stopped');
      expect(v3Doc?.storage?.volumes?.[0]?.claimName).not.toBe(
        'fastgpt-session-app-docker-to-k8s-old'
      );

      // Empty cross-runtime workspace skips launching target temporary sandbox while initializing empty v3 volume
      vi.clearAllMocks();
      await getLegacySandboxV2Collection().deleteMany({});
      await MongoSandboxInstance.deleteMany({});
      await getLegacySandboxV2Collection().insertOne({
        _id: new Types.ObjectId(),
        provider: 'opensandbox',
        sandboxId: 'app-docker-empty',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: String(activeApp._id),
        userId: 'u-cross-empty',
        status: 'running',
        lastActiveAt: now,
        createdAt: now,
        storage: {
          volumes: [
            {
              name: 'workspace',
              claimName: 'fastgpt-session-app-docker-empty-old',
              mountPath: '/workspace'
            }
          ]
        }
      });
      mocks.withLegacyExportOpenSandbox.mockImplementation(async ({ fn }) =>
        fn({
          exec: exportExec,
          listDirectory: vi.fn(async () => [
            { path: '/legacy-workspace/lost+found', type: 'directory' as const, mode: 700 },
            { path: '/legacy-workspace/.config', type: 'directory' as const, mode: 755 }
          ]),
          openFileStream
        })
      );
      const emptyCtx = createMigrationTestContext();
      await expect(migrateSandboxToJuicefs(emptyCtx.context)).resolves.toEqual({
        migratedCount: 1,
        skippedCount: 0
      });
      expect(mocks.ensureSessionVolume).toHaveBeenCalledTimes(1);
      expect(mocks.withTemporaryMigrationSandbox).not.toHaveBeenCalled();
    } finally {
      if (prevLegacyOsUrl === undefined)
        delete process.env.AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL;
      else process.env.AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL = prevLegacyOsUrl;
      if (prevLegacyVmUrl === undefined) delete process.env.AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_URL;
      else process.env.AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_URL = prevLegacyVmUrl;
    }
  });
});
