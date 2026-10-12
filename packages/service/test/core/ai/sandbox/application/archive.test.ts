import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkSandboxQuota: vi.fn(),
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
  buildVolumeConfig: vi.fn(),
  createLegacySessionVolumeClaimName: vi.fn(),
  createSessionVolumeClaimName: vi.fn(),
  getSessionVolumeClaimName: vi.fn(),
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

vi.mock('@fastgpt/service/core/ai/sandbox/application/quota', () => ({
  checkSandboxQuota: mocks.checkSandboxQuota
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
  buildVolumeConfig: mocks.buildVolumeConfig,
  createLegacySessionVolumeClaimName: mocks.createLegacySessionVolumeClaimName,
  createSessionVolumeClaimName: mocks.createSessionVolumeClaimName,
  deleteSessionVolume: mocks.deleteSessionVolume,
  getSessionVolumeClaimName: mocks.getSessionVolumeClaimName,
  getSessionVolumeConfig: mocks.getSessionVolumeConfig
}));

vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({
  getS3SandboxSource: () => ({
    uploadWorkspaceArchive: mocks.uploadWorkspaceArchive,
    downloadWorkspaceArchive: mocks.downloadWorkspaceArchive,
    isWorkspaceArchiveExists: mocks.isWorkspaceArchiveExists
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
  restoreArchivedSandboxWithinLease,
  retryStaleArchivingSandboxes
} from '@fastgpt/service/core/ai/sandbox/application/archive';

const EMPTY_ZIP_BUFFER = Buffer.from('504b0506000000000000000000000000000000000000', 'hex');
const createVolumeConfig = (claimName: string) => ({
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
});

const createResource = (status = 'stopped', overrides: Record<string, unknown> = {}) =>
  ({
    provider: 'opensandbox',
    sandboxId: 'sandbox-1',
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'app-1',
    userId: 'user-1',
    teamId: 'team-1',
    status,
    lastActiveAt: new Date('2026-07-01T00:00:00.000Z'),
    storage: {
      volumes: [
        {
          name: 'workspace',
          claimName: 'fastgpt-session-sandbox-1-old',
          mountPath: '/workspace'
        }
      ],
      mountPath: '/workspace'
    },
    ...overrides
  }) as any;

const createClaimed = (status: 'archiving' | 'restoring') =>
  createResource(status, {
    operation: {
      id: `${status}-operation`,
      type: status === 'archiving' ? 'archive' : 'restore',
      phase: 'claimed',
      startedAt: new Date(),
      heartbeatAt: new Date()
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

const lease = { signal: new AbortController().signal, assertValid: vi.fn() };
const restoreSandbox = () =>
  restoreArchivedSandboxWithinLease({ resource: createResource('archived'), lease });

describe('sandbox archive lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lease.assertValid.mockReset();
    mocks.checkSandboxQuota.mockResolvedValue(undefined);
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
    mocks.buildSandboxResourceAdapter.mockReturnValue({
      delete: vi.fn(async () => undefined),
      getInfo: vi.fn(async () => null),
      close: vi.fn(async () => undefined)
    });
    mocks.buildVolumeConfig.mockImplementation(createVolumeConfig);
    mocks.createLegacySessionVolumeClaimName.mockReturnValue('fastgpt-session-sandbox-1');
    mocks.createSessionVolumeClaimName.mockReturnValue('fastgpt-session-sandbox-1-new');
    mocks.getSessionVolumeClaimName.mockImplementation(
      (storage: any) =>
        storage?.volumes?.find((volume: any) => volume.name === 'workspace')?.claimName
    );
    mocks.deleteSessionVolume.mockResolvedValue(undefined);
    mocks.uploadWorkspaceArchive.mockResolvedValue(undefined);
    mocks.downloadWorkspaceArchive.mockResolvedValue(EMPTY_ZIP_BUFFER);
    mocks.isWorkspaceArchiveExists.mockResolvedValue(false);
    mocks.markSandboxOperationFailed.mockResolvedValue(undefined);
    mocks.advanceSandboxOperation.mockImplementation(async ({ resource, phase, set }) => ({
      ...resource,
      ...set,
      operation: { ...resource.operation, phase }
    }));
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

    expect(result).toMatchObject({ status: 'success' });
    expect(mocks.claimSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'archiving', type: 'archive', matchLastActiveAt: true })
    );
    expect(mocks.advanceSandboxOperation.mock.calls.map((call) => call[0].phase)).toEqual([
      'archiveUploaded',
      'providerDeleted',
      'volumeDeleted'
    ]);
    expect(mocks.deleteSessionVolume).toHaveBeenCalledWith('fastgpt-session-sandbox-1-old');
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'archiving-operation',
        fromStatus: 'archiving',
        status: 'archived',
        set: { image: 'sandbox-image' }
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

  it('resumes providerDeleted archive phase by completing volume deletion', async () => {
    const providerDeleted = createResource('archiving', {
      operation: {
        id: 'old-archive',
        type: 'archive',
        phase: 'providerDeleted',
        startedAt: new Date(0),
        heartbeatAt: new Date(0)
      }
    });
    const reclaimed = {
      ...providerDeleted,
      operation: { ...providerDeleted.operation, id: 'resumed-archive' }
    };
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(providerDeleted);
    mocks.claimSandboxOperation.mockResolvedValueOnce(reclaimed);

    await expect(archiveSandboxResourceNow(providerDeleted)).resolves.toMatchObject({
      status: 'success'
    });

    expect(mocks.connectToSandbox).not.toHaveBeenCalled();
    expect(mocks.uploadWorkspaceArchive).not.toHaveBeenCalled();
    expect(mocks.buildSandboxResourceAdapter).not.toHaveBeenCalled();
    expect(mocks.deleteSessionVolume).toHaveBeenCalledWith('fastgpt-session-sandbox-1-old');
    expect(mocks.advanceSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'resumed-archive', phase: 'volumeDeleted' })
    );
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'resumed-archive', status: 'archived' })
    );
  });

  it('installs the workspace before publishing restoring -> running', async () => {
    const archived = createResource('archived');
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(archived);
    const vmConfig = createVolumeConfig('fastgpt-session-sandbox-1-new');
    mocks.getSessionVolumeConfig.mockResolvedValueOnce(vmConfig);
    mocks.completeSandboxOperation.mockResolvedValueOnce(createResource('running'));

    await expect(restoreSandbox()).resolves.toMatchObject({ status: 'running' });
    expect(mocks.getSessionVolumeConfig).toHaveBeenCalledWith('fastgpt-session-sandbox-1-new');
    expect(mocks.getSandboxAdapterConfig).toHaveBeenCalledWith(
      expect.objectContaining({ vmConfig })
    );
    expect(mocks.advanceSandboxOperation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        operationId: 'restoring-operation',
        phase: 'volumeAssigned',
        set: expect.objectContaining({ storage: vmConfig.storage })
      })
    );
    expect(mocks.downloadWorkspaceArchive).toHaveBeenCalledWith({
      sandboxId: 'sandbox-1',
      maxBytes: 1024 * 1024
    });
    expect(mocks.buildSandboxResourceAdapter).not.toHaveBeenCalled();
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
  });

  it('does not stop restored compute or mark retryable failure after losing its lease', async () => {
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(createResource('archived'));
    mocks.downloadWorkspaceArchive.mockImplementationOnce(async () => {
      lease.assertValid.mockImplementation(() => {
        throw new Error('lease lost');
      });
      throw new Error('download interrupted');
    });
    await expect(restoreSandbox()).rejects.toThrow('lease lost');
    const sandbox = await mocks.connectToSandbox.mock.results[0].value;
    expect(sandbox.stop).not.toHaveBeenCalled();
    expect(mocks.markSandboxOperationFailed).not.toHaveBeenCalled();
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('retries only stale archiving records through lifecycle leases', async () => {
    mocks.findStaleSandboxOperations.mockResolvedValueOnce([
      createResource('archiving', {
        operation: {
          id: 'stale-archive',
          type: 'archive',
          phase: 'archiveUploaded',
          startedAt: new Date('2026-07-01T00:00:00.000Z'),
          heartbeatAt: new Date('2026-07-01T00:00:00.000Z')
        }
      })
    ]);

    await retryStaleArchivingSandboxes(new Date('2026-07-10T00:00:00.000Z'));

    expect(mocks.findStaleSandboxOperations).toHaveBeenCalledWith({
      statuses: ['archiving'],
      now: expect.any(Date),
      heartbeatBefore: expect.any(Date)
    });
    expect(mocks.withSandboxLifecycleLease).toHaveBeenCalledTimes(1);
  });
});
