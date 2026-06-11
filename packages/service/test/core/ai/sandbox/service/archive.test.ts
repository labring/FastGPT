import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';

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
  clearSandboxArchiveState: vi.fn(),
  createSandboxResourcesToArchiveCursor: vi.fn(),
  findSandboxInstanceArchiveState: vi.fn(),
  isSandboxStillArchiving: vi.fn(),
  markSandboxArchived: vi.fn(),
  markSandboxArchiving: vi.fn(),
  markSandboxRestored: vi.fn(),
  markSandboxRestoring: vi.fn(),
  markSandboxResourceStopped: vi.fn(),
  rollbackSandboxRestoring: vi.fn(),
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

vi.mock('@fastgpt/service/core/ai/sandbox/provider/config', () => ({
  getSandboxAdapterConfig: archiveMocks.getSandboxAdapterConfig
}));

vi.mock('@fastgpt/service/core/ai/sandbox/provider/lifecycle', () => ({
  connectToSandbox: archiveMocks.connectToSandbox,
  disconnectSandbox: archiveMocks.disconnectSandbox
}));

vi.mock('@fastgpt/service/core/ai/sandbox/runtime/profile', () => ({
  getSandboxRuntimeProfile: archiveMocks.getSandboxRuntimeProfile
}));

vi.mock('@fastgpt/service/core/ai/sandbox/volume/service', () => ({
  getSessionVolumeConfig: archiveMocks.getSessionVolumeConfig,
  deleteSessionVolume: archiveMocks.deleteSessionVolume
}));

vi.mock('@fastgpt/service/core/ai/sandbox/instance/repository', () => ({
  clearSandboxArchiveState: archiveMocks.clearSandboxArchiveState,
  createSandboxResourcesToArchiveCursor: archiveMocks.createSandboxResourcesToArchiveCursor,
  findSandboxInstanceArchiveState: archiveMocks.findSandboxInstanceArchiveState,
  isSandboxStillArchiving: archiveMocks.isSandboxStillArchiving,
  markSandboxArchived: archiveMocks.markSandboxArchived,
  markSandboxArchiving: archiveMocks.markSandboxArchiving,
  markSandboxRestored: archiveMocks.markSandboxRestored,
  markSandboxRestoring: archiveMocks.markSandboxRestoring,
  markSandboxResourceStopped: archiveMocks.markSandboxResourceStopped,
  rollbackSandboxRestoring: archiveMocks.rollbackSandboxRestoring
}));

vi.mock('@fastgpt/service/core/ai/sandbox/provider/adapter', () => ({
  buildSandboxResourceAdapter: archiveMocks.buildSandboxResourceAdapter
}));

import {
  archiveInactiveSandboxes,
  archiveSandboxResource,
  restoreArchivedSandboxBeforeUse
} from '@fastgpt/service/core/ai/sandbox/service/archive';

const inactiveBefore = new Date('2026-02-03T00:00:00.000Z');

const createResource = (overrides: Partial<any> = {}) => ({
  _id: 'resource-id',
  provider: 'opensandbox',
  sandboxId: 'archive-sandbox',
  status: SandboxStatusEnum.stopped,
  lastActiveAt: new Date('2026-01-01T00:00:00.000Z'),
  metadata: {
    archive: {
      state: 'archiving'
    }
  },
  ...overrides
});

const createSandbox = () =>
  ({
    execute: vi.fn(async (command: string, _options?: unknown) => ({
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

describe('sandbox archive service', () => {
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
    archiveMocks.clearSandboxArchiveState.mockResolvedValue(undefined);
    archiveMocks.markSandboxArchived.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    archiveMocks.isSandboxStillArchiving.mockResolvedValue(true);
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
    expect(archiveMocks.isSandboxStillArchiving).toHaveBeenCalledWith(resource, inactiveBefore);
    expect(remoteResource.delete).toHaveBeenCalledTimes(1);
    expect(archiveMocks.markSandboxArchived).toHaveBeenCalledWith(resource);
    expect(sandbox.execute).toHaveBeenCalledWith(expect.stringContaining('zip -r'), {
      timeoutMs: 600_000,
      maxOutputBytes: 8 * 1024
    });
  });

  it('clears archiving state so cron can retry when remote cleanup fails', async () => {
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

    expect(result).toMatchObject({
      success: false,
      error: 'Failed to delete remote resource: delete failed'
    });
    expect(remoteResource.delete).toHaveBeenCalledTimes(1);
    expect(archiveMocks.markSandboxArchived).not.toHaveBeenCalled();
    expect(archiveMocks.deleteWorkspaceArchive).toHaveBeenCalledWith({
      sandboxId: resource.sandboxId
    });
    expect(archiveMocks.clearSandboxArchiveState).toHaveBeenCalledWith(resource);
    expect(remoteResource.stop).toHaveBeenCalledTimes(1);
  });

  it('does not clear archive state after remote resource has been deleted', async () => {
    const resource = createResource();
    const sandbox = createSandbox();
    const remoteResource = { delete: vi.fn(async () => undefined), stop: vi.fn() };
    archiveMocks.markSandboxArchiving.mockResolvedValue(resource);
    archiveMocks.connectToSandbox.mockResolvedValue(sandbox);
    archiveMocks.buildSandboxResourceAdapter.mockReturnValue(remoteResource);
    archiveMocks.markSandboxArchived.mockRejectedValueOnce(new Error('mongo failed'));

    const result = await archiveSandboxResource(resource, inactiveBefore);

    expect(result).toMatchObject({
      success: false,
      error: 'mongo failed'
    });
    expect(remoteResource.delete).toHaveBeenCalledTimes(1);
    expect(archiveMocks.clearSandboxArchiveState).not.toHaveBeenCalled();
  });

  it('aborts cleanup when second inactive check detects user activity', async () => {
    const resource = createResource();
    const sandbox = createSandbox();
    const remoteResource = { delete: vi.fn(), stop: vi.fn(async () => undefined) };
    archiveMocks.markSandboxArchiving.mockResolvedValue(resource);
    archiveMocks.connectToSandbox.mockResolvedValue(sandbox);
    archiveMocks.isSandboxStillArchiving.mockResolvedValue(false);
    archiveMocks.findSandboxInstanceArchiveState.mockResolvedValue({
      ...resource,
      lastActiveAt: new Date('2026-02-04T00:00:00.000Z')
    });
    archiveMocks.buildSandboxResourceAdapter.mockReturnValue(remoteResource);

    await archiveSandboxResource(resource, inactiveBefore);

    expect(archiveMocks.clearSandboxArchiveState).toHaveBeenCalledWith(resource);
    expect(archiveMocks.deleteWorkspaceArchive).toHaveBeenCalledWith({
      sandboxId: resource.sandboxId
    });
    expect(archiveMocks.isSandboxStillArchiving).toHaveBeenCalledWith(resource, inactiveBefore);
    expect(remoteResource.delete).not.toHaveBeenCalled();
    expect(remoteResource.stop).not.toHaveBeenCalled();
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
      appId: 'app-1',
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
        appId: 'app-1',
        userId: 'user-1',
        chatId: 'chat-1',
        storage: { mountPath: '/workspace' },
        metadata: {
          volumeEnabled: true
        }
      })
    );
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
        sandboxId: archivedResource.sandboxId
      })
    ).rejects.toThrow('Sandbox archive record was deleted during restore');

    expect(sandbox.stop).toHaveBeenCalledTimes(1);
  });
});
