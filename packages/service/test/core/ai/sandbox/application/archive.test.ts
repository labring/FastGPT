import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const archiveMocks = vi.hoisted(() => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  },
  uploadWorkspaceArchive: vi.fn(),
  downloadWorkspaceArchive: vi.fn(),
  deleteWorkspaceArchive: vi.fn(),
  getSandboxAdapterConfig: vi.fn(),
  connectToSandbox: vi.fn(),
  disconnectSandbox: vi.fn(),
  getSandboxRuntimeProfile: vi.fn(),
  getSessionVolumeConfig: vi.fn(),
  deleteSessionVolume: vi.fn(),
  clearFailedSandboxArchiveState: vi.fn(),
  clearSandboxArchiveState: vi.fn(),
  clearStaleArchivingSandboxStates: vi.fn(),
  markStaleDeletingSandboxStatesArchived: vi.fn(),
  createSandboxResourcesToArchiveCursor: vi.fn(),
  findSandboxInstanceArchiveState: vi.fn(),
  markSandboxArchived: vi.fn(),
  markSandboxArchiveFailed: vi.fn(),
  markSandboxArchiving: vi.fn(),
  markSandboxArchivingForRuntimeUpgrade: vi.fn(),
  markSandboxDeletingError: vi.fn(),
  markSandboxRestored: vi.fn(),
  markSandboxRestoring: vi.fn(),
  markSandboxResourceStopped: vi.fn(),
  rollbackSandboxRestoring: vi.fn(),
  tryMarkSandboxDeleting: vi.fn(),
  buildSandboxResourceAdapter: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => archiveMocks.logger,
  LogCategories: {
    MODULE: {
      AI: {
        SANDBOX: 'sandbox'
      }
    }
  }
}));

vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({
  getS3SandboxSource: () => ({
    uploadWorkspaceArchive: archiveMocks.uploadWorkspaceArchive,
    downloadWorkspaceArchive: archiveMocks.downloadWorkspaceArchive,
    deleteWorkspaceArchive: archiveMocks.deleteWorkspaceArchive
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/config', () => ({
  getSandboxAdapterConfig: archiveMocks.getSandboxAdapterConfig
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/lifecycle', () => ({
  connectToSandbox: archiveMocks.connectToSandbox,
  disconnectSandbox: archiveMocks.disconnectSandbox
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile', () => ({
  getSandboxRuntimeProfile: archiveMocks.getSandboxRuntimeProfile
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/volume/service', () => ({
  getSessionVolumeConfig: archiveMocks.getSessionVolumeConfig,
  deleteSessionVolume: archiveMocks.deleteSessionVolume
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  clearFailedSandboxArchiveState: archiveMocks.clearFailedSandboxArchiveState,
  clearSandboxArchiveState: archiveMocks.clearSandboxArchiveState,
  clearStaleArchivingSandboxStates: archiveMocks.clearStaleArchivingSandboxStates,
  markStaleDeletingSandboxStatesArchived: archiveMocks.markStaleDeletingSandboxStatesArchived,
  createSandboxResourcesToArchiveCursor: archiveMocks.createSandboxResourcesToArchiveCursor,
  findSandboxInstanceArchiveState: archiveMocks.findSandboxInstanceArchiveState,
  markSandboxArchived: archiveMocks.markSandboxArchived,
  markSandboxArchiveFailed: archiveMocks.markSandboxArchiveFailed,
  markSandboxArchiving: archiveMocks.markSandboxArchiving,
  markSandboxArchivingForRuntimeUpgrade: archiveMocks.markSandboxArchivingForRuntimeUpgrade,
  markSandboxDeletingError: archiveMocks.markSandboxDeletingError,
  markSandboxRestored: archiveMocks.markSandboxRestored,
  markSandboxRestoring: archiveMocks.markSandboxRestoring,
  markSandboxResourceStopped: archiveMocks.markSandboxResourceStopped,
  rollbackSandboxRestoring: archiveMocks.rollbackSandboxRestoring,
  tryMarkSandboxDeleting: archiveMocks.tryMarkSandboxDeleting
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter', () => ({
  buildSandboxResourceAdapter: archiveMocks.buildSandboxResourceAdapter
}));

import {
  assertSandboxNotArchivedOrBusy,
  archiveInactiveSandboxes,
  archiveSandboxResource,
  clearStaleArchivingSandboxes,
  startSandboxRuntimeUpgradeArchive,
  restoreArchivedSandboxBeforeUse
} from '@fastgpt/service/core/ai/sandbox/application/archive';

const inactiveBefore = new Date('2026-02-03T00:00:00.000Z');

const createResource = (overrides: Partial<any> = {}) => ({
  _id: 'resource-id',
  provider: 'opensandbox',
  sandboxId: 'archive-sandbox',
  status: SandboxStatusEnum.stopped,
  lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
  metadata: {
    archive: {
      state: 'archiving',
      startedAt: new Date('2026-01-01T00:00:00.000Z')
    }
  },
  ...overrides
});

const createSandbox = () =>
  ({
    execute: vi.fn(async (command: string) => ({
      stdout: command.includes('wc -l') ? '1\n' : command.includes("awk '{s+=$7}") ? '12\n' : '',
      stderr: '',
      exitCode: 0
    })),
    readFiles: vi.fn(async () => [
      {
        path: '/workspace/.fastgpt-sandbox-archive.zip',
        content: Buffer.from('zip-content'),
        error: null
      }
    ]),
    writeFiles: vi.fn(async () => [
      {
        path: '/workspace/.fastgpt-sandbox-restore.zip',
        bytesWritten: 3,
        error: null
      }
    ]),
    stop: vi.fn(async () => undefined),
    deleteFiles: vi.fn(async () => [
      {
        path: '/workspace/.fastgpt-sandbox-archive.zip',
        success: true,
        error: null
      }
    ])
  }) as any;

const createResourceCursor = (resources: ReturnType<typeof createResource>[]) => ({
  async *[Symbol.asyncIterator]() {
    for (const resource of resources) {
      yield resource;
    }
  },
  close: vi.fn(async () => undefined)
});

describe('sandbox archive application', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    archiveMocks.getSandboxRuntimeProfile.mockReturnValue({
      workDirectory: '/workspace'
    });
    archiveMocks.getSandboxAdapterConfig.mockReturnValue({
      providerConfig: { provider: 'opensandbox' },
      createConfig: { image: { repository: 'image' } }
    });
    archiveMocks.getSessionVolumeConfig.mockResolvedValue({
      storage: { mountPath: '/workspace' },
      volumes: []
    });
    archiveMocks.deleteSessionVolume.mockResolvedValue(undefined);
    archiveMocks.uploadWorkspaceArchive.mockResolvedValue(undefined);
    archiveMocks.downloadWorkspaceArchive.mockResolvedValue(Buffer.from('zip'));
    archiveMocks.deleteWorkspaceArchive.mockResolvedValue(undefined);
    archiveMocks.disconnectSandbox.mockResolvedValue(undefined);
    archiveMocks.clearFailedSandboxArchiveState.mockResolvedValue(undefined);
    archiveMocks.clearSandboxArchiveState.mockResolvedValue(undefined);
    archiveMocks.clearStaleArchivingSandboxStates.mockResolvedValue(undefined);
    archiveMocks.markStaleDeletingSandboxStatesArchived.mockResolvedValue(undefined);
    archiveMocks.markSandboxArchived.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    archiveMocks.markSandboxArchiveFailed.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    archiveMocks.markSandboxDeletingError.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    archiveMocks.tryMarkSandboxDeleting.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    archiveMocks.markSandboxRestored.mockImplementation(async (resource, params) => ({
      ...resource,
      ...params,
      metadata: {
        volumeEnabled: params.metadata?.volumeEnabled
      }
    }));
    archiveMocks.markSandboxRestoring.mockImplementation(async (resource) => ({
      ...resource,
      metadata: {
        archive: {
          state: 'restoring'
        }
      }
    }));
    archiveMocks.rollbackSandboxRestoring.mockResolvedValue(undefined);
    archiveMocks.markSandboxResourceStopped.mockResolvedValue(undefined);
    archiveMocks.buildSandboxResourceAdapter.mockReturnValue({
      delete: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined)
    });
  });

  it('runs archive cron against streamed archive resources in groups of 5', async () => {
    const resources = Array.from({ length: 7 }).map((_, index) =>
      createResource({ sandboxId: `archive-sandbox-${index}` })
    );
    const cursor = createResourceCursor(resources);
    const events: string[] = [];

    archiveMocks.createSandboxResourcesToArchiveCursor.mockReturnValue(cursor);
    archiveMocks.markSandboxArchiving.mockImplementation(async (resource) => {
      events.push(`start:${resource.sandboxId}`);
      await Promise.resolve();
      events.push(`finish:${resource.sandboxId}`);
      return null;
    });

    await archiveInactiveSandboxes(new Date('2026-02-10T00:00:00.000Z'));

    expect(archiveMocks.markSandboxArchiving).toHaveBeenCalledTimes(resources.length);
    expect(events).toEqual([
      'start:archive-sandbox-0',
      'start:archive-sandbox-1',
      'start:archive-sandbox-2',
      'start:archive-sandbox-3',
      'start:archive-sandbox-4',
      'finish:archive-sandbox-0',
      'finish:archive-sandbox-1',
      'finish:archive-sandbox-2',
      'finish:archive-sandbox-3',
      'finish:archive-sandbox-4',
      'start:archive-sandbox-5',
      'start:archive-sandbox-6',
      'finish:archive-sandbox-5',
      'finish:archive-sandbox-6'
    ]);
    expect(cursor.close).toHaveBeenCalledTimes(1);
  });

  it('archives via provider lifecycle, deletes remote resource, then exposes archived state', async () => {
    const resource = createResource();
    const sandbox = createSandbox();
    const remoteResource = { delete: vi.fn(async () => undefined), stop: vi.fn() };
    archiveMocks.markSandboxArchiving.mockResolvedValue(resource);
    archiveMocks.connectToSandbox.mockResolvedValue(sandbox);
    archiveMocks.findSandboxInstanceArchiveState.mockResolvedValue(resource);
    archiveMocks.buildSandboxResourceAdapter.mockReturnValue(remoteResource);

    await archiveSandboxResource(resource, inactiveBefore);

    expect(archiveMocks.uploadWorkspaceArchive).toHaveBeenCalledWith({
      sandboxId: resource.sandboxId,
      body: Buffer.from('zip-content')
    });
    expect(archiveMocks.tryMarkSandboxDeleting).toHaveBeenCalledWith(resource, { inactiveBefore });
    expect(remoteResource.delete).toHaveBeenCalledTimes(1);
    expect(archiveMocks.markSandboxArchived).toHaveBeenCalledWith(resource);
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining('command -v zip'), {
      timeoutMs: 600_000,
      maxOutputBytes: 8 * 1024
    });
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining('zip -r'), {
      timeoutMs: 600_000,
      maxOutputBytes: 8 * 1024
    });
  });

  it('keeps deleting state and S3 archive when remote cleanup fails', async () => {
    const resource = createResource();
    const sandbox = createSandbox();
    const remoteResource = {
      delete: vi.fn(async () => Promise.reject(new Error('delete failed'))),
      stop: vi.fn()
    };
    archiveMocks.markSandboxArchiving.mockResolvedValue(resource);
    archiveMocks.connectToSandbox.mockResolvedValue(sandbox);
    archiveMocks.buildSandboxResourceAdapter.mockReturnValue(remoteResource);

    const result = await archiveSandboxResource(resource, inactiveBefore);

    expect(result).toEqual({
      status: 'failed',
      error: 'Failed to delete remote resource: delete failed'
    });
    expect(remoteResource.delete).toHaveBeenCalledTimes(1);
    expect(archiveMocks.markSandboxArchived).not.toHaveBeenCalled();
    expect(archiveMocks.markSandboxDeletingError).toHaveBeenCalledWith(
      resource,
      'Failed to delete remote resource: delete failed'
    );
    expect(archiveMocks.markSandboxArchiveFailed).not.toHaveBeenCalled();
    expect(archiveMocks.deleteWorkspaceArchive).not.toHaveBeenCalled();
    expect(archiveMocks.clearSandboxArchiveState).not.toHaveBeenCalled();
    expect(remoteResource.stop).not.toHaveBeenCalled();
  });

  it('does not stop temporary sandbox when failure fallback detects deleting state', async () => {
    const resource = createResource();
    const sandbox = createSandbox();
    const remoteResource = { delete: vi.fn(), stop: vi.fn(async () => undefined) };
    archiveMocks.markSandboxArchiving.mockResolvedValue(resource);
    archiveMocks.connectToSandbox.mockResolvedValue(sandbox);
    archiveMocks.uploadWorkspaceArchive.mockRejectedValueOnce(new Error('upload failed'));
    archiveMocks.markSandboxArchiveFailed.mockResolvedValueOnce({
      matchedCount: 0,
      modifiedCount: 0
    });
    archiveMocks.findSandboxInstanceArchiveState.mockResolvedValue({
      ...resource,
      metadata: {
        archive: {
          state: 'deleting',
          startedAt: resource.metadata.archive.startedAt
        }
      }
    });
    archiveMocks.buildSandboxResourceAdapter.mockReturnValue(remoteResource);

    const result = await archiveSandboxResource(resource, inactiveBefore);

    expect(result).toEqual({
      status: 'failed',
      error: 'upload failed'
    });
    expect(archiveMocks.markSandboxDeletingError).toHaveBeenCalledWith(resource, 'upload failed');
    expect(remoteResource.stop).not.toHaveBeenCalled();
    expect(archiveMocks.markSandboxResourceStopped).not.toHaveBeenCalled();
  });

  it('records deleting error when Mongo archived mark loses after remote deletion', async () => {
    const resource = createResource();
    const sandbox = createSandbox();
    const remoteResource = { delete: vi.fn(async () => undefined), stop: vi.fn() };
    archiveMocks.markSandboxArchiving.mockResolvedValue(resource);
    archiveMocks.connectToSandbox.mockResolvedValue(sandbox);
    archiveMocks.buildSandboxResourceAdapter.mockReturnValue(remoteResource);
    archiveMocks.markSandboxArchived.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });

    const result = await archiveSandboxResource(resource, inactiveBefore);

    expect(result).toEqual({
      status: 'failed',
      error: 'Sandbox record changed after remote resource deletion'
    });
    expect(remoteResource.delete).toHaveBeenCalledTimes(1);
    expect(archiveMocks.clearSandboxArchiveState).not.toHaveBeenCalled();
    expect(archiveMocks.markSandboxDeletingError).toHaveBeenCalledWith(
      resource,
      'Sandbox record changed after remote deletion'
    );
  });

  it('aborts cleanup when second inactive check detects user activity', async () => {
    const resource = createResource();
    const sandbox = createSandbox();
    const remoteResource = { delete: vi.fn(), stop: vi.fn(async () => undefined) };
    archiveMocks.markSandboxArchiving.mockResolvedValue(resource);
    archiveMocks.connectToSandbox.mockResolvedValue(sandbox);
    archiveMocks.tryMarkSandboxDeleting.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    archiveMocks.findSandboxInstanceArchiveState.mockResolvedValue({
      ...resource,
      lastActiveAt: new Date('2026-02-04T00:00:00.000Z')
    });
    archiveMocks.buildSandboxResourceAdapter.mockReturnValue(remoteResource);

    await archiveSandboxResource(resource, inactiveBefore);

    expect(archiveMocks.clearSandboxArchiveState).toHaveBeenCalledWith(resource);
    expect(archiveMocks.deleteWorkspaceArchive).not.toHaveBeenCalled();
    expect(archiveMocks.tryMarkSandboxDeleting).toHaveBeenCalledWith(resource, { inactiveBefore });
    expect(remoteResource.delete).not.toHaveBeenCalled();
    expect(remoteResource.stop).not.toHaveBeenCalled();
    expect(archiveMocks.markSandboxArchived).not.toHaveBeenCalled();
  });

  it('archives runtime upgrade resources without inactive checks', async () => {
    const resource = createResource({
      status: SandboxStatusEnum.running,
      metadata: {
        image: { repository: 'old-runtime' }
      }
    });
    const archivingResource = {
      ...resource,
      metadata: {
        ...resource.metadata,
        archive: {
          state: 'archiving',
          startedAt: new Date('2026-01-01T00:00:00.000Z')
        }
      }
    };
    const sandbox = createSandbox();
    const remoteResource = { delete: vi.fn(async () => undefined), stop: vi.fn() };
    archiveMocks.markSandboxArchivingForRuntimeUpgrade.mockResolvedValue(archivingResource);
    archiveMocks.connectToSandbox.mockResolvedValue(sandbox);
    archiveMocks.buildSandboxResourceAdapter.mockReturnValue(remoteResource);

    const result = await startSandboxRuntimeUpgradeArchive(resource);

    expect(result).toEqual({ success: true, archivingDoc: archivingResource });
    expect(archiveMocks.markSandboxArchivingForRuntimeUpgrade).toHaveBeenCalledWith(resource);
    await vi.waitFor(() =>
      expect(archiveMocks.markSandboxArchived).toHaveBeenCalledWith(archivingResource)
    );
    expect(archiveMocks.tryMarkSandboxDeleting).toHaveBeenCalledWith(archivingResource, {
      inactiveBefore: undefined
    });
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining('command -v zip'), {
      timeoutMs: 600_000,
      maxOutputBytes: 8 * 1024
    });
    expect(remoteResource.delete).toHaveBeenCalledTimes(1);
  });

  it('marks runtime upgrade archive failed so users can retry after archive failure', async () => {
    const resource = createResource({
      status: SandboxStatusEnum.running,
      metadata: {
        image: { repository: 'old-runtime' }
      }
    });
    const archivingResource = {
      ...resource,
      metadata: {
        ...resource.metadata,
        archive: {
          state: 'archiving',
          startedAt: new Date('2026-01-01T00:00:00.000Z')
        }
      }
    };
    const sandbox = createSandbox();
    archiveMocks.markSandboxArchivingForRuntimeUpgrade.mockResolvedValue(archivingResource);
    archiveMocks.connectToSandbox.mockResolvedValue(sandbox);
    archiveMocks.uploadWorkspaceArchive.mockRejectedValueOnce(new Error('upload failed'));

    const result = await startSandboxRuntimeUpgradeArchive(resource);

    expect(result).toEqual({ success: true, archivingDoc: archivingResource });
    await vi.waitFor(() =>
      expect(archiveMocks.markSandboxArchiveFailed).toHaveBeenCalledWith(
        archivingResource,
        'upload failed'
      )
    );
    expect(archiveMocks.markSandboxArchived).not.toHaveBeenCalled();
  });

  it('restores archive from the current provider record before runtime use', async () => {
    const archivedResource = createResource({
      metadata: {
        archive: {
          state: 'archived'
        }
      }
    });
    const sandbox = createSandbox();
    archiveMocks.findSandboxInstanceArchiveState.mockResolvedValue(archivedResource);
    archiveMocks.connectToSandbox.mockResolvedValue(sandbox);

    await restoreArchivedSandboxBeforeUse({
      provider: 'opensandbox',
      sandboxId: archivedResource.sandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      userId: 'user-1',
      chatId: 'chat-1'
    });

    expect(archiveMocks.downloadWorkspaceArchive).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: archivedResource.sandboxId
      })
    );
    expect(sandbox.writeFiles).toHaveBeenCalledWith([
      {
        path: '/workspace/.fastgpt-sandbox-restore.zip',
        data: Buffer.from('zip')
      }
    ]);
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining('command -v unzip'), {
      timeoutMs: 600_000,
      maxOutputBytes: 8 * 1024
    });
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining('unzip -o -q'), {
      timeoutMs: 600_000,
      maxOutputBytes: 8 * 1024
    });
    expect(archiveMocks.markSandboxRestoring).toHaveBeenCalledWith(archivedResource);
    expect(archiveMocks.markSandboxRestored).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: archivedResource.sandboxId,
        metadata: {
          archive: {
            state: 'restoring'
          }
        }
      }),
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        userId: 'user-1',
        chatId: 'chat-1',
        storage: { mountPath: '/workspace' },
        metadata: {
          volumeEnabled: true
        }
      })
    );
  });

  it('waits for concurrent restore instead of reporting runtime upgrade in progress', async () => {
    vi.useFakeTimers();
    try {
      const restoringResource = createResource({
        metadata: {
          archive: {
            state: 'restoring'
          }
        }
      });
      const restoredResource = createResource({
        metadata: {}
      });
      archiveMocks.findSandboxInstanceArchiveState
        .mockResolvedValueOnce(restoringResource)
        .mockResolvedValueOnce(restoredResource);

      const restorePromise = restoreArchivedSandboxBeforeUse({
        provider: 'opensandbox',
        sandboxId: restoringResource.sandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1'
      });

      await vi.advanceTimersByTimeAsync(1000);

      await expect(restorePromise).resolves.toBeUndefined();
      expect(archiveMocks.markSandboxRestoring).not.toHaveBeenCalled();
      expect(archiveMocks.connectToSandbox).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('continues restoring when concurrent archive finishes while waiting', async () => {
    vi.useFakeTimers();
    try {
      const archivingResource = createResource({
        metadata: {
          archive: {
            state: 'archiving'
          }
        }
      });
      const archivedResource = createResource({
        metadata: {
          archive: {
            state: 'archived'
          }
        }
      });
      const sandbox = createSandbox();
      archiveMocks.findSandboxInstanceArchiveState
        .mockResolvedValueOnce(archivingResource)
        .mockResolvedValueOnce(archivedResource);
      archiveMocks.connectToSandbox.mockResolvedValue(sandbox);

      const restorePromise = restoreArchivedSandboxBeforeUse({
        provider: 'opensandbox',
        sandboxId: archivingResource.sandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1'
      });

      await vi.advanceTimersByTimeAsync(1000);

      await expect(restorePromise).resolves.toBeUndefined();
      expect(archiveMocks.markSandboxRestoring).toHaveBeenCalledWith(archivedResource);
      expect(archiveMocks.connectToSandbox).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores directly from deleting archive without deleting remote again', async () => {
    const deletingResource = createResource({
      metadata: {
        archive: {
          state: 'deleting',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          deleteStartedAt: new Date('2026-01-01T00:01:00.000Z')
        }
      }
    });
    const sandbox = createSandbox();
    const remoteResource = { delete: vi.fn(async () => undefined), stop: vi.fn() };
    archiveMocks.findSandboxInstanceArchiveState.mockResolvedValue(deletingResource);
    archiveMocks.buildSandboxResourceAdapter.mockReturnValue(remoteResource);
    archiveMocks.connectToSandbox.mockResolvedValue(sandbox);

    await restoreArchivedSandboxBeforeUse({
      provider: 'opensandbox',
      sandboxId: deletingResource.sandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1'
    });

    expect(archiveMocks.markSandboxRestoring).toHaveBeenCalledWith(deletingResource);
    expect(remoteResource.delete).not.toHaveBeenCalled();
    expect(archiveMocks.markSandboxArchived).not.toHaveBeenCalled();
    expect(archiveMocks.markSandboxDeletingError).not.toHaveBeenCalled();
    expect(archiveMocks.connectToSandbox).toHaveBeenCalledTimes(1);
  });

  it('applies failed archive policy when busy wait ends with failed state', async () => {
    vi.useFakeTimers();
    try {
      const archivingResource = createResource({
        metadata: {
          archive: {
            state: 'archiving'
          }
        }
      });
      const failedResource = createResource({
        metadata: {
          archive: {
            state: 'failed',
            error: 'upload failed'
          }
        }
      });
      archiveMocks.findSandboxInstanceArchiveState
        .mockResolvedValueOnce(archivingResource)
        .mockResolvedValueOnce(failedResource);

      const restorePromise = restoreArchivedSandboxBeforeUse({
        provider: 'opensandbox',
        sandboxId: archivingResource.sandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        failedArchivePolicy: 'clearAndContinue'
      });

      await vi.advanceTimersByTimeAsync(1000);

      await expect(restorePromise).resolves.toBeUndefined();
      expect(archiveMocks.clearFailedSandboxArchiveState).toHaveBeenCalledWith(failedResource);
      expect(archiveMocks.connectToSandbox).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears failed archive only when runtime request explicitly allows it', async () => {
    const failedResource = createResource({
      metadata: {
        archive: {
          state: 'failed',
          error: 'upload failed'
        }
      }
    });
    archiveMocks.findSandboxInstanceArchiveState.mockResolvedValue(failedResource);

    await restoreArchivedSandboxBeforeUse({
      provider: 'opensandbox',
      sandboxId: failedResource.sandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      failedArchivePolicy: 'clearAndContinue'
    });

    expect(archiveMocks.clearFailedSandboxArchiveState).toHaveBeenCalledWith(failedResource);
    expect(archiveMocks.connectToSandbox).not.toHaveBeenCalled();
  });

  it('throws failed archive state when runtime request does not allow clearing it', async () => {
    const failedResource = createResource({
      metadata: {
        archive: {
          state: 'failed',
          error: 'upload failed'
        }
      }
    });
    archiveMocks.findSandboxInstanceArchiveState.mockResolvedValue(failedResource);

    await expect(
      restoreArchivedSandboxBeforeUse({
        provider: 'opensandbox',
        sandboxId: failedResource.sandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1'
      })
    ).rejects.toThrow('Sandbox is failed');
    expect(archiveMocks.clearFailedSandboxArchiveState).not.toHaveBeenCalled();
  });

  it('blocks keepalive-style access for deleting and failed archive states', async () => {
    archiveMocks.findSandboxInstanceArchiveState.mockResolvedValueOnce(
      createResource({
        metadata: {
          archive: {
            state: 'deleting'
          }
        }
      })
    );
    await expect(
      assertSandboxNotArchivedOrBusy({
        provider: 'opensandbox',
        sandboxId: 'archive-sandbox'
      })
    ).rejects.toThrow('Sandbox is deleting');

    archiveMocks.findSandboxInstanceArchiveState.mockResolvedValueOnce(
      createResource({
        metadata: {
          archive: {
            state: 'failed'
          }
        }
      })
    );
    await expect(
      assertSandboxNotArchivedOrBusy({
        provider: 'opensandbox',
        sandboxId: 'archive-sandbox'
      })
    ).rejects.toThrow('Sandbox is failed');
  });

  it('waits when archived restore claim loses to a concurrent restore', async () => {
    vi.useFakeTimers();
    try {
      const archivedResource = createResource({
        metadata: {
          archive: {
            state: 'archived'
          }
        }
      });
      const restoringResource = createResource({
        metadata: {
          archive: {
            state: 'restoring'
          }
        }
      });
      const restoredResource = createResource({
        metadata: {}
      });
      archiveMocks.findSandboxInstanceArchiveState
        .mockResolvedValueOnce(archivedResource)
        .mockResolvedValueOnce(restoringResource)
        .mockResolvedValueOnce(restoredResource);
      archiveMocks.markSandboxRestoring.mockResolvedValueOnce(null);

      const restorePromise = restoreArchivedSandboxBeforeUse({
        provider: 'opensandbox',
        sandboxId: archivedResource.sandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1'
      });

      await vi.advanceTimersByTimeAsync(1000);

      await expect(restorePromise).resolves.toBeUndefined();
      expect(archiveMocks.connectToSandbox).not.toHaveBeenCalled();
      expect(archiveMocks.markSandboxRestoring).toHaveBeenCalledWith(archivedResource);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects when deleting restore claim loses without a concurrent restore', async () => {
    const deletingResource = createResource({
      metadata: {
        archive: {
          state: 'deleting',
          startedAt: new Date('2026-01-01T00:00:00.000Z'),
          deleteStartedAt: new Date('2026-01-01T00:01:00.000Z')
        }
      }
    });
    archiveMocks.findSandboxInstanceArchiveState
      .mockResolvedValueOnce(deletingResource)
      .mockResolvedValueOnce(deletingResource);
    archiveMocks.markSandboxRestoring.mockResolvedValueOnce(null);

    await expect(
      restoreArchivedSandboxBeforeUse({
        provider: 'opensandbox',
        sandboxId: deletingResource.sandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1'
      })
    ).rejects.toThrow('Sandbox is deleting');

    expect(archiveMocks.connectToSandbox).not.toHaveBeenCalled();
  });

  it('stops restored sandbox and rejects when the archive record is deleted during restore', async () => {
    const archivedResource = createResource({
      metadata: {
        archive: {
          state: 'archived'
        }
      }
    });
    const sandbox = createSandbox();
    archiveMocks.findSandboxInstanceArchiveState
      .mockResolvedValueOnce(archivedResource)
      .mockResolvedValueOnce(null);
    archiveMocks.connectToSandbox.mockResolvedValue(sandbox);
    archiveMocks.markSandboxRestored.mockResolvedValueOnce(null);

    await expect(
      restoreArchivedSandboxBeforeUse({
        provider: 'opensandbox',
        sandboxId: archivedResource.sandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1'
      })
    ).rejects.toThrow('Sandbox archive record was deleted during restore');

    expect(sandbox.stop).toHaveBeenCalledTimes(1);
  });

  it('clears stale archiving records and finalizes stale deleting records in one cron', async () => {
    await clearStaleArchivingSandboxes(new Date('2026-02-01T00:15:00.000Z'));

    expect(archiveMocks.clearStaleArchivingSandboxStates).toHaveBeenCalledWith(
      new Date('2026-02-01T00:00:00.000Z')
    );
    expect(archiveMocks.markStaleDeletingSandboxStatesArchived).toHaveBeenCalledWith(
      new Date('2026-02-01T00:00:00.000Z')
    );
  });
});
