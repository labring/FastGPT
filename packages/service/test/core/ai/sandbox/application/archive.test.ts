import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  withSandboxLifecycleLease: vi.fn(),
  findSandboxInstanceBySandboxId: vi.fn(),
  claimSandboxOperation: vi.fn(),
  advanceSandboxOperation: vi.fn(),
  completeSandboxOperation: vi.fn(),
  markSandboxOperationFailed: vi.fn(),
  findStaleSandboxOperations: vi.fn(),
  createSandboxResourcesToArchiveCursor: vi.fn(),
  connectToSandbox: vi.fn(),
  disconnectSandbox: vi.fn(),
  buildSandboxResourceAdapter: vi.fn(),
  getSessionVolumeConfig: vi.fn(),
  deleteSessionVolume: vi.fn(),
  uploadWorkspaceArchive: vi.fn(),
  downloadWorkspaceArchive: vi.fn(),
  deleteWorkspaceArchiveNow: vi.fn(),
  isWorkspaceArchiveExists: vi.fn(),
  uploadLegacyWorkspaceArchive: vi.fn(),
  downloadLegacyWorkspaceArchive: vi.fn(),
  isLegacyWorkspaceArchiveExists: vi.fn(),
  getSandboxAdapterConfig: vi.fn(),
  getSandboxRuntimeProfile: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxLifecycleLease: mocks.withSandboxLifecycleLease
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  advanceSandboxOperation: mocks.advanceSandboxOperation,
  claimSandboxOperation: mocks.claimSandboxOperation,
  completeSandboxOperation: mocks.completeSandboxOperation,
  createSandboxResourcesToArchiveCursor: mocks.createSandboxResourcesToArchiveCursor,
  findSandboxInstanceBySandboxId: mocks.findSandboxInstanceBySandboxId,
  findStaleSandboxOperations: mocks.findStaleSandboxOperations,
  markSandboxOperationFailed: mocks.markSandboxOperationFailed
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/lifecycle', () => ({
  connectToSandbox: mocks.connectToSandbox,
  disconnectSandbox: mocks.disconnectSandbox
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter', () => ({
  buildSandboxResourceAdapter: mocks.buildSandboxResourceAdapter
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/config', () => ({
  getSandboxAdapterConfig: mocks.getSandboxAdapterConfig
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile', () => ({
  getSandboxRuntimeProfile: mocks.getSandboxRuntimeProfile
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/volume/service', () => ({
  deleteSessionVolume: mocks.deleteSessionVolume,
  getSessionVolumeConfig: mocks.getSessionVolumeConfig
}));

vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({
  getS3SandboxSource: () => ({
    uploadWorkspaceArchive: mocks.uploadWorkspaceArchive,
    downloadWorkspaceArchive: mocks.downloadWorkspaceArchive,
    deleteWorkspaceArchiveNow: mocks.deleteWorkspaceArchiveNow,
    isWorkspaceArchiveExists: mocks.isWorkspaceArchiveExists,
    uploadLegacyWorkspaceArchive: mocks.uploadLegacyWorkspaceArchive,
    downloadLegacyWorkspaceArchive: mocks.downloadLegacyWorkspaceArchive,
    isLegacyWorkspaceArchiveExists: mocks.isLegacyWorkspaceArchiveExists
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/config', () => ({
  getAgentSandboxArchiveInactiveDays: () => 7,
  getAgentSandboxArchiveMaxBytes: () => 1024 * 1024
}));

import {
  archiveInactiveSandboxes,
  archiveSandboxResource,
  archiveSandboxResourceNow,
  getSandboxWorkspaceArchiveForMigration,
  restoreArchivedSandboxBeforeUse,
  retryStaleArchivingSandboxes
} from '@fastgpt/service/core/ai/sandbox/application/archive';

const EMPTY_ZIP_BUFFER = Buffer.from('504b0506000000000000000000000000000000000000', 'hex');

const createResource = (status = 'stopped', overrides: Record<string, unknown> = {}) =>
  ({
    provider: 'opensandbox',
    sandboxId: 'sandbox-1',
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'app-1',
    userId: 'user-1',
    status,
    lastActiveAt: new Date('2026-07-01T00:00:00.000Z'),
    metadata: {},
    ...overrides
  }) as any;

const createClaimed = (status: 'archiving' | 'restoring') =>
  createResource(status, {
    metadata: {
      operation: {
        id: `${status}-operation`,
        type: status === 'archiving' ? 'archive' : 'restore',
        phase: 'claimed',
        startedAt: new Date(),
        heartbeatAt: new Date()
      }
    }
  });

const createSandbox = () => ({
  provider: 'opensandbox',
  execute: vi.fn(async (command: string) => ({
    stdout: command.includes('wc -l') ? '1\n' : command.includes("awk '{s+=$7}") ? '10\n' : '',
    stderr: '',
    exitCode: 0
  })),
  readFiles: vi.fn(async () => [{ content: Buffer.from('workspace'), error: undefined }]),
  writeFiles: vi.fn(async () => [{ error: undefined }]),
  deleteFiles: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined)
});

describe('sandbox archive lifecycle', () => {
  const lease = {
    signal: new AbortController().signal,
    assertValid: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withSandboxLifecycleLease.mockImplementation(async ({ fn }: any) => fn(lease));
    mocks.getSandboxRuntimeProfile.mockReturnValue({
      workDirectory: '/workspace',
      defaultImage: 'sandbox-image'
    });
    mocks.getSandboxAdapterConfig.mockReturnValue({
      providerConfig: { provider: 'opensandbox' },
      createConfig: {
        image: { repository: 'fastgpt/sandbox', tag: 'v2' }
      }
    });
    mocks.getSessionVolumeConfig.mockResolvedValue(undefined);
    mocks.connectToSandbox.mockResolvedValue(createSandbox());
    mocks.disconnectSandbox.mockResolvedValue(undefined);
    mocks.buildSandboxResourceAdapter.mockReturnValue({ delete: vi.fn(async () => undefined) });
    mocks.deleteSessionVolume.mockResolvedValue(undefined);
    mocks.uploadWorkspaceArchive.mockResolvedValue(undefined);
    mocks.downloadWorkspaceArchive.mockResolvedValue(EMPTY_ZIP_BUFFER);
    mocks.deleteWorkspaceArchiveNow.mockResolvedValue(undefined);
    mocks.isWorkspaceArchiveExists.mockResolvedValue(false);
    mocks.uploadLegacyWorkspaceArchive.mockResolvedValue(undefined);
    mocks.downloadLegacyWorkspaceArchive.mockResolvedValue(EMPTY_ZIP_BUFFER);
    mocks.isLegacyWorkspaceArchiveExists.mockResolvedValue(false);
    mocks.markSandboxOperationFailed.mockResolvedValue(undefined);
    mocks.advanceSandboxOperation.mockResolvedValue(createClaimed('archiving'));
    mocks.completeSandboxOperation.mockResolvedValue(createResource('archived'));
    mocks.findStaleSandboxOperations.mockResolvedValue([]);
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(createResource());
    mocks.claimSandboxOperation.mockImplementation(async ({ status }: any) =>
      createClaimed(status)
    );
  });

  it('uploads the archive and removes the provider before publishing archived', async () => {
    const result = await archiveSandboxResource(
      createResource(),
      new Date('2026-07-10T00:00:00.000Z')
    );

    expect(result).toEqual({ status: 'success' });
    expect(mocks.claimSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'archiving', type: 'archive', matchLastActiveAt: true })
    );
    const adapter = mocks.buildSandboxResourceAdapter.mock.results[0].value;
    expect(mocks.uploadWorkspaceArchive.mock.invocationCallOrder[0]).toBeLessThan(
      adapter.delete.mock.invocationCallOrder[0]
    );
    expect(mocks.advanceSandboxOperation.mock.calls.map((call) => call[0].phase)).toEqual([
      'archiveUploaded',
      'providerDeleted'
    ]);
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'archiving-operation',
        fromStatus: 'archiving',
        status: 'archived',
        set: { 'metadata.image': 'sandbox-image' }
      })
    );
  });

  it('archives every inactive candidate and closes the cursor', async () => {
    const close = vi.fn(async () => undefined);
    mocks.createSandboxResourcesToArchiveCursor.mockReturnValueOnce({
      async *[Symbol.asyncIterator]() {
        yield createResource();
        yield createResource('stopped', { sandboxId: 'sandbox-2' });
      },
      close
    });
    mocks.withSandboxLifecycleLease.mockResolvedValue({ status: 'success' });

    await archiveInactiveSandboxes(new Date('2026-07-10T00:00:00.000Z'));

    expect(mocks.createSandboxResourcesToArchiveCursor).toHaveBeenCalledWith(
      new Date('2026-07-03T00:00:00.000Z')
    );
    expect(mocks.withSandboxLifecycleLease).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('rechecks inactivity under the lease before claiming', async () => {
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(
      createResource('running', { lastActiveAt: new Date('2026-07-11T00:00:00.000Z') })
    );

    await expect(
      archiveSandboxResource(createResource(), new Date('2026-07-10T00:00:00.000Z'))
    ).resolves.toMatchObject({ status: 'skipped' });
    expect(mocks.claimSandboxOperation).not.toHaveBeenCalled();
    expect(mocks.connectToSandbox).not.toHaveBeenCalled();
  });

  it('keeps archiving with an operation error when upload fails', async () => {
    mocks.uploadWorkspaceArchive.mockRejectedValueOnce(new Error('upload failed'));

    const result = await archiveSandboxResource(
      createResource(),
      new Date('2026-07-10T00:00:00.000Z')
    );

    expect(result).toEqual({ status: 'failed', error: 'upload failed' });
    expect(mocks.buildSandboxResourceAdapter).not.toHaveBeenCalled();
    expect(mocks.completeSandboxOperation).not.toHaveBeenCalled();
    expect(mocks.markSandboxOperationFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'archiving-operation',
        status: 'archiving',
        error: 'upload failed'
      })
    );
  });

  it('commits providerDeleted archive phase without recreating an empty sandbox', async () => {
    const providerDeleted = createResource('archiving', {
      metadata: {
        operation: {
          id: 'old-archive',
          type: 'archive',
          phase: 'providerDeleted',
          startedAt: new Date(0),
          heartbeatAt: new Date(0)
        }
      }
    });
    const reclaimed = {
      ...providerDeleted,
      metadata: {
        operation: { ...providerDeleted.metadata.operation, id: 'resumed-archive' }
      }
    };
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(providerDeleted);
    mocks.claimSandboxOperation.mockResolvedValueOnce(reclaimed);

    await expect(archiveSandboxResourceNow(providerDeleted)).resolves.toEqual({
      status: 'success'
    });

    expect(mocks.connectToSandbox).not.toHaveBeenCalled();
    expect(mocks.uploadWorkspaceArchive).not.toHaveBeenCalled();
    expect(mocks.buildSandboxResourceAdapter).not.toHaveBeenCalled();
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'resumed-archive', status: 'archived' })
    );
  });

  it('rejects a missing Legacy deleting archive instead of creating an empty provider', async () => {
    mocks.isLegacyWorkspaceArchiveExists.mockResolvedValueOnce(false);

    await expect(
      getSandboxWorkspaceArchiveForMigration({
        provider: 'opensandbox',
        sandboxId: 'legacy-sandbox',
        status: 'stopped',
        lastActiveAt: new Date(),
        metadata: { archive: { state: 'deleting' } }
      })
    ).rejects.toThrow('Archived Legacy Sandbox workspace is missing');

    expect(mocks.connectToSandbox).not.toHaveBeenCalled();
    expect(mocks.uploadLegacyWorkspaceArchive).not.toHaveBeenCalled();
  });

  it('reuses the completed Legacy archive while the old state is deleting', async () => {
    mocks.isLegacyWorkspaceArchiveExists.mockResolvedValueOnce(true);

    await expect(
      getSandboxWorkspaceArchiveForMigration({
        provider: 'opensandbox',
        sandboxId: 'legacy-sandbox',
        status: 'stopped',
        lastActiveAt: new Date(),
        metadata: { archive: { state: 'deleting' } }
      })
    ).resolves.toEqual(EMPTY_ZIP_BUFFER);

    expect(mocks.downloadLegacyWorkspaceArchive).toHaveBeenCalledWith({
      sandboxId: 'legacy-sandbox',
      maxBytes: 1024 * 1024
    });
    expect(mocks.connectToSandbox).not.toHaveBeenCalled();
    expect(mocks.uploadLegacyWorkspaceArchive).not.toHaveBeenCalled();
  });

  it('rearchives a Legacy workspace that was left in archiving', async () => {
    await getSandboxWorkspaceArchiveForMigration({
      provider: 'opensandbox',
      sandboxId: 'legacy-sandbox',
      status: 'stopped',
      lastActiveAt: new Date(),
      metadata: { archive: { state: 'archiving' } }
    });

    expect(mocks.connectToSandbox).toHaveBeenCalledTimes(1);
    expect(mocks.uploadLegacyWorkspaceArchive).toHaveBeenCalledWith({
      sandboxId: 'legacy-sandbox',
      body: Buffer.from('workspace')
    });
  });

  it('installs the workspace before publishing restoring -> running', async () => {
    const archived = createResource('archived');
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(archived);
    mocks.completeSandboxOperation.mockResolvedValueOnce(createResource('running'));

    await restoreArchivedSandboxBeforeUse({
      provider: 'opensandbox',
      sandboxId: 'sandbox-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      userId: 'user-1'
    });

    expect(mocks.claimSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'restoring', type: 'restore', previousStatus: 'archived' })
    );
    expect(mocks.downloadWorkspaceArchive).toHaveBeenCalledWith({
      sandboxId: 'sandbox-1',
      maxBytes: 1024 * 1024
    });
    expect(mocks.advanceSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'restoring-operation', phase: 'archiveInstalled' })
    );
    expect(mocks.advanceSandboxOperation.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.completeSandboxOperation.mock.invocationCallOrder[0]
    );
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: 'restoring',
        status: 'running',
        touchActive: true,
        set: expect.objectContaining({
          'metadata.image': { repository: 'fastgpt/sandbox', tag: 'v2' }
        })
      })
    );
  });

  it('publishes an already installed restore phase without downloading again', async () => {
    const installed = createResource('restoring', {
      metadata: {
        operation: {
          id: 'old-restore',
          type: 'restore',
          phase: 'archiveInstalled',
          previousStatus: 'archived',
          startedAt: new Date(0),
          heartbeatAt: new Date(0),
          error: 'commit interrupted'
        }
      }
    });
    const reclaimed = {
      ...installed,
      metadata: { operation: { ...installed.metadata.operation, id: 'resumed-restore' } }
    };
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(installed);
    mocks.claimSandboxOperation.mockResolvedValueOnce(reclaimed);

    await restoreArchivedSandboxBeforeUse({
      provider: 'opensandbox',
      sandboxId: 'sandbox-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      userId: 'user-1'
    });

    expect(mocks.connectToSandbox).not.toHaveBeenCalled();
    expect(mocks.downloadWorkspaceArchive).not.toHaveBeenCalled();
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'resumed-restore', status: 'running' })
    );
  });

  it('records restore failures and never publishes running', async () => {
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(createResource('archived'));
    mocks.downloadWorkspaceArchive.mockRejectedValueOnce(new Error('archive missing'));

    await expect(
      restoreArchivedSandboxBeforeUse({
        provider: 'opensandbox',
        sandboxId: 'sandbox-1',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        userId: 'user-1'
      })
    ).rejects.toThrow('archive missing');
    expect(mocks.completeSandboxOperation).not.toHaveBeenCalled();
    expect(mocks.markSandboxOperationFailed).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'restoring', error: 'archive missing' })
    );
  });

  it('retries only stale archiving records through lifecycle leases', async () => {
    mocks.findStaleSandboxOperations.mockResolvedValueOnce([
      createResource('archiving', {
        metadata: {
          operation: {
            id: 'stale-archive',
            type: 'archive',
            phase: 'archiveUploaded',
            startedAt: new Date('2026-07-01T00:00:00.000Z'),
            heartbeatAt: new Date('2026-07-01T00:00:00.000Z')
          }
        }
      })
    ]);

    await retryStaleArchivingSandboxes(new Date('2026-07-10T00:00:00.000Z'));

    expect(mocks.findStaleSandboxOperations).toHaveBeenCalledWith({
      statuses: ['archiving'],
      heartbeatBefore: expect.any(Date)
    });
    expect(mocks.withSandboxLifecycleLease).toHaveBeenCalledTimes(1);
  });
});
