import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { generateSandboxId, SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  restoreSandboxWorkspaceArchiveForMigration: vi.fn(),
  getSandboxWorkspaceArchiveForMigration: vi.fn(),
  userSandboxMigration: vi.fn(),
  findSandboxInstanceBySource: vi.fn(),
  buildRuntimeSandboxAdapter: vi.fn(),
  buildSandboxResourceAdapter: vi.fn(),
  ensureConnectedSandboxRunning: vi.fn(),
  disconnectSandbox: vi.fn(),
  deleteSessionVolume: vi.fn(),
  getSessionVolumeConfig: vi.fn(),
  downloadWorkspaceArchive: vi.fn(),
  deleteWorkspaceArchiveNow: vi.fn(),
  deleteCurrentAppSandboxes: vi.fn(),
  deleteCurrentSkillSandboxes: vi.fn(),
  settleActiveSandboxSagasBySource: vi.fn(),
  withSandboxSourceMutationLease: vi.fn(),
  withLegacySandboxMigrationJobLease: vi.fn(),
  assertSandboxSourceActive: vi.fn(),
  assertSandboxSourceDeleted: vi.fn(),
  migrateFrozenLegacyGroupWithSaga: vi.fn()
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
  deleteSkillEditSandboxes: mocks.deleteCurrentSkillSandboxes,
  settleActiveSandboxSagasBySource: mocks.settleActiveSandboxSagasBySource
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  findSandboxInstanceBySource: mocks.findSandboxInstanceBySource
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter', () => ({
  buildRuntimeSandboxAdapter: mocks.buildRuntimeSandboxAdapter,
  buildSandboxResourceAdapter: mocks.buildSandboxResourceAdapter
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/config', () => ({
  getConfiguredSandboxProvider: () => 'opensandbox'
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/lifecycle', () => ({
  ensureConnectedSandboxRunning: mocks.ensureConnectedSandboxRunning,
  disconnectSandbox: mocks.disconnectSandbox
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
  withLegacySandboxMigrationJobLease: mocks.withLegacySandboxMigrationJobLease
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lifecycle/service', () => ({
  migrateFrozenLegacyGroupWithSaga: mocks.migrateFrozenLegacyGroupWithSaga
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => ({
  assertSandboxSourceActive: mocks.assertSandboxSourceActive,
  assertSandboxSourceDeleted: mocks.assertSandboxSourceDeleted
}));

import {
  deleteAppSandboxesForAppDeletion,
  installLegacyWorkspaceArchive,
  migrateLegacySandboxesToUserLevel,
  runFrozenLegacyMigrationGroup
} from '@fastgpt/service/core/ai/sandbox/application/migration';
import { MongoLegacySandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/legacySchema';

const createTargetProvider = () => ({
  id: 'migration-target-upstream',
  provider: 'opensandbox',
  execute: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
  close: vi.fn(async () => undefined)
});

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
    mocks.ensureConnectedSandboxRunning.mockResolvedValue(undefined);
    mocks.disconnectSandbox.mockResolvedValue(undefined);
    mocks.getSessionVolumeConfig.mockResolvedValue(undefined);
    mocks.deleteSessionVolume.mockResolvedValue(undefined);
    mocks.downloadWorkspaceArchive.mockResolvedValue(Buffer.from('zip'));
    mocks.deleteWorkspaceArchiveNow.mockResolvedValue(undefined);
    mocks.deleteCurrentAppSandboxes.mockResolvedValue(undefined);
    mocks.deleteCurrentSkillSandboxes.mockResolvedValue(undefined);
    mocks.settleActiveSandboxSagasBySource.mockResolvedValue(undefined);
    mocks.assertSandboxSourceActive.mockResolvedValue(undefined);
    mocks.assertSandboxSourceDeleted.mockResolvedValue(undefined);
    mocks.buildRuntimeSandboxAdapter.mockReturnValue(createTargetProvider());
    mocks.buildSandboxResourceAdapter.mockReturnValue({
      getInfo: vi.fn(async () => null),
      delete: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined)
    });
    mocks.migrateFrozenLegacyGroupWithSaga.mockImplementation(async (input: any) => ({
      completed: true,
      migratedCount: input.records.length
    }));
    mocks.withSandboxSourceMutationLease.mockImplementation(async ({ fn }: any) =>
      fn(leaseContext)
    );
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

  it('checkpoints and cleans a frozen Legacy record without replaying installation', async () => {
    await insertLegacyApp({
      sandboxId: 'migration-test-frozen',
      sourceId: 'frozen-app',
      userId: 'frozen-user',
      chatId: 'frozen-chat'
    });
    const legacy = await MongoLegacySandboxInstance.findOne({
      sandboxId: 'migration-test-frozen'
    }).lean();
    if (!legacy) throw new Error('Legacy test fixture was not created');

    const input = {
      kind: 'app' as const,
      sourceId: 'frozen-app',
      userId: 'frozen-user',
      targetSandboxId: 'frozen-target',
      targetSagaId: 'frozen-saga',
      manifestHash: 'frozen-manifest',
      provider: 'opensandbox' as const,
      targetMetadata: {},
      records: [
        {
          recordId: String(legacy._id),
          sandboxId: legacy.sandboxId,
          chatId: 'frozen-chat'
        }
      ]
    };
    const targetProvider = createTargetProvider();
    mocks.buildRuntimeSandboxAdapter.mockReturnValue(targetProvider);
    mocks.findSandboxInstanceBySource.mockResolvedValue({
      sandboxId: input.targetSandboxId,
      status: 'legacyMigrating',
      metadata: { activeSaga: { sagaId: input.targetSagaId, type: 'legacyMigration' } }
    });
    const assertExecutionActive = vi.fn(async () => undefined);

    await expect(runFrozenLegacyMigrationGroup(input, assertExecutionActive)).resolves.toEqual({
      migratedCount: 1,
      upstreamId: 'migration-target-upstream'
    });
    await expect(
      MongoLegacySandboxInstance.exists({ sandboxId: 'migration-test-frozen' })
    ).resolves.toBeNull();
    expect(mocks.restoreSandboxWorkspaceArchiveForMigration).toHaveBeenCalledTimes(1);

    await expect(runFrozenLegacyMigrationGroup(input, assertExecutionActive)).resolves.toEqual({
      migratedCount: 1,
      upstreamId: 'migration-target-upstream'
    });
    expect(mocks.restoreSandboxWorkspaceArchiveForMigration).toHaveBeenCalledTimes(1);
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
    expect(mocks.migrateFrozenLegacyGroupWithSaga).not.toHaveBeenCalled();

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
    expect(mocks.migrateFrozenLegacyGroupWithSaga).not.toHaveBeenCalled();

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
    expect(mocks.migrateFrozenLegacyGroupWithSaga).not.toHaveBeenCalled();

    await MongoLegacySandboxInstance.updateOne(
      { sandboxId: 'migration-test-app-1' },
      { $set: { metadata: { archive: { state: 'invalid-state' } } } }
    );
    await expect(migrateLegacySandboxesToUserLevel({ dryRun: true })).rejects.toThrow(
      'metadata.archive.state'
    );
  });

  it('dispatches one frozen durable Saga per App user group', async () => {
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
    await MongoLegacySandboxInstance.updateOne(
      { sandboxId: 'migration-test-app-newer' },
      {
        $set: {
          appId: 'official-deprecated-app-id',
          type: 'session-runtime',
          'metadata.skillId': 'official-deprecated-skill-id',
          'metadata.provider': 'opensandbox'
        }
      }
    );

    const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

    expect(result).toMatchObject({
      migratedAppCount: 2,
      completedAppGroupCount: 1,
      failedCount: 0
    });
    expect(mocks.withLegacySandboxMigrationJobLease).toHaveBeenCalledTimes(1);
    expect(mocks.migrateFrozenLegacyGroupWithSaga).toHaveBeenCalledTimes(1);
    const input = mocks.migrateFrozenLegacyGroupWithSaga.mock.calls[0][0];
    expect(input).toMatchObject({
      kind: 'app',
      sourceId: 'app-1',
      userId: 'user-1',
      provider: 'opensandbox',
      targetMetadata: expect.objectContaining({
        image: { repository: 'migration-image', tag: 'latest' }
      })
    });
    expect(input.targetSagaId).toBe(`sandbox-legacy-migration-${input.manifestHash}`);
    expect(input.targetMetadata).not.toHaveProperty('skillId');
    expect(input.targetMetadata).not.toHaveProperty('provider');
    expect(input.records.map(({ sandboxId, chatId }: any) => ({ sandboxId, chatId }))).toEqual([
      { sandboxId: 'migration-test-app-newer', chatId: 'chat-newer' },
      { sandboxId: 'migration-test-app-older', chatId: 'chat-older' }
    ]);
  });

  it('reports a pending App Saga and pauses its running Legacy resources', async () => {
    await insertLegacyApp({
      sandboxId: 'migration-test-app-pending',
      status: SandboxStatusEnum.running
    });
    mocks.migrateFrozenLegacyGroupWithSaga.mockResolvedValueOnce({
      completed: false,
      migratedCount: 0
    });

    const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

    expect(result.failures).toContainEqual({
      sandboxId: 'migration-test-app-pending',
      error: 'Durable Legacy App migration is pending retry'
    });
    await expect(
      MongoLegacySandboxInstance.findOne({ sandboxId: 'migration-test-app-pending' })
        .lean()
        .then((doc) => doc?.status)
    ).resolves.toBe(SandboxStatusEnum.stopped);
    expect(mocks.buildSandboxResourceAdapter.mock.results.at(-1)?.value.stop).toHaveBeenCalledTimes(
      1
    );
  });

  it('serializes durable Saga dispatches for different users of the same App', async () => {
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
    mocks.migrateFrozenLegacyGroupWithSaga.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        await Promise.resolve();
        return { completed: true, migratedCount: 1 };
      } finally {
        active -= 1;
      }
    });

    const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

    expect(result.completedAppGroupCount).toBe(2);
    expect(maxActive).toBe(1);
  });

  it('dispatches a Legacy Skill through its deterministic durable Saga', async () => {
    const sourceId = 'skill-1';
    const targetSandboxId = generateSandboxId({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId,
      userId: ChatSourceTypeEnum.skillEdit
    });
    await insertLegacySkill({ sandboxId: 'migration-test-skill-1', sourceId });

    const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

    expect(result.migratedSkillCount).toBe(1);
    expect(mocks.migrateFrozenLegacyGroupWithSaga).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'skill',
        sourceId,
        targetSandboxId,
        provider: 'opensandbox',
        records: [expect.objectContaining({ sandboxId: 'migration-test-skill-1' })]
      })
    );
  });

  it('deletes only normalized Legacy App records under the source lease', async () => {
    await insertLegacyApp({
      sandboxId: 'migration-test-delete-app',
      sourceId: 'app-delete',
      userId: 'user-delete'
    });

    await deleteAppSandboxesForAppDeletion('app-delete');

    expect(mocks.settleActiveSandboxSagasBySource).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-delete'
    });
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
