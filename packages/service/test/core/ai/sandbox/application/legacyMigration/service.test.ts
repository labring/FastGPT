import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  generateSandboxId,
  SandboxStatusEnum,
  SandboxTypeEnum
} from '@fastgpt/global/core/ai/sandbox/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const mocks = vi.hoisted(() => ({
  restoreArchivedSandboxBeforeUse: vi.fn(),
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
  resolveSandboxHome: vi.fn(),
  buildVolumeConfig: vi.fn(),
  createSessionVolumeClaimName: vi.fn(),
  deleteSessionVolume: vi.fn(),
  getSessionVolumeClaimName: vi.fn(),
  getSessionVolumeConfig: vi.fn(),
  downloadLegacyWorkspaceArchive: vi.fn(),
  deleteLegacyWorkspaceArchiveNow: vi.fn(),
  isLegacyWorkspaceArchiveExists: vi.fn(),
  deleteCurrentAppSandboxes: vi.fn(),
  deleteCurrentSkillSandboxes: vi.fn(),
  stopSandboxResource: vi.fn(),
  withSandboxSourceMutationLease: vi.fn(),
  withSandboxLifecycleLease: vi.fn(),
  withLegacySandboxMigrationJobLease: vi.fn(),
  assertSandboxSourceActive: vi.fn(),
  assertSandboxSourceDeleted: vi.fn(),
  cleanupLegacySkillDebugChats: vi.fn(),
  runtimeWorkDirectory: { value: '/workspace' }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/archive', () => ({
  SANDBOX_STALE_ARCHIVING_MINUTES: 45,
  restoreArchivedSandboxBeforeUse: mocks.restoreArchivedSandboxBeforeUse,
  restoreSandboxWorkspaceArchiveForMigration: mocks.restoreSandboxWorkspaceArchiveForMigration,
  getSandboxWorkspaceArchiveForMigration: mocks.getSandboxWorkspaceArchiveForMigration
}));

vi.mock('@fastgpt/service/common/middle/tracks/utils', () => ({
  pushTrack: { userSandboxMigration: mocks.userSandboxMigration }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  deleteAppSandboxes: mocks.deleteCurrentAppSandboxes,
  deleteSkillEditSandboxes: mocks.deleteCurrentSkillSandboxes,
  stopSandboxResource: mocks.stopSandboxResource
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

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/home', () => ({
  resolveSandboxHome: mocks.resolveSandboxHome
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile', () => ({
  getSandboxRuntimeProfile: () => ({
    workDirectory: mocks.runtimeWorkDirectory.value,
    defaultImage: { repository: 'migration-image', tag: 'latest' }
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/volume/service', () => ({
  buildVolumeConfig: mocks.buildVolumeConfig,
  createSessionVolumeClaimName: mocks.createSessionVolumeClaimName,
  deleteSessionVolume: mocks.deleteSessionVolume,
  getSessionVolumeClaimName: mocks.getSessionVolumeClaimName,
  getSessionVolumeConfig: mocks.getSessionVolumeConfig
}));

vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({
  getS3SandboxSource: () => ({
    downloadLegacyWorkspaceArchive: mocks.downloadLegacyWorkspaceArchive,
    deleteLegacyWorkspaceArchiveNow: mocks.deleteLegacyWorkspaceArchiveNow,
    isLegacyWorkspaceArchiveExists: mocks.isLegacyWorkspaceArchiveExists
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/config', () => ({
  getAgentSandboxArchiveMaxBytes: () => 1024 * 1024
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxSourceMutationLease: mocks.withSandboxSourceMutationLease,
  withSandboxLifecycleLease: mocks.withSandboxLifecycleLease,
  withLegacySandboxMigrationJobLease: mocks.withLegacySandboxMigrationJobLease
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', async (importOriginal) => ({
  ...(await importOriginal()),
  assertSandboxSourceActive: mocks.assertSandboxSourceActive,
  assertSandboxSourceDeleted: mocks.assertSandboxSourceDeleted
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/legacyMigration/debugChatCleanup', () => ({
  cleanupLegacySkillDebugChats: mocks.cleanupLegacySkillDebugChats
}));

import { deleteAppSandboxesForAppDeletion } from '@fastgpt/service/core/ai/sandbox/application/legacyMigration/cleanup';
import { migrateLegacySandboxesToUserLevel } from '@fastgpt/service/core/ai/sandbox/application/legacyMigration/service';
import { installLegacyWorkspaceArchive } from '@fastgpt/service/core/ai/sandbox/application/legacyMigration/workspace';
import { SandboxSourceMissingError } from '@fastgpt/service/core/ai/sandbox/application/sourceGuard';
import { MongoLegacySandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/legacySchema';

const createTargetProvider = () => ({
  provider: 'opensandbox',
  execute: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
  stop: vi.fn(async () => undefined)
});

const createWorkspaceTarget = () => ({
  provider: createTargetProvider(),
  getRuntimePaths: () => ({
    workspaceRoot: '/workspace',
    runtimeSkillsRoot: '/workspace/projects',
    sessionWorkDirectory: '/workspace/sessions/chat-1'
  })
});

const createStorage = (sandboxId: string) => ({
  volumes: [
    {
      name: 'workspace',
      claimName: `fastgpt-session-${sandboxId}-current`,
      mountPath: '/workspace'
    }
  ],
  mountPath: '/workspace'
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
    storage: createStorage(sandboxId),
    operation: {
      id: `operation-${sandboxId}`,
      type: 'legacyMigration',
      phase: 'claimed',
      startedAt: new Date(),
      heartbeatAt: new Date()
    }
  }) as any;

const insertLegacyApp = async (params: {
  sandboxId: string;
  sourceId?: string;
  userId?: string;
  chatId?: string;
  phase?: 'pending' | 'archiveReady' | 'installed' | 'cleanupPending' | 'completed';
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
    storage: createStorage(params.sandboxId),
    ...(params.phase
      ? {
          metadata: {
            ...(params.phase === 'completed' ? { archive: { state: 'archived' } } : {}),
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
  metadata?: Record<string, unknown>;
}) => {
  const sourceId = params.sourceId ?? 'skill-1';
  await MongoLegacySandboxInstance.collection.insertOne({
    provider: 'opensandbox',
    sandboxId: params.sandboxId,
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId,
    status: SandboxStatusEnum.stopped,
    lastActiveAt: new Date(),
    storage: createStorage(params.sandboxId),
    metadata: params.metadata ?? {}
  });
};

const insertPreBeta6Sandbox = async (params: {
  sandboxId: string;
  appId?: string | null;
  type?: SandboxTypeEnum;
  skillId?: string;
}) =>
  MongoLegacySandboxInstance.collection.insertOne({
    provider: 'opensandbox',
    sandboxId: params.sandboxId,
    ...(params.appId !== undefined ? { appId: params.appId } : {}),
    ...(params.type ? { type: params.type } : {}),
    userId: 'user-1',
    chatId: `chat-${params.sandboxId}`,
    status: SandboxStatusEnum.stopped,
    lastActiveAt: new Date(),
    createdAt: new Date(),
    storage: createStorage(params.sandboxId),
    ...(params.skillId ? { metadata: { skillId: params.skillId } } : {})
  });

const createDebugChatCleanupResult = (pendingChatCount = 0) => ({
  cleanup: {
    conflictAppSkillCount: 0,
    matchedSkillCount: 0,
    totalLegacyChats: pendingChatCount,
    totalChatItems: 0,
    totalChatItemResponses: 0,
    cleanedSkillCount: 0,
    pendingChatCount,
    list: []
  }
});

describe('legacy sandbox migration', () => {
  const leaseContext = {
    signal: new AbortController().signal,
    assertValid: vi.fn()
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await MongoLegacySandboxInstance.deleteMany({ sandboxId: /^migration-test-/ });
    mocks.restoreArchivedSandboxBeforeUse.mockResolvedValue(undefined);
    mocks.restoreSandboxWorkspaceArchiveForMigration.mockResolvedValue(undefined);
    mocks.getSandboxWorkspaceArchiveForMigration.mockResolvedValue(Buffer.from('zip'));
    mocks.userSandboxMigration.mockResolvedValue(undefined);
    mocks.findSandboxInstanceBySource.mockResolvedValue(null);
    mocks.advanceSandboxOperation.mockResolvedValue({ status: 'legacyMigrating' });
    mocks.completeSandboxOperation.mockResolvedValue({ status: 'stopped' });
    mocks.markSandboxOperationFailed.mockResolvedValue(undefined);
    mocks.ensureConnectedSandboxRunning.mockResolvedValue(undefined);
    mocks.resolveSandboxHome.mockResolvedValue('/home/sandbox');
    mocks.buildVolumeConfig.mockImplementation((claimName: string) => ({
      volumes: [
        {
          name: 'workspace',
          pvc: {
            claimName,
            createIfNotExists: false,
            deleteOnSandboxTermination: false
          },
          mountPath: '/workspace'
        }
      ],
      storage: {
        volumes: [{ name: 'workspace', claimName, mountPath: '/workspace' }],
        mountPath: '/workspace'
      }
    }));
    mocks.createSessionVolumeClaimName.mockImplementation(
      ({ sandboxId, generationId }: { sandboxId: string; generationId?: string }) =>
        `fastgpt-session-${sandboxId}-${generationId ?? 'new'}`
    );
    mocks.getSessionVolumeClaimName.mockImplementation(
      (storage: any) =>
        storage?.volumes?.find((volume: any) => volume.name === 'workspace')?.claimName
    );
    mocks.getSessionVolumeConfig.mockResolvedValue(undefined);
    mocks.deleteSessionVolume.mockResolvedValue(undefined);
    mocks.downloadLegacyWorkspaceArchive.mockResolvedValue(Buffer.from('zip'));
    mocks.deleteLegacyWorkspaceArchiveNow.mockResolvedValue(undefined);
    mocks.isLegacyWorkspaceArchiveExists.mockResolvedValue(true);
    mocks.deleteCurrentAppSandboxes.mockResolvedValue(undefined);
    mocks.deleteCurrentSkillSandboxes.mockResolvedValue(undefined);
    mocks.stopSandboxResource.mockResolvedValue(undefined);
    mocks.assertSandboxSourceActive.mockResolvedValue(undefined);
    mocks.assertSandboxSourceDeleted.mockResolvedValue(undefined);
    mocks.cleanupLegacySkillDebugChats.mockResolvedValue(createDebugChatCleanupResult());
    mocks.runtimeWorkDirectory.value = '/workspace';
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
    mocks.withLegacySandboxMigrationJobLease.mockImplementation(async ({ fn }: any) =>
      fn(leaseContext)
    );
  });

  describe('installLegacyWorkspaceArchive', () => {
    it('stages a Legacy workspace outside the runtime workspace and targets the encoded Chat', async () => {
      const target = createWorkspaceTarget();

      await installLegacyWorkspaceArchive({
        target,
        legacySandboxId: 'migration-test-old-1',
        chatId: 'chat/2',
        archiveBody: Buffer.from('zip')
      });

      expect(mocks.restoreSandboxWorkspaceArchiveForMigration).toHaveBeenCalledWith(
        expect.objectContaining({
          sandbox: target.provider,
          workDirectory: expect.stringMatching(
            /^\/home\/sandbox\/\.fastgpt\/tmp\/migration\/[0-9a-f]{40}$/
          ),
          sandboxId: 'migration-test-old-1'
        })
      );
      expect(mocks.resolveSandboxHome).toHaveBeenCalledWith(target.provider);
      const commitCommand = target.provider.execute.mock.calls[0][0] as string;
      expect(commitCommand).toContain("target='/workspace/sessions/chat%2F2'");
    });

    it('rejects migration before restore when Sandbox HOME cannot be resolved', async () => {
      const target = createWorkspaceTarget();
      mocks.resolveSandboxHome.mockResolvedValueOnce(undefined);

      await expect(
        installLegacyWorkspaceArchive({
          target,
          legacySandboxId: 'migration-test-home-missing',
          chatId: 'chat-1',
          archiveBody: Buffer.from('zip')
        })
      ).rejects.toThrow('Failed to resolve sandbox HOME for migration staging directory');

      expect(mocks.restoreSandboxWorkspaceArchiveForMigration).not.toHaveBeenCalled();
      expect(target.provider.execute).not.toHaveBeenCalled();
    });
  });

  describe('migrateLegacySandboxesToUserLevel', () => {
    it('normalizes beta6 fields before archiving and migrating a Skill', async () => {
      await insertPreBeta6Sandbox({
        sandboxId: 'migration-test-normalization-before-skill',
        appId: 'legacy-skill-app-id',
        type: SandboxTypeEnum.editDebug,
        skillId: 'skill-normalization'
      });

      const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

      expect(result).toMatchObject({
        normalizationBlocked: false,
        normalization: {
          skillMatchedCount: 1,
          skillModifiedCount: 1,
          pendingCount: 0
        },
        legacySkillCount: 1,
        migratedSkillCount: 1,
        failedCount: 0
      });
      expect(mocks.getSandboxWorkspaceArchiveForMigration).toHaveBeenCalledWith(
        expect.objectContaining({ sandboxId: 'migration-test-normalization-before-skill' })
      );
      await expect(
        MongoLegacySandboxInstance.findOne({
          sandboxId: 'migration-test-normalization-before-skill'
        }).lean()
      ).resolves.toMatchObject({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'skill-normalization'
      });
    });

    it('keeps the archive phase blocked while legacy Skill Debug Chats remain', async () => {
      mocks.cleanupLegacySkillDebugChats.mockResolvedValueOnce(createDebugChatCleanupResult(1));

      const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

      expect(result).toMatchObject({
        normalizationBlocked: true,
        normalization: {
          sandboxPendingCount: 0,
          legacyDebugChatCleanup: { pendingChatCount: 1 },
          pendingCount: 1
        },
        failedCount: 0
      });
      expect(mocks.getSandboxWorkspaceArchiveForMigration).not.toHaveBeenCalled();
      expect(mocks.claimAppSandboxMigrationTarget).not.toHaveBeenCalled();
    });

    it('dry-run reports the normalized Legacy table without any side effect', async () => {
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
    });

    it('skips missing sources and continues migrating active sources when skipError is enabled', async () => {
      const missingSourceId = 'app-missing-source-skipped';
      const activeSourceId = 'app-active-source';
      await insertLegacyApp({
        sandboxId: 'migration-test-missing-source-skipped',
        sourceId: missingSourceId
      });
      await insertLegacyApp({
        sandboxId: 'migration-test-active-source',
        sourceId: activeSourceId
      });
      mocks.assertSandboxSourceActive.mockImplementation(async ({ sourceId, sourceType }: any) => {
        if (sourceId === missingSourceId) {
          throw new SandboxSourceMissingError({ sourceType, sourceId });
        }
      });

      const result = await migrateLegacySandboxesToUserLevel({
        dryRun: false,
        skipError: true
      });

      expect(result).toMatchObject({
        migratedAppCount: 1,
        failedCount: 0,
        failures: [],
        skippedCount: 1,
        skipped: [
          {
            sandboxId: 'migration-test-missing-source-skipped',
            error: `Sandbox source is missing or deleted: app/${missingSourceId}`
          }
        ]
      });
      expect(mocks.getSandboxWorkspaceArchiveForMigration).toHaveBeenCalledTimes(1);
      expect(mocks.claimAppSandboxMigrationTarget).toHaveBeenCalledTimes(1);
      expect(mocks.claimAppSandboxMigrationTarget).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: activeSourceId })
      );
    });

    it('keeps non-source archive errors blocking when skipError is enabled', async () => {
      await insertLegacyApp({
        sandboxId: 'migration-test-archive-success',
        sourceId: 'app-archive-success'
      });
      await insertLegacyApp({
        sandboxId: 'migration-test-archive-failure',
        sourceId: 'app-archive-failure'
      });
      mocks.getSandboxWorkspaceArchiveForMigration.mockImplementation(
        async ({ sandboxId }: any) => {
          if (sandboxId === 'migration-test-archive-failure') {
            throw new Error('legacy archive failed');
          }
          return Buffer.from('zip');
        }
      );

      const result = await migrateLegacySandboxesToUserLevel({
        dryRun: false,
        skipError: true
      });

      expect(result).toMatchObject({
        migratedAppCount: 0,
        completedAppGroupCount: 0,
        failedCount: 1,
        failures: [{ sandboxId: 'migration-test-archive-failure', error: 'legacy archive failed' }]
      });
      expect(mocks.getSandboxWorkspaceArchiveForMigration).toHaveBeenCalledTimes(2);
      expect(mocks.claimAppSandboxMigrationTarget).not.toHaveBeenCalled();
      expect(mocks.buildRuntimeSandboxAdapter).not.toHaveBeenCalled();
      await expect(
        MongoLegacySandboxInstance.findOne({ sandboxId: 'migration-test-archive-success' })
          .lean()
          .then((doc) => doc?.metadata?.userLevelMigration?.phase)
      ).resolves.toBe('archiveReady');
      await expect(
        MongoLegacySandboxInstance.findOne({ sandboxId: 'migration-test-archive-failure' })
          .lean()
          .then((doc) => doc?.metadata?.userLevelMigration?.phase)
      ).resolves.toBeUndefined();
    });

    it('persists deleting before removing Legacy resources and keeps the barrier on delete failure', async () => {
      const sandboxId = 'migration-test-delete-failure';
      await insertLegacyApp({ sandboxId });
      const deleteSandbox = vi.fn(async () => {
        await expect(
          MongoLegacySandboxInstance.findOne({ sandboxId })
            .lean()
            .then((doc) => doc?.metadata?.archive?.state)
        ).resolves.toBe('deleting');
      });
      mocks.buildSandboxResourceAdapter.mockReturnValueOnce({
        getInfo: vi.fn(async () => null),
        delete: deleteSandbox,
        stop: vi.fn(async () => undefined)
      });
      mocks.deleteSessionVolume.mockRejectedValueOnce(new Error('volume delete failed'));

      const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

      expect(result.failures).toContainEqual({ sandboxId, error: 'volume delete failed' });
      expect(deleteSandbox).toHaveBeenCalledTimes(1);
      expect(mocks.claimAppSandboxMigrationTarget).not.toHaveBeenCalled();
      await expect(
        MongoLegacySandboxInstance.findOne({ sandboxId })
          .lean()
          .then((doc) => ({
            archive: doc?.metadata?.archive?.state,
            migration: doc?.metadata?.userLevelMigration?.phase
          }))
      ).resolves.toEqual({ archive: 'deleting', migration: undefined });
    });

    it('counts completed Legacy backups without scheduling them again', async () => {
      await insertLegacyApp({
        sandboxId: 'migration-test-completed-app',
        phase: 'completed',
        targetSandboxId: 'app-completed-target'
      });

      const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

      expect(result).toMatchObject({
        completedLegacyCount: 1,
        legacyAppCount: 0,
        migratedAppCount: 0,
        appGroupCount: 0,
        failedCount: 0
      });
      expect(mocks.claimAppSandboxMigrationTarget).not.toHaveBeenCalled();
      expect(mocks.buildSandboxResourceAdapter).not.toHaveBeenCalled();
      expect(mocks.isLegacyWorkspaceArchiveExists).not.toHaveBeenCalled();
    });

    it('retries an interrupted publish after every Legacy workspace is installed', async () => {
      const targetSandboxId = generateSandboxId({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        userId: 'user-1'
      });
      await insertLegacyApp({ sandboxId: 'migration-test-app-1', chatId: 'chat-1' });
      await insertLegacyApp({ sandboxId: 'migration-test-app-2', chatId: 'chat-2' });
      const migratingTarget = createMigrationTargetDoc(targetSandboxId);
      mocks.findSandboxInstanceBySource
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(migratingTarget);
      mocks.claimAppSandboxMigrationTarget.mockResolvedValue(migratingTarget);
      mocks.advanceSandboxOperation.mockImplementation(async ({ phase }: any) => {
        migratingTarget.operation.phase = phase;
        return migratingTarget;
      });
      mocks.markSandboxOperationFailed.mockImplementation(async ({ error }: any) => {
        migratingTarget.operation.error = error;
      });
      mocks.completeSandboxOperation
        .mockRejectedValueOnce(new Error('publish interrupted'))
        .mockResolvedValueOnce({ status: 'stopped' });

      const failedResult = await migrateLegacySandboxesToUserLevel({ dryRun: false });

      expect(failedResult).toMatchObject({
        migratedAppCount: 0,
        completedAppGroupCount: 0,
        failedCount: 1
      });
      expect(mocks.markSandboxOperationFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: migratingTarget.operation.id,
          status: 'legacyMigrating',
          error: 'publish interrupted'
        })
      );
      const installed = await MongoLegacySandboxInstance.find({
        sandboxId: /^migration-test-app-/
      })
        .sort({ sandboxId: 1 })
        .lean();
      expect(installed.map((item) => item.metadata?.userLevelMigration?.phase)).toEqual([
        'installed',
        'installed'
      ]);
      expect(mocks.deleteSessionVolume).toHaveBeenCalledTimes(2);
      expect(mocks.deleteSessionVolume.mock.invocationCallOrder[1]).toBeLessThan(
        mocks.claimAppSandboxMigrationTarget.mock.invocationCallOrder[0]
      );
      expect(mocks.restoreSandboxWorkspaceArchiveForMigration).toHaveBeenCalledTimes(2);
      expect(
        mocks.restoreSandboxWorkspaceArchiveForMigration.mock.invocationCallOrder[1]
      ).toBeLessThan(mocks.completeSandboxOperation.mock.invocationCallOrder[0]);

      const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

      expect(result).toMatchObject({
        migratedAppCount: 2,
        completedAppGroupCount: 1,
        failedCount: 0
      });
      expect(mocks.claimAppSandboxMigrationTarget).toHaveBeenCalledTimes(2);
      expect(mocks.restoreSandboxWorkspaceArchiveForMigration).toHaveBeenCalledTimes(2);
      expect(mocks.completeSandboxOperation).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          operationId: migratingTarget.operation.id,
          fromStatus: 'legacyMigrating',
          status: 'stopped',
          touchActive: true
        })
      );
      const retained = await MongoLegacySandboxInstance.find({
        sandboxId: /^migration-test-app-/
      }).lean();
      expect(retained).toHaveLength(2);
      expect(retained).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: SandboxStatusEnum.stopped,
            metadata: expect.objectContaining({
              archive: expect.objectContaining({ state: 'archived' }),
              userLevelMigration: expect.objectContaining({
                phase: 'completed',
                targetSandboxId
              })
            })
          })
        ])
      );
      expect(mocks.deleteLegacyWorkspaceArchiveNow).not.toHaveBeenCalled();
    });

    it('stops an already published target before completing installed Legacy records', async () => {
      const sourceId = 'installed-app';
      const userId = 'installed-user';
      const targetSandboxId = generateSandboxId({
        sourceType: ChatSourceTypeEnum.app,
        sourceId,
        userId
      });
      await insertLegacyApp({
        sandboxId: 'migration-test-installed-app',
        sourceId,
        userId,
        phase: 'installed',
        targetSandboxId
      });
      mocks.findSandboxInstanceBySource.mockResolvedValueOnce({
        provider: 'opensandbox',
        sandboxId: targetSandboxId,
        status: 'running'
      });

      const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

      expect(result).toMatchObject({ migratedAppCount: 1, failedCount: 0 });
      expect(mocks.stopSandboxResource).toHaveBeenCalledWith({
        provider: 'opensandbox',
        sandboxId: targetSandboxId
      });
      expect(mocks.claimAppSandboxMigrationTarget).not.toHaveBeenCalled();
      expect(mocks.completeSandboxOperation).not.toHaveBeenCalled();
    });

    it('keeps archiveReady Legacy workspaces when archived target restore fails', async () => {
      const sourceId = 'restore-failed-app';
      const userId = 'restore-failed-user';
      const targetSandboxId = generateSandboxId({
        sourceType: ChatSourceTypeEnum.app,
        sourceId,
        userId
      });
      await insertLegacyApp({
        sandboxId: 'migration-test-restore-failed',
        sourceId,
        userId,
        status: SandboxStatusEnum.running
      });
      mocks.findSandboxInstanceBySource.mockResolvedValueOnce({
        sandboxId: targetSandboxId,
        status: 'archived'
      });
      mocks.restoreArchivedSandboxBeforeUse.mockRejectedValueOnce(
        new Error('target restore failed')
      );

      const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

      expect(result.failures).toEqual([
        {
          sandboxId: 'migration-test-restore-failed',
          error: 'target restore failed'
        }
      ]);
      await expect(
        MongoLegacySandboxInstance.findOne({ sandboxId: 'migration-test-restore-failed' })
          .lean()
          .then((doc) => doc?.status)
      ).resolves.toBe(SandboxStatusEnum.stopped);
      expect(mocks.restoreArchivedSandboxBeforeUse).toHaveBeenCalledWith(
        expect.objectContaining({ sandboxId: targetSandboxId })
      );
      expect(
        mocks.buildSandboxResourceAdapter.mock.results.at(-1)?.value.delete
      ).toHaveBeenCalledTimes(1);
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
          image: { repository: 'migration-image', tag: 'latest' }
        })
      );
      expect(mocks.getSandboxWorkspaceArchiveForMigration).toHaveBeenCalledWith(
        expect.objectContaining({ sandboxId: 'migration-test-skill-1' })
      );
      expect(mocks.restoreSandboxWorkspaceArchiveForMigration).toHaveBeenCalledWith(
        expect.objectContaining({
          workDirectory: expect.stringMatching(
            /^\/home\/sandbox\/\.fastgpt\/tmp\/migration\/[0-9a-f]{40}$/
          ),
          sandboxId: 'migration-test-skill-1'
        })
      );
      const targetProvider = mocks.buildRuntimeSandboxAdapter.mock.results.at(-1)?.value;
      const commitCommand = targetProvider.execute.mock.calls[0][0] as string;
      expect(commitCommand).toContain("target='/workspace'");
      expect(commitCommand).toContain('merge_without_overwrite');
      expect(commitCommand).not.toContain('projects="$source/projects"');
      expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          fromStatus: 'legacyMigrating',
          status: 'stopped',
          touchActive: true
        })
      );
      expect(targetProvider.stop).toHaveBeenCalledOnce();
      expect(targetProvider.stop.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.completeSandboxOperation.mock.invocationCallOrder[0]
      );
      await expect(
        MongoLegacySandboxInstance.findOne({ sandboxId: 'migration-test-skill-1' })
          .lean()
          .then((doc) => doc?.metadata?.userLevelMigration?.phase)
      ).resolves.toBe('completed');
    });

    it('accepts Legacy Skill metadata fields that are not persisted in v2', async () => {
      const sourceId = 'skill-with-legacy-metadata';
      await insertLegacySkill({
        sandboxId: 'migration-test-skill-legacy-metadata',
        sourceId,
        metadata: {
          providerCreatedAt: new Date(),
          storage: { key: 'skill-package.zip', uploadedAt: new Date() },
          skillIds: ['legacy-skill-version'],
          skillName: 'Legacy Skill',
          versionId: 'legacy-version'
        }
      });

      const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

      expect(result).toMatchObject({ migratedSkillCount: 1, failedCount: 0 });
      expect(mocks.claimSkillSandboxMigrationTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          image: { repository: 'migration-image', tag: 'latest' },
          versionId: 'legacy-version'
        })
      );
    });

    it('preflights Legacy records before creating migration targets', async () => {
      await MongoLegacySandboxInstance.collection.insertOne({
        provider: 'opensandbox',
        sandboxId: 'migration-test-invalid-legacy',
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'invalid-legacy-skill',
        status: 'not-a-sandbox-status',
        lastActiveAt: new Date(),
        metadata: {}
      } as any);

      await expect(migrateLegacySandboxesToUserLevel({ dryRun: false })).rejects.toThrow(
        'Legacy Sandbox preflight validation failed'
      );
      expect(mocks.getSandboxWorkspaceArchiveForMigration).not.toHaveBeenCalled();
      expect(mocks.claimSkillSandboxMigrationTarget).not.toHaveBeenCalled();
    });

    it('merges a Legacy Skill Workspace into an existing target without overwriting new files', async () => {
      const sourceId = 'stable-skill';
      const targetSandboxId = generateSandboxId({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId,
        userId: ChatSourceTypeEnum.skillEdit
      });
      const workspaceRoot = await mkdtemp(path.join(tmpdir(), 'fastgpt-skill-migration-'));
      const homeDirectory = await mkdtemp(path.join(tmpdir(), 'fastgpt-skill-migration-home-'));
      mocks.runtimeWorkDirectory.value = workspaceRoot;
      mocks.resolveSandboxHome.mockResolvedValue(homeDirectory);
      await writeFile(path.join(workspaceRoot, 'shared.txt'), 'current');
      await mkdir(path.join(workspaceRoot, 'nested'), { recursive: true });
      await writeFile(path.join(workspaceRoot, 'nested', 'shared.txt'), 'current-nested');

      const provider = {
        provider: 'opensandbox',
        stop: vi.fn(async () => undefined),
        execute: vi.fn(async (command: string) => {
          const { stdout, stderr } = await execFileAsync('sh', ['-c', command]);
          return { stdout, stderr, exitCode: 0 };
        })
      };
      mocks.buildRuntimeSandboxAdapter.mockReturnValue(provider);
      mocks.restoreSandboxWorkspaceArchiveForMigration.mockImplementationOnce(
        async ({ workDirectory }: { workDirectory: string }) => {
          await mkdir(path.join(workDirectory, 'nested'), { recursive: true });
          await writeFile(path.join(workDirectory, 'shared.txt'), 'legacy');
          await writeFile(path.join(workDirectory, 'legacy-only.txt'), 'legacy-only');
          await writeFile(path.join(workDirectory, 'nested', 'shared.txt'), 'legacy-nested');
          await writeFile(
            path.join(workDirectory, 'nested', 'legacy-only.txt'),
            'legacy-nested-only'
          );
        }
      );
      await insertLegacySkill({ sandboxId: 'migration-test-stable-skill', sourceId });
      mocks.findSandboxInstanceBySource.mockResolvedValueOnce({
        sandboxId: targetSandboxId,
        status: 'running'
      });

      try {
        const result = await migrateLegacySandboxesToUserLevel({ dryRun: false });

        expect(result).toMatchObject({ migratedSkillCount: 1, failedCount: 0 });
        expect(provider.stop).toHaveBeenCalledOnce();
        await expect(readFile(path.join(workspaceRoot, 'shared.txt'), 'utf8')).resolves.toBe(
          'current'
        );
        await expect(
          readFile(path.join(workspaceRoot, 'nested', 'shared.txt'), 'utf8')
        ).resolves.toBe('current-nested');
        await expect(readFile(path.join(workspaceRoot, 'legacy-only.txt'), 'utf8')).resolves.toBe(
          'legacy-only'
        );
        await expect(
          readFile(path.join(workspaceRoot, 'nested', 'legacy-only.txt'), 'utf8')
        ).resolves.toBe('legacy-nested-only');
        expect(mocks.claimSkillSandboxMigrationTarget).toHaveBeenCalledWith(
          expect.objectContaining({ sandboxId: targetSandboxId, sourceId })
        );
      } finally {
        await rm(workspaceRoot, { recursive: true, force: true });
        await rm(homeDirectory, { recursive: true, force: true });
      }
    });
  });

  describe('deleteAppSandboxesForAppDeletion', () => {
    it('deletes a retained Legacy App backup under the source lease', async () => {
      await insertLegacyApp({
        sandboxId: 'migration-test-delete-app',
        sourceId: 'app-delete',
        userId: 'user-delete',
        phase: 'completed',
        targetSandboxId: 'app-delete-target'
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
      expect(mocks.deleteLegacyWorkspaceArchiveNow).toHaveBeenCalledWith({
        sandboxId: 'migration-test-delete-app'
      });
      await expect(
        MongoLegacySandboxInstance.exists({ sandboxId: 'migration-test-delete-app' })
      ).resolves.toBeFalsy();
    });
  });
});
