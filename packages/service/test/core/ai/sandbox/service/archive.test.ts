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
  getSandboxAdapterConfig: vi.fn(),
  connectToSandbox: vi.fn(),
  disconnectSandbox: vi.fn(),
  getSandboxRuntimeProfile: vi.fn(),
  getSessionVolumeConfig: vi.fn(),
  deleteSessionVolume: vi.fn(),
  clearSandboxArchiveState: vi.fn(),
  findSandboxArchiveStateBySandboxId: vi.fn(),
  findSandboxInstanceArchiveState: vi.fn(),
  findSandboxResourcesToArchive: vi.fn(),
  markSandboxArchived: vi.fn(),
  markSandboxArchiving: vi.fn(),
  markSandboxRestored: vi.fn(),
  markSandboxRestoring: vi.fn(),
  rollbackSandboxRestoring: vi.fn(),
  markSandboxResourceStopped: vi.fn(),
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
    downloadWorkspaceArchive: archiveMocks.downloadWorkspaceArchive
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
  findSandboxArchiveStateBySandboxId: archiveMocks.findSandboxArchiveStateBySandboxId,
  findSandboxInstanceArchiveState: archiveMocks.findSandboxInstanceArchiveState,
  findSandboxResourcesToArchive: archiveMocks.findSandboxResourcesToArchive,
  markSandboxArchived: archiveMocks.markSandboxArchived,
  markSandboxArchiving: archiveMocks.markSandboxArchiving,
  markSandboxRestored: archiveMocks.markSandboxRestored,
  markSandboxRestoring: archiveMocks.markSandboxRestoring,
  rollbackSandboxRestoring: archiveMocks.rollbackSandboxRestoring,
  markSandboxResourceStopped: archiveMocks.markSandboxResourceStopped
}));

vi.mock('@fastgpt/service/core/ai/sandbox/provider/adapter', () => ({
  buildSandboxResourceAdapter: archiveMocks.buildSandboxResourceAdapter
}));

import {
  archiveSandboxResource,
  restoreArchivedSandboxBeforeUse
} from '@fastgpt/service/core/ai/sandbox/service/archive';

const archiveNow = new Date('2026-02-10T00:00:00.000Z');

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
    deleteFiles: vi.fn(async () => [
      {
        path: '/workspace/.fastgpt-sandbox-archive.zip',
        success: true,
        error: null
      }
    ])
  }) as any;

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
    archiveMocks.disconnectSandbox.mockResolvedValue(undefined);
    archiveMocks.clearSandboxArchiveState.mockResolvedValue(undefined);
    archiveMocks.findSandboxArchiveStateBySandboxId.mockResolvedValue(null);
    archiveMocks.markSandboxArchived.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    archiveMocks.markSandboxRestored.mockImplementation(async (resource, params) => ({
      ...resource,
      ...params,
      metadata: {
        volumeEnabled: params.metadata?.volumeEnabled
      }
    }));
    archiveMocks.rollbackSandboxRestoring.mockResolvedValue(undefined);
    archiveMocks.markSandboxResourceStopped.mockResolvedValue(undefined);
    archiveMocks.buildSandboxResourceAdapter.mockReturnValue({
      delete: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined)
    });
  });

  it('archives via provider lifecycle and deletes remote resource only after second inactive check', async () => {
    const resource = createResource();
    const sandbox = createSandbox();
    const remoteResource = { delete: vi.fn(async () => undefined), stop: vi.fn() };
    archiveMocks.markSandboxArchiving.mockResolvedValue(resource);
    archiveMocks.connectToSandbox.mockResolvedValue(sandbox);
    archiveMocks.findSandboxInstanceArchiveState.mockResolvedValue(resource);
    archiveMocks.buildSandboxResourceAdapter.mockReturnValue(remoteResource);

    await archiveSandboxResource(resource, archiveNow);

    expect(archiveMocks.connectToSandbox).toHaveBeenCalledWith(
      { provider: 'opensandbox' },
      resource.sandboxId,
      { image: { repository: 'image' } }
    );
    expect(archiveMocks.uploadWorkspaceArchive).toHaveBeenCalledWith({
      sandboxId: resource.sandboxId,
      body: Buffer.from('zip-content')
    });
    expect(remoteResource.delete).toHaveBeenCalledTimes(1);
    expect(archiveMocks.deleteSessionVolume).toHaveBeenCalledWith(resource.sandboxId);
    expect(archiveMocks.markSandboxArchived).toHaveBeenCalledWith(resource);
  });

  it('aborts cleanup when second inactive check detects user activity', async () => {
    const resource = createResource();
    const sandbox = createSandbox();
    const remoteResource = { delete: vi.fn(), stop: vi.fn(async () => undefined) };
    archiveMocks.markSandboxArchiving.mockResolvedValue(resource);
    archiveMocks.connectToSandbox.mockResolvedValue(sandbox);
    archiveMocks.findSandboxInstanceArchiveState.mockResolvedValue({
      ...resource,
      lastActiveAt: new Date('2026-02-09T00:00:00.000Z')
    });
    archiveMocks.buildSandboxResourceAdapter.mockReturnValue(remoteResource);

    await archiveSandboxResource(resource, archiveNow);

    expect(archiveMocks.clearSandboxArchiveState).toHaveBeenCalledWith(resource);
    expect(archiveMocks.markSandboxArchived).not.toHaveBeenCalled();
    expect(remoteResource.delete).not.toHaveBeenCalled();
    expect(remoteResource.stop).not.toHaveBeenCalled();
  });

  it('restores archive from an old provider record into the current provider', async () => {
    const oldProviderResource = createResource({
      provider: 'opensandbox',
      metadata: {
        archive: {
          state: 'archived'
        }
      }
    });
    const restoringDoc = {
      ...oldProviderResource,
      metadata: {
        archive: {
          state: 'restoring'
        }
      }
    };
    const sandbox = createSandbox();
    archiveMocks.findSandboxInstanceArchiveState.mockResolvedValue(null);
    archiveMocks.findSandboxArchiveStateBySandboxId.mockResolvedValue(oldProviderResource);
    archiveMocks.markSandboxRestoring.mockResolvedValue(restoringDoc);
    archiveMocks.connectToSandbox.mockResolvedValue(sandbox);

    await restoreArchivedSandboxBeforeUse({
      provider: 'sealosdevbox',
      sandboxId: oldProviderResource.sandboxId,
      appId: 'app-1',
      userId: 'user-1',
      chatId: 'chat-1'
    });

    expect(archiveMocks.findSandboxArchiveStateBySandboxId).toHaveBeenCalledWith(
      oldProviderResource.sandboxId
    );
    expect(archiveMocks.markSandboxRestoring).toHaveBeenCalledWith({
      provider: 'opensandbox',
      sandboxId: oldProviderResource.sandboxId,
      _id: oldProviderResource._id
    });
    expect(archiveMocks.getSandboxAdapterConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'sealosdevbox'
      })
    );
    expect(archiveMocks.downloadWorkspaceArchive).toHaveBeenCalledWith({
      sandboxId: oldProviderResource.sandboxId
    });
    expect(archiveMocks.markSandboxRestored).toHaveBeenCalledWith(
      restoringDoc,
      expect.objectContaining({
        provider: 'sealosdevbox',
        appId: 'app-1',
        userId: 'user-1',
        chatId: 'chat-1',
        metadata: {
          volumeEnabled: false
        }
      })
    );
  });
});
