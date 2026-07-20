import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  archiveSandboxResourceWithSaga: vi.fn(),
  restoreSandboxWithSaga: vi.fn(),
  createSandboxResourcesToArchiveCursor: vi.fn(),
  findSandboxInstanceBySandboxId: vi.fn(),
  connectToSandbox: vi.fn(),
  disconnectSandbox: vi.fn(),
  ensureConnectedSandboxRunning: vi.fn(),
  buildSandboxResourceAdapter: vi.fn(),
  buildRuntimeSandboxAdapter: vi.fn(),
  getSessionVolumeConfig: vi.fn(),
  deleteSessionVolume: vi.fn(),
  uploadWorkspaceArchive: vi.fn(),
  downloadWorkspaceArchive: vi.fn(),
  isWorkspaceArchiveExists: vi.fn(),
  getSandboxAdapterConfig: vi.fn(),
  getSandboxRuntimeProfile: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));

vi.mock('@fastgpt/global/common/system/utils', () => ({
  batchRun: async (items: unknown[], handler: (item: unknown) => Promise<unknown>) => {
    const results = [];
    for (const item of items) results.push(await handler(item));
    return results;
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lifecycle/service', () => ({
  archiveSandboxResourceWithSaga: mocks.archiveSandboxResourceWithSaga,
  restoreSandboxWithSaga: mocks.restoreSandboxWithSaga
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  createSandboxResourcesToArchiveCursor: mocks.createSandboxResourcesToArchiveCursor,
  findSandboxInstanceBySandboxId: mocks.findSandboxInstanceBySandboxId
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/lifecycle', () => ({
  connectToSandbox: mocks.connectToSandbox,
  disconnectSandbox: mocks.disconnectSandbox,
  ensureConnectedSandboxRunning: mocks.ensureConnectedSandboxRunning
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter', () => ({
  buildSandboxResourceAdapter: mocks.buildSandboxResourceAdapter,
  buildRuntimeSandboxAdapter: mocks.buildRuntimeSandboxAdapter
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
    isWorkspaceArchiveExists: mocks.isWorkspaceArchiveExists
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/config', () => ({
  getAgentSandboxArchiveMaxBytes: () => 1024 * 1024
}));

import {
  archiveSandboxResource,
  archiveSandboxResources,
  assertSandboxRuntimeUsableWithoutRestore,
  restoreArchivedSandboxBeforeUse,
  SandboxLifecycleStateError,
  startSandboxRuntimeUpgradeArchive,
  uploadSandboxWorkspaceArchive
} from '@fastgpt/service/core/ai/sandbox/application/archive';

const inactiveBefore = new Date('2026-07-10T00:00:00.000Z');

const createResource = (overrides: Record<string, unknown> = {}) =>
  ({
    provider: 'opensandbox',
    sandboxId: 'sandbox-1',
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'app-1',
    userId: 'user-1',
    status: 'running',
    lastActiveAt: new Date('2026-07-01T00:00:00.000Z'),
    metadata: {},
    ...overrides
  }) as any;

const createCursor = (resources: any[]) => {
  const close = vi.fn(async () => undefined);
  return {
    close,
    async *[Symbol.asyncIterator]() {
      for (const resource of resources) yield resource;
    }
  };
};

describe('sandbox archive Saga routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.archiveSandboxResourceWithSaga.mockResolvedValue(undefined);
    mocks.restoreSandboxWithSaga.mockResolvedValue(true);
    mocks.disconnectSandbox.mockResolvedValue(undefined);
  });

  it('dispatches eligible running and stopped resources to the archive Saga', async () => {
    const resources = [
      createResource({ sandboxId: 'running' }),
      createResource({ sandboxId: 'stopped', status: 'stopped' })
    ];

    for (const resource of resources) {
      await expect(archiveSandboxResource(resource, inactiveBefore)).resolves.toEqual({
        status: 'success'
      });
    }

    expect(mocks.archiveSandboxResourceWithSaga.mock.calls).toEqual(
      resources.map((resource) => [resource])
    );
  });

  it('archives the exact upstream resource recorded by the v2 aggregate', async () => {
    const sandbox = {
      provider: 'opensandbox',
      execute: vi.fn(async () => ({ stdout: '0', stderr: '', exitCode: 0 })),
      deleteFiles: vi.fn(async () => [])
    };
    mocks.getSessionVolumeConfig.mockResolvedValueOnce(undefined);
    mocks.getSandboxRuntimeProfile.mockReturnValueOnce({ workDirectory: '/workspace' });
    mocks.buildRuntimeSandboxAdapter.mockReturnValueOnce(sandbox);
    mocks.ensureConnectedSandboxRunning.mockResolvedValueOnce(undefined);
    mocks.uploadWorkspaceArchive.mockResolvedValueOnce(undefined);

    await uploadSandboxWorkspaceArchive({
      resource: createResource({ metadata: { upstreamId: 'exact-upstream' } }),
      idempotencyKey: 'archive-effect'
    });

    expect(mocks.buildRuntimeSandboxAdapter).toHaveBeenCalledWith('opensandbox', 'sandbox-1', {
      upstreamId: 'exact-upstream',
      vmConfig: undefined,
      createConfig: { metadata: { archive: 'true' } }
    });
    expect(mocks.ensureConnectedSandboxRunning).toHaveBeenCalledWith(sandbox);
  });

  it('skips a resource already in a lifecycle transition', async () => {
    await expect(
      archiveSandboxResource(createResource({ status: 'archiving' }), inactiveBefore)
    ).resolves.toEqual({ status: 'skipped', reason: 'Sandbox is archiving' });

    expect(mocks.archiveSandboxResourceWithSaga).not.toHaveBeenCalled();
  });

  it('skips a candidate that became active after the archive query', async () => {
    const resource = createResource({ lastActiveAt: inactiveBefore });

    await expect(archiveSandboxResource(resource, inactiveBefore)).resolves.toEqual({
      status: 'skipped',
      reason: 'Resource became active'
    });
    expect(mocks.archiveSandboxResourceWithSaga).not.toHaveBeenCalled();
  });

  it('creates a deferred archive Saga for runtime upgrades', async () => {
    const resource = createResource();
    const archivingDoc = createResource({ status: 'archiving' });
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(archivingDoc);

    await expect(startSandboxRuntimeUpgradeArchive(resource)).resolves.toEqual({
      success: true,
      archivingDoc
    });

    expect(mocks.archiveSandboxResourceWithSaga).toHaveBeenCalledWith(resource, { run: false });
    expect(mocks.findSandboxInstanceBySandboxId).toHaveBeenCalledWith({
      sandboxId: resource.sandboxId
    });
  });

  it('reports a runtime-upgrade conflict when the deferred Saga did not claim archiving', async () => {
    const resource = createResource();
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(
      createResource({ status: 'running' })
    );

    await expect(startSandboxRuntimeUpgradeArchive(resource)).resolves.toEqual({
      success: false,
      error: 'Resource was modified or occupied'
    });
    expect(mocks.archiveSandboxResourceWithSaga).toHaveBeenCalledWith(resource, { run: false });
  });

  it('batches candidates, isolates a Saga failure and reports cumulative progress', async () => {
    const resources = [
      createResource({ sandboxId: 'success-1' }),
      createResource({ sandboxId: 'success-2', status: 'stopped' }),
      createResource({ sandboxId: 'state-skip', status: 'archived' }),
      createResource({ sandboxId: 'failed' }),
      createResource({
        sandboxId: 'active-skip',
        lastActiveAt: new Date('2026-07-11T00:00:00.000Z')
      }),
      createResource({ sandboxId: 'success-3' })
    ];
    const cursor = createCursor(resources);
    const onProgress = vi.fn();
    mocks.createSandboxResourcesToArchiveCursor.mockReturnValueOnce(cursor);
    mocks.archiveSandboxResourceWithSaga.mockImplementation(async (resource) => {
      if (resource.sandboxId === 'failed') throw new Error('archive failed');
    });

    await expect(
      archiveSandboxResources({
        inactiveBefore,
        providers: ['opensandbox'],
        options: { onProgress }
      })
    ).resolves.toEqual({
      total: 6,
      successCount: 3,
      skippedCount: 2,
      failCount: 1,
      failures: [{ sandboxId: 'failed', error: 'archive failed' }]
    });

    expect(mocks.createSandboxResourcesToArchiveCursor).toHaveBeenCalledWith(
      expect.objectContaining({ inactiveBefore, providers: ['opensandbox'] })
    );
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      processedCount: 5,
      successCount: 2,
      skippedCount: 2,
      failCount: 1,
      batchSize: 5,
      failures: [{ sandboxId: 'failed', error: 'archive failed' }]
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      processedCount: 6,
      successCount: 3,
      skippedCount: 2,
      failCount: 1,
      batchSize: 1,
      failures: []
    });
    expect(cursor.close).toHaveBeenCalledTimes(1);
  });

  it('closes the archive cursor when iteration fails', async () => {
    const close = vi.fn(async () => undefined);
    mocks.createSandboxResourcesToArchiveCursor.mockReturnValueOnce({
      close,
      async *[Symbol.asyncIterator]() {
        yield createResource();
        throw new Error('cursor failed');
      }
    });

    await expect(archiveSandboxResources({ inactiveBefore })).rejects.toThrow('cursor failed');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('dispatches archived and restoring resources to the restore Saga', async () => {
    for (const status of ['archived', 'restoring']) {
      const resource = createResource({ sandboxId: status, status });
      mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(resource);

      await restoreArchivedSandboxBeforeUse({
        provider: 'opensandbox',
        sandboxId: resource.sandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: resource.sourceId,
        userId: resource.userId,
        resourceLimit: { cpu: 2 },
        createConfig: { image: 'runtime-image' }
      });
    }

    expect(mocks.restoreSandboxWithSaga.mock.calls).toEqual(
      ['archived', 'restoring'].map((status) => [
        {
          resource: expect.objectContaining({ sandboxId: status, status }),
          provider: 'opensandbox',
          sourceType: ChatSourceTypeEnum.app,
          sourceId: 'app-1',
          userId: 'user-1',
          storage: undefined,
          limit: { cpu: 2 },
          vmConfig: undefined,
          createConfig: { image: 'runtime-image' }
        }
      ])
    );
  });

  it('does not start restore for absent or already usable resources', async () => {
    for (const status of [undefined, 'running', 'stopped']) {
      mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(
        status ? createResource({ status }) : undefined
      );

      await restoreArchivedSandboxBeforeUse({
        provider: 'opensandbox',
        sandboxId: 'sandbox-1',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        userId: 'user-1'
      });
    }

    expect(mocks.restoreSandboxWithSaga).not.toHaveBeenCalled();
  });

  it('surfaces a restoring conflict when the restore Saga is still running', async () => {
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(
      createResource({ status: 'archived' })
    );
    mocks.restoreSandboxWithSaga.mockResolvedValueOnce(false);

    await expect(
      restoreArchivedSandboxBeforeUse({
        provider: 'opensandbox',
        sandboxId: 'sandbox-1',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        userId: 'user-1'
      })
    ).rejects.toMatchObject({
      name: 'SandboxLifecycleStateError',
      state: 'restoring'
    });
  });

  it('rejects lifecycle states that cannot be restored by this entry point', async () => {
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(
      createResource({ status: 'deleting' })
    );

    await expect(
      restoreArchivedSandboxBeforeUse({
        provider: 'opensandbox',
        sandboxId: 'sandbox-1',
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        userId: 'user-1'
      })
    ).rejects.toBeInstanceOf(SandboxLifecycleStateError);
    expect(mocks.restoreSandboxWithSaga).not.toHaveBeenCalled();
  });

  it('checks runtime state without triggering restore side effects', async () => {
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(
      createResource({ status: 'archiving' })
    );

    await expect(
      assertSandboxRuntimeUsableWithoutRestore({
        provider: 'opensandbox',
        sandboxId: 'sandbox-1'
      })
    ).rejects.toMatchObject({ state: 'archiving' });
    expect(mocks.restoreSandboxWithSaga).not.toHaveBeenCalled();
  });
});
