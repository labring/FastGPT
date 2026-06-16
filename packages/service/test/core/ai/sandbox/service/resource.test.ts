import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  },
  buildSandboxResourceAdapter: vi.fn(),
  deleteSessionVolume: vi.fn(),
  deleteWorkspaceArchive: vi.fn(),
  deleteSandboxResourceRecord: vi.fn(),
  findSandboxResourcesByAppId: vi.fn(),
  findSandboxResourcesByChatIds: vi.fn(),
  markSandboxResourceStopped: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: {
    MODULE: {
      AI: {
        SANDBOX: 'sandbox'
      }
    }
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/provider/adapter', () => ({
  buildSandboxResourceAdapter: mocks.buildSandboxResourceAdapter
}));

vi.mock('@fastgpt/service/core/ai/sandbox/volume/service', () => ({
  deleteSessionVolume: mocks.deleteSessionVolume
}));

vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({
  getS3SandboxSource: () => ({
    deleteWorkspaceArchive: mocks.deleteWorkspaceArchive
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/instance/repository', () => ({
  deleteSandboxResourceRecord: mocks.deleteSandboxResourceRecord,
  findSandboxResourcesByAppId: mocks.findSandboxResourcesByAppId,
  findSandboxResourcesByChatIds: mocks.findSandboxResourcesByChatIds,
  markSandboxResourceStopped: mocks.markSandboxResourceStopped
}));

import {
  deleteSandboxResource,
  deleteSandboxesByAppId,
  deleteSandboxesByChatIds,
  stopSandboxResource,
  stopSandboxResources
} from '@fastgpt/service/core/ai/sandbox/service/resource';

const createResource = (sandboxId = 'sandbox-1') =>
  ({
    provider: 'opensandbox',
    sandboxId,
    appId: 'app-1',
    userId: 'user-1',
    chatId: 'chat-1'
  }) as any;

describe('sandbox resource service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildSandboxResourceAdapter.mockReturnValue({
      stop: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined)
    });
    mocks.deleteSessionVolume.mockResolvedValue(undefined);

    mocks.deleteWorkspaceArchive.mockResolvedValue(undefined);
    mocks.deleteSandboxResourceRecord.mockResolvedValue(undefined);
    mocks.findSandboxResourcesByAppId.mockResolvedValue([]);
    mocks.findSandboxResourcesByChatIds.mockResolvedValue([]);
    mocks.markSandboxResourceStopped.mockResolvedValue(undefined);
  });

  it('stops a resource and marks its record stopped', async () => {
    const resource = createResource();

    await stopSandboxResource(resource);

    const adapter = mocks.buildSandboxResourceAdapter.mock.results[0].value;
    expect(adapter.stop).toHaveBeenCalledTimes(1);
    expect(mocks.markSandboxResourceStopped).toHaveBeenCalledWith(resource);
  });

  it('does not mark stopped when stale cron stop loses the record CAS', async () => {
    const resource = {
      ...createResource(),
      lastActiveAt: new Date('2026-01-01T00:00:00.000Z')
    };
    const adapter = {
      stop: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined)
    };
    mocks.buildSandboxResourceAdapter.mockReturnValueOnce(adapter);
    mocks.markSandboxResourceStopped.mockResolvedValueOnce({ matchedCount: 0 });

    await stopSandboxResource(resource);

    expect(adapter.stop).toHaveBeenCalledTimes(1);
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      'Skip marking sandbox stopped because record changed after stop',
      expect.objectContaining({
        sandboxId: resource.sandboxId
      })
    );
  });

  it('deletes a resource and keeps deleting the record when volume cleanup fails', async () => {
    const resource = createResource();
    mocks.deleteSessionVolume.mockRejectedValueOnce(new Error('volume cleanup failed'));

    await deleteSandboxResource(resource);

    const adapter = mocks.buildSandboxResourceAdapter.mock.results[0].value;
    expect(adapter.delete).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSessionVolume).toHaveBeenCalledWith('sandbox-1');
    expect(mocks.deleteWorkspaceArchive).toHaveBeenCalledWith({
      sandboxId: 'sandbox-1'
    });
    expect(mocks.deleteSandboxResourceRecord).toHaveBeenCalledWith(resource);
    expect(mocks.logger.error).toHaveBeenCalledWith(
      'Failed to delete sandbox volume',
      expect.objectContaining({
        sandboxId: 'sandbox-1'
      })
    );
  });

  it('deletes a resource and skips deleting the volume when keepVolume is true', async () => {
    const resource = createResource();

    await deleteSandboxResource(resource, { keepVolume: true });

    const adapter = mocks.buildSandboxResourceAdapter.mock.results[0].value;
    expect(adapter.delete).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
    expect(mocks.deleteSandboxResourceRecord).toHaveBeenCalledWith(resource);
  });

  it('skips FastGPT volume deletion for Sealos resources', async () => {
    const resource = {
      ...createResource(),
      provider: 'sealosdevbox'
    };

    await deleteSandboxResource(resource);

    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
    expect(mocks.deleteSandboxResourceRecord).toHaveBeenCalledWith(resource);
  });

  it('returns early when chat or app cleanup finds no resources', async () => {
    await deleteSandboxesByChatIds({ appId: 'app-1', chatIds: ['chat-1'] });
    await deleteSandboxesByAppId('app-1');

    expect(mocks.buildSandboxResourceAdapter).not.toHaveBeenCalled();
  });

  it('logs delete failures while processing chat resources', async () => {
    const resource = createResource();
    mocks.findSandboxResourcesByChatIds.mockResolvedValueOnce([resource]);
    mocks.buildSandboxResourceAdapter.mockReturnValueOnce({
      stop: vi.fn(async () => undefined),
      delete: vi.fn(async () => {
        throw new Error('delete failed');
      })
    });

    await deleteSandboxesByChatIds({ appId: 'app-1', chatIds: ['chat-1'] });

    expect(mocks.logger.error).toHaveBeenCalledWith(
      'Failed to delete sandbox',
      expect.objectContaining({
        sandboxId: 'sandbox-1'
      })
    );
  });

  it('logs stop failures while processing inactive resources', async () => {
    const resource = createResource();
    mocks.buildSandboxResourceAdapter.mockReturnValueOnce({
      stop: vi.fn(async () => {
        throw new Error('stop failed');
      }),
      delete: vi.fn(async () => undefined)
    });

    await stopSandboxResources([resource]);

    expect(mocks.logger.error).toHaveBeenCalledWith(
      'Failed to stop sandbox',
      expect.objectContaining({
        sandboxId: 'sandbox-1'
      })
    );
  });
});
