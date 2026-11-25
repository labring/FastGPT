import { Readable } from 'node:stream';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';

const mocks = vi.hoisted(() => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  withSandboxLease: vi.fn(),
  findSandboxInstanceBySandboxId: vi.fn(),
  claimSandboxOperation: vi.fn(),
  advanceSandboxOperation: vi.fn(),
  completeSandboxOperation: vi.fn(),
  markSandboxOperationFailed: vi.fn(),
  touchSandboxOperationHeartbeat: vi.fn(),
  createSandboxResourcesToArchiveCursor: vi.fn(),
  createOpenSandboxResourceClient: vi.fn(),
  createRuntimeOpenSandboxClient: vi.fn(),
  disconnectSandbox: vi.fn(),
  buildVolumeConfig: vi.fn(),
  createSessionVolumeClaimName: vi.fn(),
  getSessionVolumeClaimName: vi.fn(),
  getSessionVolumeConfig: vi.fn(),
  deleteSessionVolume: vi.fn(),
  getEndpoint: vi.fn(),
  uploadArchiveStream: vi.fn(),
  downloadArchiveStream: vi.fn(),
  deleteArchiveObject: vi.fn(),
  deleteSupersededSandboxArchives: vi.fn(),
  getOpenSandboxRuntimeConfig: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxLease: mocks.withSandboxLease
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  advanceSandboxOperation: mocks.advanceSandboxOperation,
  claimSandboxOperation: mocks.claimSandboxOperation,
  completeSandboxOperation: mocks.completeSandboxOperation,
  createSandboxResourcesToArchiveCursor: mocks.createSandboxResourcesToArchiveCursor,
  findSandboxInstanceBySandboxId: mocks.findSandboxInstanceBySandboxId,
  markSandboxOperationFailed: mocks.markSandboxOperationFailed,
  touchSandboxOperationHeartbeat: mocks.touchSandboxOperationHeartbeat
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox', () => ({
  createOpenSandboxResourceClient: mocks.createOpenSandboxResourceClient,
  createRuntimeOpenSandboxClient: mocks.createRuntimeOpenSandboxClient,
  disconnectSandbox: mocks.disconnectSandbox
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/runtimeProfile', () => ({
  getSandboxStaticRuntimePaths: () => ({
    workDirectory: '/workspace',
    homeDirectory: '/home/sandbox',
    skillsRootPath: '/workspace/skills',
    builtinSkillsRootPath: '/var/lib/fastgpt-runtime/skills'
  })
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/config', () => ({
  getOpenSandboxRuntimeConfig: mocks.getOpenSandboxRuntimeConfig
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/volume/service', () => ({
  buildVolumeConfig: mocks.buildVolumeConfig,
  createSessionVolumeClaimName: mocks.createSessionVolumeClaimName,
  deleteSessionVolume: mocks.deleteSessionVolume,
  getSessionVolumeClaimName: mocks.getSessionVolumeClaimName,
  getSessionVolumeConfig: mocks.getSessionVolumeConfig
}));

vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({
  buildSandboxArchiveObjectKey: (sandboxId: string, generation: string) =>
    `sandbox/${sandboxId}/${generation}.tar.zst`,
  getS3SandboxSource: () => ({
    uploadArchiveStream: mocks.uploadArchiveStream,
    downloadArchiveStream: mocks.downloadArchiveStream,
    deleteArchiveObject: mocks.deleteArchiveObject,
    deleteSupersededSandboxArchives: mocks.deleteSupersededSandboxArchives
  })
}));

import {
  archiveInactiveSandboxes,
  archiveSandboxResource,
  restoreArchivedSandboxWithinLease
} from '@fastgpt/service/core/ai/sandbox/application/archive';
import { invalidateIdeAgentPasswordCache } from '@fastgpt/service/core/ai/sandbox/application/ideAgent';

const createVolumeConfig = (claimName: string) => ({
  volumes: [
    {
      name: 'workspace',
      pvc: {
        claimName,
        createIfNotExists: false,
        deleteOnSandboxTermination: false
      },
      mountPath: '/home/sandbox',
      readOnly: false
    }
  ],
  storage: {
    volumes: [{ name: 'workspace', claimName, mountPath: '/home/sandbox' }],
    mountPath: '/home/sandbox'
  }
});

const defaultArchive = {
  objectKey: 'sandbox/sandbox-1/prevgen.tar.zst',
  generation: 'prevgen',
  format: 'tar.zst' as const,
  sizeBytes: 128,
  archivedAt: new Date('2026-07-01T00:00:00.000Z')
};

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
          mountPath: '/home/sandbox'
        }
      ],
      mountPath: '/home/sandbox'
    },
    ...overrides
  }) as any;

const createClaimed = (status: 'archiving' | 'restoring', extraStorage?: Record<string, unknown>) =>
  createResource(status, {
    ...(extraStorage ? { storage: extraStorage } : {}),
    operation: {
      id: `${status}-operation`,
      type: status === 'archiving' ? 'archive' : 'restore',
      phase: 'claimed',
      startedAt: new Date(),
      heartbeatAt: new Date()
    }
  });

const createRuntimeSandbox = () => ({
  id: 'remote-sandbox-1',
  provider: 'opensandbox',
  ensureRunning: vi.fn(async () => undefined),
  getEndpoint: mocks.getEndpoint,
  readFiles: vi.fn(async () => [
    {
      path: '/var/lib/fastgpt-runtime/.fastgpt-ide-agent-password',
      content: Uint8Array.from(Buffer.from('ide-agent-secret\n')),
      error: null
    }
  ]),
  stop: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined)
});

const originalFetch = globalThis.fetch;
let fetchSpy: ReturnType<typeof vi.spyOn>;

const drainWebStream = async (body: RequestInit['body']) => {
  if (!body || typeof (body as ReadableStream<Uint8Array>).getReader !== 'function') {
    return Buffer.alloc(0);
  }
  const reader = (body as ReadableStream<Uint8Array>).getReader();
  const chunks: Buffer[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
};

const lease = { signal: new AbortController().signal, assertValid: vi.fn() };
const restoreSandbox = () =>
  restoreArchivedSandboxWithinLease({
    resource: createResource('archived', { storage: { archive: defaultArchive } }),
    lease
  });

describe('sandbox archive lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    global.systemInstanceConfig = createDefaultInstanceConfig();
    invalidateIdeAgentPasswordCache();
    lease.assertValid.mockReset();
    mocks.withSandboxLease.mockImplementation(async ({ fn }: any) => fn(lease));
    mocks.getOpenSandboxRuntimeConfig.mockReturnValue({
      image: { repository: 'fastgpt/sandbox', tag: 'v2' }
    });
    mocks.getSessionVolumeConfig.mockImplementation(async (claimName: string) =>
      createVolumeConfig(claimName)
    );
    mocks.getEndpoint.mockResolvedValue({
      host: 'sandbox.internal',
      port: 1319,
      protocol: 'http' as const,
      url: 'http://sandbox.internal:1319',
      headers: { 'x-opensandbox-token': 'dp-token' }
    });
    mocks.createRuntimeOpenSandboxClient.mockImplementation(() => createRuntimeSandbox());
    mocks.createOpenSandboxResourceClient.mockImplementation(() => ({
      delete: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined)
    }));
    mocks.disconnectSandbox.mockResolvedValue(undefined);
    mocks.buildVolumeConfig.mockImplementation(createVolumeConfig);
    mocks.createSessionVolumeClaimName.mockReturnValue('fastgpt-session-sandbox-1-new');
    mocks.getSessionVolumeClaimName.mockImplementation(
      (storage: any) =>
        storage?.volumes?.find((volume: any) => volume.name === 'workspace')?.claimName
    );
    mocks.deleteSessionVolume.mockResolvedValue(undefined);
    mocks.uploadArchiveStream.mockImplementation(async ({ body }: { body: Readable }) => {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return { sizeBytes: Buffer.concat(chunks).length };
    });
    mocks.downloadArchiveStream.mockImplementation(async () =>
      Readable.from([Buffer.from('compressed-archive')])
    );
    mocks.deleteArchiveObject.mockResolvedValue(undefined);
    mocks.deleteSupersededSandboxArchives.mockResolvedValue(undefined);
    mocks.markSandboxOperationFailed.mockResolvedValue(undefined);
    mocks.advanceSandboxOperation.mockImplementation(async ({ resource, phase, set }) => ({
      ...resource,
      ...set,
      operation: { ...resource.operation, phase }
    }));
    mocks.completeSandboxOperation.mockResolvedValue(
      createResource('archived', { storage: { archive: defaultArchive } })
    );
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(createResource());
    mocks.claimSandboxOperation.mockImplementation(async ({ resource, status }: any) =>
      createClaimed(status, resource?.storage)
    );

    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith('http://sandbox.internal:1319/archive/pack')) {
        return new Response(
          Readable.toWeb(Readable.from([Buffer.from('zstd-archive-bytes')])) as BodyInit,
          { status: 200, headers: { 'content-type': 'application/zstd' } }
        );
      }
      if (url.startsWith('http://sandbox.internal:1319/archive/extract')) {
        await drainWebStream(init?.body);
        return new Response(null, { status: 204 });
      }
      return originalFetch(input, init);
    });
  });

  it('streams tar.zst archive over IDE agent HTTP and publishes archived', async () => {
    const runtimeSandbox = createRuntimeSandbox();
    mocks.createRuntimeOpenSandboxClient.mockReturnValueOnce(runtimeSandbox);

    const result = await archiveSandboxResource(
      createResource(),
      new Date('2026-07-10T00:00:00.000Z')
    );

    expect(result).toMatchObject({ status: 'success' });
    expect(mocks.getEndpoint).toHaveBeenCalledWith(1319);
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://sandbox.internal:1319/archive/pack',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'x-opensandbox-token': 'dp-token',
          'x-fastgpt-agent-token': 'ide-agent-secret',
          'Content-Type': 'application/json'
        }
      })
    );
    const packBody = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(packBody.targetDir).toBeUndefined();
    expect(packBody.excludePatterns).toEqual([]);
    expect(mocks.claimSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'archiving', type: 'archive', matchLastActiveAt: true })
    );
    expect(mocks.uploadArchiveStream).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(/^sandbox\/sandbox-1\/[a-f0-9]+\.tar\.zst$/),
        body: expect.any(Readable)
      })
    );
    expect(mocks.advanceSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'archiveUploaded',
        set: expect.objectContaining({
          instanceId: 'remote-sandbox-1',
          storage: expect.objectContaining({
            archive: expect.objectContaining({
              format: 'tar.zst',
              sizeBytes: Buffer.byteLength('zstd-archive-bytes')
            })
          })
        })
      })
    );
    expect(runtimeSandbox.delete).toHaveBeenCalledTimes(1);
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
        unset: ['instanceId']
      })
    );
  });

  it('archives empty workspace with sizeBytes 0 when IDE agent returns 204', async () => {
    fetchSpy.mockImplementationOnce(async () => new Response(null, { status: 204 }));

    const result = await archiveSandboxResource(
      createResource(),
      new Date('2026-07-10T00:00:00.000Z')
    );

    expect(result).toMatchObject({ status: 'success' });
    expect(mocks.uploadArchiveStream).not.toHaveBeenCalled();
    expect(mocks.advanceSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'archiveUploaded',
        set: expect.objectContaining({
          storage: expect.objectContaining({
            archive: expect.objectContaining({
              format: 'tar.zst',
              sizeBytes: 0
            })
          })
        })
      })
    );
  });

  it('rejects empty 200 archive streams, cleans up uploaded object, and preserves source PVC', async () => {
    fetchSpy.mockImplementationOnce(
      async () =>
        new Response(Readable.toWeb(Readable.from([])) as BodyInit, {
          status: 200
        })
    );
    mocks.uploadArchiveStream.mockResolvedValueOnce({ sizeBytes: 0 });

    const result = await archiveSandboxResource(
      createResource(),
      new Date('2026-07-10T00:00:00.000Z')
    );

    expect(result).toMatchObject({ status: 'failed' });
    expect(mocks.deleteArchiveObject).toHaveBeenCalledTimes(1);
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
    expect(mocks.advanceSandboxOperation).not.toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'archiveUploaded' })
    );
  });

  it('retries transient 503 responses from IDE agent port 1319 before streaming archive', async () => {
    fetchSpy
      .mockImplementationOnce(async () => new Response('warming up', { status: 503 }))
      .mockImplementationOnce(
        async () =>
          new Response(
            Readable.toWeb(Readable.from([Buffer.from('zstd-after-retry')])) as BodyInit,
            { status: 200 }
          )
      );

    const result = await archiveSandboxResource(
      createResource(),
      new Date('2026-07-10T00:00:00.000Z')
    );

    expect(result).toMatchObject({ status: 'success' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(mocks.advanceSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'archiveUploaded',
        set: expect.objectContaining({
          storage: expect.objectContaining({
            archive: expect.objectContaining({
              sizeBytes: Buffer.byteLength('zstd-after-retry')
            })
          })
        })
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
    mocks.withSandboxLease.mockResolvedValue({ status: 'success' });

    await archiveInactiveSandboxes(new Date('2026-07-10T00:00:00.000Z'));

    expect(mocks.createSandboxResourcesToArchiveCursor).toHaveBeenCalledWith(
      new Date('2026-07-03T00:00:00.000Z')
    );
    expect(mocks.withSandboxLease).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);

    getTestInstanceConfig().subservice.agentSandbox.common.archiveInactiveDays = 3;
    mocks.createSandboxResourcesToArchiveCursor.mockReturnValueOnce({
      async *[Symbol.asyncIterator]() {},
      close
    });
    await archiveInactiveSandboxes(new Date('2026-07-10T00:00:00.000Z'));
    expect(mocks.createSandboxResourcesToArchiveCursor).toHaveBeenLastCalledWith(
      new Date('2026-07-07T00:00:00.000Z')
    );
  });

  it('rechecks inactivity under the lease before claiming', async () => {
    mocks.findSandboxInstanceBySandboxId.mockResolvedValueOnce(
      createResource('running', { lastActiveAt: new Date('2026-07-11T00:00:00.000Z') })
    );

    await expect(
      archiveSandboxResource(createResource(), new Date('2026-07-10T00:00:00.000Z'))
    ).resolves.toMatchObject({ status: 'skipped' });
    expect(mocks.claimSandboxOperation).not.toHaveBeenCalled();
    expect(mocks.createRuntimeOpenSandboxClient).not.toHaveBeenCalled();
  });

  it('keeps archiving with an operation error when upload fails', async () => {
    mocks.uploadArchiveStream.mockRejectedValueOnce(new Error('upload failed'));

    const result = await archiveSandboxResource(
      createResource(),
      new Date('2026-07-10T00:00:00.000Z')
    );

    expect(result).toEqual({ status: 'failed', error: 'upload failed' });
    expect(mocks.createOpenSandboxResourceClient).not.toHaveBeenCalled();
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
      storage: {
        ...createResource().storage,
        archive: defaultArchive
      },
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

    await expect(archiveSandboxResource(providerDeleted)).resolves.toMatchObject({
      status: 'success'
    });

    expect(mocks.createRuntimeOpenSandboxClient).not.toHaveBeenCalled();
    expect(mocks.uploadArchiveStream).not.toHaveBeenCalled();
    expect(mocks.createOpenSandboxResourceClient).not.toHaveBeenCalled();
    expect(mocks.deleteSessionVolume).toHaveBeenCalledWith('fastgpt-session-sandbox-1-old');
    expect(mocks.advanceSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'resumed-archive', phase: 'volumeDeleted' })
    );
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'resumed-archive', status: 'archived' })
    );
  });

  it('streams archive directly to IDE agent POST /archive/extract into new generation PVC before publishing restoring -> running', async () => {
    const archived = createResource('archived', { storage: { archive: defaultArchive } });
    const restoreSandboxClient = createRuntimeSandbox();
    mocks.createRuntimeOpenSandboxClient.mockReturnValueOnce(restoreSandboxClient);
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(archived);
    mocks.completeSandboxOperation.mockResolvedValueOnce(createResource('running'));

    await expect(restoreSandbox()).resolves.toMatchObject({ status: 'running' });

    expect(mocks.getSessionVolumeConfig).toHaveBeenCalledWith('fastgpt-session-sandbox-1-new');
    expect(mocks.createRuntimeOpenSandboxClient).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: 'sandbox-1',
        volumes: expect.arrayContaining([
          expect.objectContaining({
            pvc: expect.objectContaining({ claimName: 'fastgpt-session-sandbox-1-new' })
          })
        ])
      })
    );
    expect(mocks.advanceSandboxOperation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        operationId: 'restoring-operation',
        phase: 'volumeAssigned',
        set: expect.objectContaining({
          storage: expect.objectContaining({
            archive: defaultArchive,
            volumes: [expect.objectContaining({ claimName: 'fastgpt-session-sandbox-1-new' })]
          })
        })
      })
    );
    expect(mocks.getEndpoint).toHaveBeenCalledWith(1319);
    expect(mocks.downloadArchiveStream).toHaveBeenCalledWith({
      key: defaultArchive.objectKey,
      sandboxId: 'sandbox-1',
      signal: lease.signal
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://sandbox.internal:1319/archive/extract',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'x-opensandbox-token': 'dp-token',
          'x-fastgpt-agent-token': 'ide-agent-secret',
          'Content-Type': 'application/zstd'
        },
        duplex: 'half'
      })
    );
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
  });

  it('does not stop restored compute or mark retryable failure after losing its lease', async () => {
    const sandbox = createRuntimeSandbox();
    mocks.createRuntimeOpenSandboxClient.mockReturnValueOnce(sandbox);
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(
      createResource('archived', { storage: { archive: defaultArchive } })
    );
    mocks.downloadArchiveStream.mockImplementationOnce(async () => {
      lease.assertValid.mockImplementation(() => {
        throw new Error('lease lost');
      });
      throw new Error('download interrupted');
    });

    await expect(restoreSandbox()).rejects.toThrow('lease lost');

    expect(sandbox.stop).not.toHaveBeenCalled();
    expect(mocks.markSandboxOperationFailed).not.toHaveBeenCalled();
    expect(mocks.disconnectSandbox).toHaveBeenCalledWith(sandbox);
  });

  it('restores an empty tar.zst archive (sizeBytes === 0) without calling the IDE agent', async () => {
    const emptyArchive = { ...defaultArchive, sizeBytes: 0 };
    const emptyResource = createResource('archived', { storage: { archive: emptyArchive } });
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(emptyResource);
    mocks.completeSandboxOperation.mockResolvedValueOnce(createResource('running'));

    await expect(
      restoreArchivedSandboxWithinLease({
        resource: emptyResource as any,
        lease: lease as any
      })
    ).resolves.toMatchObject({ status: 'running' });

    expect(mocks.downloadArchiveStream).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
  });

  it('refreshes cached IDE agent password and retries once on 401 for POST /archive/extract', async () => {
    const restoreSandboxClient = createRuntimeSandbox();
    restoreSandboxClient.readFiles
      .mockResolvedValueOnce([
        {
          path: '/var/lib/fastgpt-runtime/.fastgpt-ide-agent-password',
          content: Uint8Array.from(Buffer.from('stale-secret')),
          error: null
        }
      ])
      .mockResolvedValueOnce([
        {
          path: '/var/lib/fastgpt-runtime/.fastgpt-ide-agent-password',
          content: Uint8Array.from(Buffer.from('fresh-secret\n')),
          error: null
        }
      ]);
    mocks.createRuntimeOpenSandboxClient.mockReturnValueOnce(restoreSandboxClient);
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(
      createResource('archived', { storage: { archive: defaultArchive } })
    );
    mocks.completeSandboxOperation.mockResolvedValueOnce(createResource('running'));

    fetchSpy
      .mockImplementationOnce(async (_url, init) => {
        await drainWebStream(init?.body);
        return new Response('Unauthorized', { status: 401 });
      })
      .mockImplementationOnce(async (_url, init) => {
        await drainWebStream(init?.body);
        return new Response(null, { status: 204 });
      });

    await expect(restoreSandbox()).resolves.toMatchObject({ status: 'running' });

    expect(restoreSandboxClient.readFiles).toHaveBeenCalledTimes(2);
    expect(mocks.downloadArchiveStream).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'http://sandbox.internal:1319/archive/extract',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-fastgpt-agent-token': 'stale-secret'
        })
      })
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      'http://sandbox.internal:1319/archive/extract',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-fastgpt-agent-token': 'fresh-secret'
        })
      })
    );
  });

  it('propagates openBody (S3 downloadArchiveStream) failures immediately without IDE Agent readiness retries', async () => {
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(
      createResource('archived', { storage: { archive: defaultArchive } })
    );
    mocks.downloadArchiveStream.mockRejectedValueOnce(
      new Error('injected archive download timeout')
    );

    await expect(restoreSandbox()).rejects.toThrow('injected archive download timeout');

    expect(mocks.downloadArchiveStream).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('awaits superseded archive cleanup inside archiveSandboxWithinLease with lease.signal', async () => {
    let cleanupFinished = false;
    mocks.deleteSupersededSandboxArchives.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      cleanupFinished = true;
    });

    const result = await archiveSandboxResource(
      createResource(),
      new Date('2026-07-10T00:00:00.000Z')
    );

    expect(result).toMatchObject({ status: 'success' });
    expect(cleanupFinished).toBe(true);
    expect(mocks.deleteSupersededSandboxArchives).toHaveBeenCalledWith({
      sandboxId: 'sandbox-1',
      keepObjectKey: defaultArchive.objectKey,
      signal: lease.signal
    });
  });

  it('does not retry deterministic non-transient POST /archive/extract failure and surfaces details', async () => {
    const restoreSandboxClient = createRuntimeSandbox();
    mocks.createRuntimeOpenSandboxClient.mockReturnValueOnce(restoreSandboxClient);
    mocks.findSandboxInstanceBySandboxId.mockResolvedValue(
      createResource('archived', { storage: { archive: defaultArchive } })
    );
    fetchSpy.mockImplementationOnce(async (_url, init) => {
      await drainWebStream(init?.body);
      return new Response('No space left on device (os error 28)', { status: 500 });
    });

    await expect(restoreSandbox()).rejects.toThrow('No space left on device (os error 28)');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
