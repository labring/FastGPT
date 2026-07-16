import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { generateSandboxId, SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  restoreSandboxWorkspaceArchiveForMigration: vi.fn(),
  getSandboxWorkspaceArchiveForMigration: vi.fn(),
  userSandboxMigration: vi.fn(),
  claimAppSandboxMigrationTarget: vi.fn(),
  claimSkillSandboxMigrationTarget: vi.fn(),
  advanceSandboxOperation: vi.fn(),
  completeSandboxOperation: vi.fn(),
  findSandboxInstanceBySource: vi.fn(),
  markSandboxOperationFailed: vi.fn(),
  buildRuntimeSandboxAdapter: vi.fn(),
  buildSandboxResourceAdapter: vi.fn(),
  ensureConnectedSandboxRunning: vi.fn(),
  deleteSessionVolume: vi.fn(),
  getSessionVolumeConfig: vi.fn(),
  downloadWorkspaceArchive: vi.fn(),
  deleteWorkspaceArchiveNow: vi.fn(),
  deleteCurrentAppSandboxes: vi.fn(),
  deleteCurrentSkillSandboxes: vi.fn(),
  withSandboxSourceMutationLease: vi.fn(),
  withSandboxLifecycleLease: vi.fn(),
  withLegacySandboxMigrationJobLease: vi.fn(),
  assertSandboxSourceActive: vi.fn(),
  assertSandboxSourceDeleted: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/archive', () => ({
  SANDBOX_STALE_ARCHIVING_MINUTES: 45,
  restoreSandboxWorkspaceArchiveForMigration: mocks.restoreSandboxWorkspaceArchiveForMigration,
  getSandboxWorkspaceArchiveForMigration: mocks.getSandboxWorkspaceArchiveForMigration
}));

vi.mock('@fastgpt/service/common/middle/tracks/utils', () => ({
  pushTrack: { userSandboxMigration: mocks.userSandboxMigration }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  deleteAppSandboxes: mocks.deleteCurrentAppSandboxes,
  deleteSkillEditSandboxes: mocks.deleteCurrentSkillSandboxes
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  advanceSandboxOperation: mocks.advanceSandboxOperation,
  claimAppSandboxMigrationTarget: mocks.claimAppSandboxMigrationTarget,
  claimSkillSandboxMigrationTarget: mocks.claimSkillSandboxMigrationTarget,
  completeSandboxOperation: mocks.completeSandboxOperation,
  findSandboxInstanceBySource: mocks.findSandboxInstanceBySource,
  markSandboxOperationFailed: mocks.markSandboxOperationFailed
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter', () => ({
  buildRuntimeSandboxAdapter: mocks.buildRuntimeSandboxAdapter,
  buildSandboxResourceAdapter: mocks.buildSandboxResourceAdapter
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/config', () => ({
  getConfiguredSandboxProvider: () => 'opensandbox'
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/lifecycle', () => ({
  ensureConnectedSandboxRunning: mocks.ensureConnectedSandboxRunning
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile', () => ({
  getSandboxRuntimeProfile: () => ({
    workDirectory: '/workspace',
    defaultImage: { repository: 'migration-image', tag: 'latest' }
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/volume/service', () => ({
  deleteSessionVolume: mocks.deleteSessionVolume,
  getSessionVolumeConfig: mocks.getSessionVolumeConfig
}));

vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({
  getS3SandboxSource: () => ({
    downloadWorkspaceArchive: mocks.downloadWorkspaceArchive,
    deleteWorkspaceArchiveNow: mocks.deleteWorkspaceArchiveNow
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/config', () => ({
  getAgentSandboxArchiveMaxBytes: () => 1024 * 1024
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxSourceMutationLease: mocks.withSandboxSourceMutationLease,
  withSandboxLifecycleLease: mocks.withSandboxLifecycleLease,
  withLegacySandboxMigrationJobLease: mocks.withLegacySandboxMigrationJobLease
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => ({
  assertSandboxSourceActive: mocks.assertSandboxSourceActive,
  assertSandboxSourceDeleted: mocks.assertSandboxSourceDeleted
}));

import {
  deleteAppSandboxesForAppDeletion,
  installLegacyWorkspaceArchive,
  migrateLegacySandboxesToUserLevel
} from '@fastgpt/service/core/ai/sandbox/application/migration';
import { MongoLegacySandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/legacySchema';

const createTargetProvider = () => ({
  provider: 'opensandbox',
  execute: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 }))
});

const createMigrationTargetDoc = (sandboxId = 'target-sandbox') =>
  ({
    _id: `id-${sandboxId}`,
    provider: 'opensandbox',
    sandboxId,
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'app-1',
    userId: 'user-1',
    status: 'legacyMigrating',
    lastActiveAt: new Date(),
    metadata: {
      operation: {
        id: `operation-${sandboxId}`,
        type: 'legacyMigration',
        phase: 'claimed',
        startedAt: new Date(),
        heartbeatAt: new Date()
      }
    }
  }) as any;

const insertLegacyApp = async (params: {
  sandboxId: string;
  sourceId?: string;
  userId?: string;
  chatId?: string;
  phase?: 'pending' | 'archiveReady' | 'installed' | 'cleanupPending';
  status?: 'running' | 'stopped';
  targetSandboxId?: string;
  lastActiveAt?: Date;
}) => {
  const sourceId = params.sourceId ?? 'app-1';
  const userId = params.userId ?? 'user-1';
  await MongoLegacySandboxInstance.collection.insertOne({
    provider: 'opensandbox',
    sandboxId: params.sandboxId,
    sourceType: ChatSourceTypeEnum.app,
    sourceId,
    userId,
    chatId: params.chatId ?? 'chat-1',
    status: params.status ?? SandboxStatusEnum.stopped,
    lastActiveAt: params.lastActiveAt ?? new Date(),
    ...(params.phase
      ? {
          metadata: {
            userLevelMigration: {
              phase: params.phase,
              targetSandboxId: params.targetSandboxId ?? `target-${sourceId}-${userId}`,
              updatedAt: new Date()
            }
          }
        }
      : {})
  });
};

const insertLegacySkill = async (params: {
  sandboxId: string;
  sourceId?: string;
  archiveState?: 'archiving' | 'deleting' | 'archived' | 'restoring' | 'failed';
}) => {
  const sourceId = params.sourceId ?? 'skill-1';
  await MongoLegacySandboxInstance.collection.insertOne({
    provider: 'opensandbox',
    sandboxId: params.sandboxId,
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId,
    status: SandboxStatusEnum.stopped,
    lastActiveAt: new Date(),
    metadata: {
      ...(params.archiveState ? { archive: { state: params.archiveState } } : {})
    }
  });
};

describe('user-level sandbox migration', () => {
  const leaseContext = {
    signal: new AbortController().signal,
    assertValid: vi.fn()
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await MongoLegacySandboxInstance.deleteMany({ sandboxId: /^migration-test-/ });
    mocks.restoreSandboxWorkspaceArchiveForMigration.mockResolvedValue(undefined);
    mocks.getSandboxWorkspaceArchiveForMigration.mockResolvedValue(Buffer.from('zip'));
    mocks.userSandboxMigration.mockResolvedValue(undefined);
    mocks.findSandboxInstanceBySource.mockResolvedValue(null);
    mocks.advanceSandboxOperation.mockResolvedValue({ status: 'legacyMigrating' });
    mocks.completeSandboxOperation.mockResolvedValue({ status: 'running' });
    mocks.markSandboxOperationFailed.mockResolvedValue(undefined);
    mocks.ensureConnectedSandboxRunning.mockResolvedValue(undefined);
    mocks.getSessionVolumeConfig.mockResolvedValue(undefined);
    mocks.deleteSessionVolume.mockResolvedValue(undefined);
    mocks.downloadWorkspaceArchive.mockResolvedValue(Buffer.from('zip'));
    mocks.deleteWorkspaceArchiveNow.mockResolvedValue(undefined);
    mocks.deleteCurrentAppSandboxes.mockResolvedValue(undefined);
    mocks.deleteCurrentSkillSandboxes.mockResolvedValue(undefined);
    mocks.assertSandboxSourceActive.mockResolvedValue(undefined);
    mocks.assertSandboxSourceDeleted.mockResolvedValue(undefined);
    mocks.buildRuntimeSandboxAdapter.mockReturnValue(createTargetProvider());
    mocks.buildSandboxResourceAdapter.mockReturnValue({
      getInfo: vi.fn(async () => null),
      delete: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined)
    });
    mocks.claimAppSandboxMigrationTarget.mockImplementation(async ({ sandboxId }: any) =>
      createMigrationTargetDoc(sandboxId)
    );
    mocks.claimSkillSandboxMigrationTarget.mockImplementation(async ({ sandboxId }: any) =>
      createMigrationTargetDoc(sandboxId)
    );
    mocks.withSandboxSourceMutationLease.mockImplementation(async ({ fn }: any) =>
      fn(leaseContext)
    );
    mocks.withSandboxLifecycleLease.mockImplementation(async ({ fn }: any) => fn(leaseContext));
    mocks.withLegacySandboxMigrationJobLease.mockImplementation(async ({ fn }: any) => fn());
  });

  it('installs a Legacy workspace into the encoded Chat session without overwriting files', async () => {
    const target = {
      provider: createTargetProvider(),
      getRuntimePaths: () => ({
        workspaceRoot: '/workspace',
        runtimeSkillsRoot: '/workspace/projects',
        sessionWorkDirectory: '/workspace/sessions/chat-1'
      })
    } as any;

    await installLegacyWorkspaceArchive({
      target,
      legacySandboxId: 'migration-test-old-1',
      chatId: 'chat/2',
      archiveBody: Buffer.from('zip')
    });

    expect(mocks.restoreSandboxWorkspaceArchiveForMigration).toHaveBeenCalledWith(
      expect.objectContaining({
        sandbox: target.provider,
        workDirectory: expect.stringMatching(/^\/workspace\/\.migration\/[0-9a-f]{40}$/),
        sandboxId: 'migration-test-old-1'
      })
    );
    const commitCommand = target.provider.execute.mock.calls[0][0] as string;
    expect(commitCommand).toContain("target='/workspace/sessions/chat%2F2'");
    expect(commitCommand).toContain('merge_without_overwrite');
    expect(commitCommand).toContain('[ ! -e "$target_path" ]');
  });

  it('dry-run validates the entire normalized Legacy table before any side effect', async () => {
    await insertLegacyApp({ sandboxId: 'migration-test-app-1' });

    const result = await migrateLegacySandboxesToUserLevel({ dryRun: true });

    expect(result).toMatchObject({
      dryRun: true,
      legacyAppCount: 1,
      appGroupCount: 1,
      migratedAppCount: 0,
      failures: []
    });
    expect(mocks.withLegacySandboxMigrationJobLease).not.toHaveBeenCalled();
    expect(mocks.claimAppSandboxMigrationTarget).not.toHaveBeenCalled();

    await MongoLegacySandboxInstance.collection.insertOne({
      provider: 'opensandbox',
      sandboxId: 'migration-test-invalid',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-invalid',
      status: 'stopped',
      lastActiveAt: new Date()
    });

    await expect(migrateLegacySandboxesToUserLevel({ dryRun: true })).rejects.toThrow(
      'Legacy Sandbox preflight validation failed for 1 record(s)'
    );
    expect(mocks.claimAppSandboxMigrationTarget).not.toHaveBeenCalled();

    await MongoLegacySandboxInstance.deleteOne({ sandboxId: 'migration-test-invalid' });
    await MongoLegacySandboxInstance.updateOne(
      { sandboxId: 'migration-test-app-1' },
      {
        $set: {
          metadata: {
            providerCreatedAt: new Date(),
            storage: {
              key: 'agent-skills/legacy-version.zip',
              uploadedAt: new Date()
            }
          }
        }
      }
    );
    await expect(migrateLegacySandboxesToUserLevel({ dryRun: true })).resolves.toMatchObject({
      legacyAppCount: 1,
      failedCount: 0
    });
    expect(mocks.claimAppSandboxMigrationTarget).not.toHaveBeenCalled();

    await MongoLegacySandboxInstance.updateOne(
      { sandboxId: 'migration-test-app-1' },
      { $set: { metadata: { archive: { state: 'invalid-state' } } } }
    );
    await expect(migrateLegacySandboxesToUserLevel({ dryRun: true })).rejects.toThrow(
      'metadata.archive.state'
    );
  });

  it('publishes running only after every Legacy workspace is installed', async () => {
    await insertLegacyApp({ sandboxId: 'migration-test-app-1', chatId: 'chat-1' });
    await insertLegacyApp({ sandboxId: 'migration-test-app-2', chatId: 'chat-2' });

    const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

    expect(result).toMatchObject({
      migratedAppCount: 2,
      completedAppGroupCount: 1,
      failedCount: 0
    });
    expect(mocks.withLegacySandboxMigrationJobLease).toHaveBeenCalledTimes(1);
    expect(mocks.advanceSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'legacyMigrating', phase: 'targetEnsured' })
    );
    expect(mocks.restoreSandboxWorkspaceArchiveForMigration).toHaveBeenCalledTimes(2);
    expect(
      mocks.restoreSandboxWorkspaceArchiveForMigration.mock.invocationCallOrder[1]
    ).toBeLessThan(mocks.completeSandboxOperation.mock.invocationCallOrder[0]);
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: 'legacyMigrating',
        status: 'running',
        touchActive: true
      })
    );
    await expect(
      MongoLegacySandboxInstance.exists({ sandboxId: /^migration-test-app-/ })
    ).resolves.toBeFalsy();
    expect(
      mocks.advanceSandboxOperation.mock.calls.filter(
        ([params]) => params.phase === 'targetEnsured'
      )
    ).toHaveLength(3);
  });

  it('installs the most recently active Legacy workspace first', async () => {
    await insertLegacyApp({
      sandboxId: 'migration-test-app-older',
      chatId: 'chat-older',
      lastActiveAt: new Date('2026-07-01T00:00:00.000Z')
    });
    await insertLegacyApp({
      sandboxId: 'migration-test-app-newer',
      chatId: 'chat-newer',
      lastActiveAt: new Date('2026-07-02T00:00:00.000Z')
    });

    await migrateLegacySandboxesToUserLevel({ dryRun: false });

    expect(
      mocks.getSandboxWorkspaceArchiveForMigration.mock.calls.map(
        ([resource]) => resource.sandboxId
      )
    ).toEqual(['migration-test-app-newer', 'migration-test-app-older']);
  });

  it('stops installing later Chat workspaces after the lifecycle lease is lost', async () => {
    await insertLegacyApp({
      sandboxId: 'migration-test-lease-app-1',
      chatId: 'chat-1',
      lastActiveAt: new Date('2026-07-02T00:00:00.000Z')
    });
    await insertLegacyApp({
      sandboxId: 'migration-test-lease-app-2',
      chatId: 'chat-2',
      lastActiveAt: new Date('2026-07-01T00:00:00.000Z')
    });
    let leaseLost = false;
    const lifecycleAssertValid = vi.fn(() => {
      if (leaseLost) throw new Error('lifecycle lease lost');
    });
    mocks.withSandboxLifecycleLease.mockImplementationOnce(async ({ fn }: any) =>
      fn({ signal: new AbortController().signal, assertValid: lifecycleAssertValid })
    );
    mocks.restoreSandboxWorkspaceArchiveForMigration.mockImplementationOnce(async () => {
      leaseLost = true;
    });

    const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

    expect(result.failures).toContainEqual({
      sandboxId: 'migration-test-lease-app-1',
      error: 'lifecycle lease lost'
    });
    expect(mocks.restoreSandboxWorkspaceArchiveForMigration).toHaveBeenCalledTimes(1);
    expect(mocks.completeSandboxOperation).not.toHaveBeenCalled();
    expect(mocks.markSandboxOperationFailed).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'legacyMigrating', error: 'lifecycle lease lost' })
    );
  });

  it('keeps Legacy data and the legacyMigrating error when publish loses its token', async () => {
    await insertLegacyApp({
      sandboxId: 'migration-test-publish-failed',
      status: SandboxStatusEnum.running
    });
    mocks.completeSandboxOperation.mockResolvedValueOnce(null);

    const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

    expect(result.failures).toContainEqual({
      sandboxId: 'migration-test-publish-failed',
      error: 'Migration target lost ownership before publish'
    });
    expect(mocks.markSandboxOperationFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'legacyMigrating',
        error: 'Migration target lost ownership before publish'
      })
    );
    await expect(
      MongoLegacySandboxInstance.exists({ sandboxId: 'migration-test-publish-failed' })
    ).resolves.toBeTruthy();
    await expect(
      MongoLegacySandboxInstance.findOne({ sandboxId: 'migration-test-publish-failed' })
        .lean()
        .then((doc) => doc?.status)
    ).resolves.toBe(SandboxStatusEnum.stopped);
    expect(mocks.buildSandboxResourceAdapter.mock.results.at(-1)?.value.stop).toHaveBeenCalledTimes(
      1
    );
  });

  it('records stop_failed_legacy when a failed Legacy App sandbox cannot be paused', async () => {
    await insertLegacyApp({
      sandboxId: 'migration-test-stop-failed',
      status: SandboxStatusEnum.running
    });
    mocks.completeSandboxOperation.mockResolvedValueOnce(null);
    mocks.buildSandboxResourceAdapter.mockReturnValueOnce({
      delete: vi.fn(async () => undefined),
      stop: vi.fn(async () => {
        throw new Error('pause failed');
      })
    });

    const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

    expect(result.failedCount).toBe(1);
    expect(mocks.userSandboxMigration).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'failure',
        sandboxId: 'migration-test-stop-failed',
        step: 'stop_failed_legacy',
        error: 'pause failed'
      })
    );
    await expect(
      MongoLegacySandboxInstance.findOne({ sandboxId: 'migration-test-stop-failed' })
        .lean()
        .then((doc) => doc?.status)
    ).resolves.toBe(SandboxStatusEnum.running);
  });

  it('only cleans installed Legacy records when the published target is archived', async () => {
    const sourceId = 'cleanup-app';
    const userId = 'cleanup-user';
    const targetSandboxId = generateSandboxId({
      sourceType: ChatSourceTypeEnum.app,
      sourceId,
      userId
    });
    await insertLegacyApp({
      sandboxId: 'migration-test-cleanup-only',
      sourceId,
      userId,
      phase: 'installed',
      targetSandboxId
    });
    mocks.findSandboxInstanceBySource.mockResolvedValueOnce({
      sandboxId: targetSandboxId,
      status: 'archived'
    });

    const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

    expect(result).toMatchObject({ migratedAppCount: 1, failedCount: 0 });
    expect(mocks.claimAppSandboxMigrationTarget).not.toHaveBeenCalled();
    expect(mocks.buildRuntimeSandboxAdapter).not.toHaveBeenCalled();
    expect(mocks.completeSandboxOperation).not.toHaveBeenCalled();
    await expect(
      MongoLegacySandboxInstance.exists({ sandboxId: 'migration-test-cleanup-only' })
    ).resolves.toBeFalsy();
  });

  it('rejects persisted Legacy phases that belong to another target sandbox', async () => {
    await insertLegacyApp({
      sandboxId: 'migration-test-wrong-target',
      phase: 'installed'
    });

    const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

    expect(result.failures).toEqual([
      expect.objectContaining({
        sandboxId: 'migration-test-wrong-target',
        error: expect.stringContaining('Legacy migration target mismatch')
      })
    ]);
    expect(mocks.claimAppSandboxMigrationTarget).not.toHaveBeenCalled();
    await expect(
      MongoLegacySandboxInstance.exists({ sandboxId: 'migration-test-wrong-target' })
    ).resolves.toBeTruthy();
  });

  it('serializes different users of the same App under one source lease', async () => {
    await insertLegacyApp({
      sandboxId: 'migration-test-user-1',
      sourceId: 'shared-app',
      userId: 'user-1'
    });
    await insertLegacyApp({
      sandboxId: 'migration-test-user-2',
      sourceId: 'shared-app',
      userId: 'user-2'
    });
    let active = 0;
    let maxActive = 0;
    mocks.withSandboxSourceMutationLease.mockImplementation(async ({ fn }: any) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        await Promise.resolve();
        return await fn(leaseContext);
      } finally {
        active -= 1;
      }
    });

    const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

    expect(result.completedAppGroupCount).toBe(2);
    expect(maxActive).toBe(1);
  });

  it('moves a Legacy Skill Workspace to the new deterministic sandboxId before publishing', async () => {
    const sourceId = 'skill-1';
    const targetSandboxId = generateSandboxId({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId,
      userId: ChatSourceTypeEnum.skillEdit
    });
    await insertLegacySkill({ sandboxId: 'migration-test-skill-1', sourceId });

    const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

    expect(result.migratedSkillCount).toBe(1);
    expect(mocks.claimSkillSandboxMigrationTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: targetSandboxId,
        sourceId,
        metadata: expect.objectContaining({
          image: { repository: 'migration-image', tag: 'latest' }
        })
      })
    );
    expect(mocks.getSandboxWorkspaceArchiveForMigration).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: 'migration-test-skill-1' })
    );
    expect(mocks.restoreSandboxWorkspaceArchiveForMigration).toHaveBeenCalledWith(
      expect.objectContaining({
        workDirectory: '/workspace',
        sandboxId: 'migration-test-skill-1'
      })
    );
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: 'legacyMigrating',
        status: 'running',
        touchActive: true
      })
    );
    await expect(
      MongoLegacySandboxInstance.exists({ sandboxId: 'migration-test-skill-1' })
    ).resolves.toBeFalsy();
  });

  it('re-deletes the old Skill resource when Legacy archiving stopped in deleting', async () => {
    const legacyResource = {
      getInfo: vi.fn(async () => null),
      delete: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined)
    };
    mocks.buildSandboxResourceAdapter.mockReturnValue(legacyResource);
    await insertLegacySkill({
      sandboxId: 'migration-test-skill-deleting',
      archiveState: 'deleting'
    });

    const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

    expect(result).toMatchObject({ migratedSkillCount: 1, failedCount: 0 });
    expect(mocks.getSandboxWorkspaceArchiveForMigration).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: 'migration-test-skill-deleting',
        metadata: expect.objectContaining({ archive: { state: 'deleting' } })
      })
    );
    expect(legacyResource.delete).toHaveBeenCalledTimes(1);
    await expect(
      MongoLegacySandboxInstance.exists({ sandboxId: 'migration-test-skill-deleting' })
    ).resolves.toBeFalsy();
  });

  it('keeps a failed Legacy Skill archive without creating a v2 target', async () => {
    await insertLegacySkill({
      sandboxId: 'migration-test-skill-failed',
      archiveState: 'failed'
    });

    const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

    expect(result).toMatchObject({ migratedSkillCount: 0, failedCount: 1 });
    expect(result.failures[0]).toEqual(
      expect.objectContaining({
        sandboxId: 'migration-test-skill-failed',
        error: expect.stringContaining('archive is failed')
      })
    );
    expect(mocks.claimSkillSandboxMigrationTarget).not.toHaveBeenCalled();
    await expect(
      MongoLegacySandboxInstance.exists({ sandboxId: 'migration-test-skill-failed' })
    ).resolves.toBeTruthy();
  });

  it('deletes only normalized Legacy App records under the source lease', async () => {
    await insertLegacyApp({
      sandboxId: 'migration-test-delete-app',
      sourceId: 'app-delete',
      userId: 'user-delete'
    });

    await deleteAppSandboxesForAppDeletion('app-delete');

    expect(mocks.withSandboxSourceMutationLease).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-delete',
        label: 'delete-app-sandboxes:app-delete'
      })
    );
    expect(mocks.deleteCurrentAppSandboxes).toHaveBeenCalledWith('app-delete');
    expect(mocks.assertSandboxSourceDeleted).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-delete'
    });
    await expect(
      MongoLegacySandboxInstance.exists({ sandboxId: 'migration-test-delete-app' })
    ).resolves.toBeFalsy();
  });
});
