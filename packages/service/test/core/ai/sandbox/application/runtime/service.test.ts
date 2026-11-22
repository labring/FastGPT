import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import * as repository from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository';
import { SandboxApiException } from '@alibaba-group/opensandbox';
import {
  ConnectionError,
  SandboxNotFoundError,
  SandboxStateError
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/errors';
import { ensureSandboxRuntime } from '@fastgpt/service/core/ai/sandbox/application/runtime/service';
import { buildVolumeConfig } from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  active: vi.fn(),
  volume: vi.fn(),
  deleteVolume: vi.fn(),
  runtimeConfig: vi.fn(),
  runtimeClient: vi.fn(),
  resourceClient: vi.fn(),
  lease: vi.fn(),
  downloadArchiveStream: vi.fn(),
  ensure: vi.fn(),
  close: vi.fn(),
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => ({
  resolveSandboxSourceTeamId: mocks.source,
  assertSandboxSourceActive: mocks.active
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxLease: mocks.lease
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/config', () => ({
  getOpenSandboxRuntimeConfig: mocks.runtimeConfig
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox', () => ({
  createRuntimeOpenSandboxClient: mocks.runtimeClient,
  createOpenSandboxResourceClient: mocks.resourceClient,
  disconnectSandbox: (opensandbox: { close: () => Promise<void> }) => opensandbox.close()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/volume/config', () => ({
  getVolumeManagerEnvConfig: () => ({ volumeNamePrefix: 'test', enable: true })
}));
vi.mock(
  '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@fastgpt/service/core/ai/sandbox/infrastructure/volume/service')
    >()),
    getSessionVolumeConfig: mocks.volume,
    deleteSessionVolume: mocks.deleteVolume
  })
);
vi.mock('@fastgpt/service/core/ai/sandbox/config', () => ({
  getAgentSandboxCommonConfig: () => ({ maxEditDebug: 100, maxPerTeam: 1 })
}));
vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({
  buildSandboxArchiveObjectKey: (sandboxId: string, generation: string) =>
    `sandbox/${sandboxId}/${generation}.tar.zst`,
  getS3SandboxSource: () => ({
    downloadArchiveStream: mocks.downloadArchiveStream,
    uploadArchiveStream: vi.fn(),
    deleteArchiveObject: vi.fn(),
    deleteSandboxArchives: vi.fn()
  })
}));
vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.log,
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));

const originalFetch = globalThis.fetch;

const drainWebStream = async (body: RequestInit['body']) => {
  if (!body || typeof (body as ReadableStream<Uint8Array>).getReader !== 'function') return;
  const reader = (body as ReadableStream<Uint8Array>).getReader();
  while (!(await reader.read()).done) {
    // consume stream
  }
};

const query = {
  sandboxId: 'runtime-orchestration-test',
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'runtime-app',
  userId: 'user'
};
const teamId = 'runtime-orchestration-team';
const storage = buildVolumeConfig('test-existing-generation').storage;
const defaultArchive = {
  objectKey: `sandbox/${query.sandboxId}/gen1.tar.zst`,
  generation: 'gen1',
  format: 'tar.zst' as const,
  sizeBytes: 64,
  archivedAt: new Date('2026-07-01T00:00:00Z')
};
const lease = { signal: new AbortController().signal, assertValid: vi.fn() };
let remoteRunning = false;
const events: string[] = [];
let leaseDepth = 0;

const read = () => repository.findSandboxInstanceBySandboxId({ sandboxId: query.sandboxId });

const create = async (
  status: 'running' | 'stopped' | 'archived' | 'provisioning' | 'restoring',
  overrides: {
    provider?: 'opensandbox' | 'sealosdevbox';
    instanceId?: string;
    image?: { repository: string; tag: string };
    storage?: Record<string, unknown>;
    lastActiveAt?: Date;
  } = {}
) => {
  const defaultStorage = status === 'archived' ? { archive: defaultArchive } : storage;
  const doc = {
    ...query,
    teamId,
    provider: overrides.provider ?? 'opensandbox',
    ...(overrides.instanceId !== undefined ? { instanceId: overrides.instanceId } : {}),
    status,
    storage: overrides.storage ?? defaultStorage,
    image: overrides.image ?? { repository: 'target', tag: 'v2' },
    lastActiveAt: overrides.lastActiveAt ?? new Date(),
    ...(status === 'provisioning' || status === 'restoring'
      ? {
          operation: {
            id: 'old-operation',
            type: status === 'restoring' ? 'restore' : 'provision',
            phase: 'claimed',
            startedAt: new Date(0),
            heartbeatAt: new Date(0),
            error: 'old failure'
          }
        }
      : {})
  };
  if (doc.provider !== 'opensandbox') {
    await MongoSandboxInstance.collection.insertOne({ ...doc, createdAt: new Date() });
    return;
  }
  await MongoSandboxInstance.create(doc);
};

const makeClientMock = () => ({
  id: 'remote-1',
  provider: 'opensandbox',
  connectRunning: vi.fn(async () => {
    if (!remoteRunning) throw new SandboxNotFoundError('missing');
  }),
  ensureRunning: (opts?: { signal?: AbortSignal; operationId?: string }) => mocks.ensure(opts),
  getEndpoint: vi.fn(async (port = 1319) => ({
    host: 'sandbox.internal',
    port,
    protocol: 'http' as const,
    url: `http://sandbox.internal:${port}`,
    headers: { 'x-opensandbox-token': 'dp-token' }
  })),
  close: mocks.close,
  execute: mocks.execute,
  stop: vi.fn(async () => {
    events.push('stop:opensandbox');
    remoteRunning = false;
  }),
  delete: vi.fn(async () => {
    events.push('delete:opensandbox');
    remoteRunning = false;
  }),
  getInfo: vi.fn(async () =>
    remoteRunning ? { id: 'remote-1', status: { state: 'Running' } } : null
  ),
  readFiles: vi.fn(async (paths: string[]) =>
    paths.map((path) => ({
      path,
      content: Buffer.from('test-ide-agent-token\n'),
      error: undefined
    }))
  )
});

beforeAll(async () => {
  await MongoSandboxInstance.init();
});

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('http://sandbox.internal:1319/archive/pack')) {
      return new Response(Readable.toWeb(Readable.from([Buffer.from('zstd')])) as BodyInit, {
        status: 200
      });
    }
    if (url.startsWith('http://sandbox.internal:1319/archive/extract')) {
      await drainWebStream(init?.body);
      return new Response(null, { status: 204 });
    }
    return originalFetch(input, init);
  });
  await MongoSandboxInstance.deleteMany({ teamId });
  lease.assertValid.mockReset();
  remoteRunning = false;
  events.length = 0;
  leaseDepth = 0;

  mocks.runtimeConfig.mockReturnValue({
    clientConfig: {
      baseUrl: 'https://sb.example.com',
      apiKey: 'key',
      runtime: 'kubernetes',
      useServerProxy: true
    },
    rawImage: 'target:v2',
    image: { repository: 'target', tag: 'v2' },
    createConfig: { image: { repository: 'target', tag: 'v2' } }
  });
  mocks.source.mockResolvedValue(teamId);
  mocks.active.mockResolvedValue(undefined);
  mocks.lease.mockImplementation(async ({ fn }) => {
    leaseDepth++;
    try {
      return await fn(lease);
    } finally {
      leaseDepth--;
    }
  });
  mocks.volume.mockImplementation(async (claimName) => {
    events.push(`volume:${claimName}`);
    return buildVolumeConfig(claimName);
  });
  mocks.deleteVolume.mockImplementation(async (claimName) => {
    events.push(`delete-volume:${claimName}`);
  });
  mocks.ensure.mockImplementation(async () => {
    if (!remoteRunning) {
      expect(leaseDepth).toBe(1);
      events.push('create:opensandbox');
      remoteRunning = true;
    }
  });
  mocks.runtimeClient.mockImplementation(() => makeClientMock());
  mocks.resourceClient.mockImplementation(() => makeClientMock());
  mocks.close.mockResolvedValue(undefined);
  mocks.downloadArchiveStream.mockImplementation(async () =>
    (await import('node:stream')).Readable.from([Buffer.from('zstd')])
  );
});

describe('ensureSandboxRuntime', () => {
  it('creates one owned record before provider side effects', async () => {
    mocks.ensure.mockImplementationOnce(async () => {
      const current = (await read())!;
      expect(current.status).toBe('provisioning');
      expect(current.teamId).toBe(teamId);
      expect(current.storage?.volumes?.[0].claimName).toBeTruthy();
      remoteRunning = true;
    });
    const result = await ensureSandboxRuntime({ query });
    expect(result.resource.status).toBe('running');
    expect(result.resource.operation).toBeUndefined();
    expect(mocks.active).toHaveBeenCalledTimes(2);
    expect(mocks.active).toHaveBeenNthCalledWith(1, query);
    expect(mocks.active).toHaveBeenNthCalledWith(2, query);
  });

  it('uses one instance read on the running fast path without acquiring a lease or rechecking quota', async () => {
    await create('running');
    remoteRunning = true;
    const find = vi.spyOn(repository, 'findSandboxInstanceBySource');
    const count = vi.spyOn(repository, 'countActiveSandboxInstances');
    const result = await ensureSandboxRuntime({ query });
    expect(result.resource.status).toBe('running');
    expect(find).toHaveBeenCalledTimes(1);
    expect(count).not.toHaveBeenCalled();
    expect(mocks.lease).not.toHaveBeenCalled();
  });

  it('reuses a connection with source and generation CAS checks, without repeated instance reads', async () => {
    await create('running');
    remoteRunning = true;
    const connection = await ensureSandboxRuntime({ query });
    const find = vi.spyOn(repository, 'findSandboxInstanceBySource');
    const result = await ensureSandboxRuntime({ query, connection });
    expect(result.opensandbox).toBe(connection.opensandbox);
    expect(find).not.toHaveBeenCalled();
    expect(mocks.active).toHaveBeenCalledWith(query);
  });

  it('activates a remotely stopped running record on the same PVC under the sandbox lease', async () => {
    await create('running');
    mocks.runtimeClient.mockReturnValueOnce({
      ...makeClientMock(),
      connectRunning: vi.fn(async () => {
        throw new SandboxStateError('stopped', {
          currentState: 'Stopped',
          requiredState: 'Running'
        });
      })
    });
    const result = await ensureSandboxRuntime({ query });
    expect(result.resource.status).toBe('running');
    expect(mocks.lease).toHaveBeenCalledTimes(1);
    expect(events).toContain('stop:opensandbox');
    expect(events).toContain('create:opensandbox');
    expect(result.resource.storage?.volumes?.[0].claimName).toBe('test-existing-generation');
  });

  it('rejects invalid configuration before acquiring lease or mutating container', async () => {
    await create('running');
    mocks.runtimeConfig.mockImplementation(() => {
      throw new Error('target credentials missing');
    });
    await expect(ensureSandboxRuntime({ query })).rejects.toThrow('target credentials missing');
    expect(mocks.lease).not.toHaveBeenCalled();
    expect((await read())?.status).toBe('running');
  });

  it('throws 409 migration in progress error for unmigrated sealosdevbox or legacy zip archive records', async () => {
    await create('running', { provider: 'sealosdevbox' });
    await expect(ensureSandboxRuntime({ query })).rejects.toThrow(
      SandboxErrEnum.agentSandboxMigrationInProgress
    );
    expect(mocks.lease).not.toHaveBeenCalled();

    await MongoSandboxInstance.deleteMany({ teamId });
    await create('archived', {
      storage: { archive: { ...defaultArchive, format: 'zip' } }
    });
    await expect(ensureSandboxRuntime({ query })).rejects.toThrow(
      SandboxErrEnum.agentSandboxMigrationInProgress
    );

    await MongoSandboxInstance.deleteMany({ teamId });
    await create('restoring', {
      storage: { archive: { ...defaultArchive, format: 'zip' } }
    });
    await expect(ensureSandboxRuntime({ query })).rejects.toThrow(
      SandboxErrEnum.agentSandboxMigrationInProgress
    );

    await MongoSandboxInstance.deleteMany({ teamId });
    await MongoSandboxInstance.create({
      ...query,
      teamId,
      provider: 'opensandbox',
      status: 'archiving',
      storage: { archive: { ...defaultArchive, format: 'zip' } },
      image: { repository: 'target', tag: 'v2' },
      lastActiveAt: new Date(),
      operation: {
        id: 'old-operation',
        type: 'archive',
        phase: 'claimed',
        startedAt: new Date(0),
        heartbeatAt: new Date(0)
      }
    });
    await expect(ensureSandboxRuntime({ query })).rejects.toThrow(
      SandboxErrEnum.agentSandboxMigrationInProgress
    );
  });

  it('silently upgrades image on the same PVC when running image differs and triggers onUpgrade and onUpgradeComplete', async () => {
    await create('running', { image: { repository: 'target', tag: 'v1' } });
    remoteRunning = true;
    const eventsOrder: string[] = [];
    const onUpgrade = vi.fn(() => {
      eventsOrder.push('onUpgrade');
    });
    const onUpgradeComplete = vi.fn(() => {
      eventsOrder.push('onUpgradeComplete');
    });

    const result = await ensureSandboxRuntime({
      query,
      options: { onUpgrade, onUpgradeComplete }
    });

    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(onUpgradeComplete).toHaveBeenCalledTimes(1);
    expect(eventsOrder).toEqual(['onUpgrade', 'onUpgradeComplete']);
    expect(events).toEqual([
      'stop:opensandbox',
      'volume:test-existing-generation',
      'create:opensandbox'
    ]);
    expect(result.resource.image).toEqual({ repository: 'target', tag: 'v2' });
    expect(result.resource.storage?.volumes?.[0].claimName).toBe('test-existing-generation');
  });

  it('completes image upgrade stop inside the exclusive lease even when a concurrent keepalive refreshes lastActiveAt', async () => {
    const initialActiveAt = new Date('2026-07-01T00:00:00Z');
    await create('running', {
      image: { repository: 'target', tag: 'v1' },
      lastActiveAt: initialActiveAt
    });
    remoteRunning = true;

    const originalFind = repository.findSandboxInstanceBySource;
    let findCalls = 0;
    vi.spyOn(repository, 'findSandboxInstanceBySource').mockImplementation(async (params) => {
      const snapshot = await originalFind(params);
      findCalls++;
      // 第二次读取位于 lease 内，返回旧快照后模拟并发无锁保活刷新 lastActiveAt。
      if (findCalls === 2) {
        await repository.touchRunningSandboxInstance(query);
      }
      return snapshot;
    });

    const result = await ensureSandboxRuntime({ query });

    expect(events).toEqual([
      'stop:opensandbox',
      'volume:test-existing-generation',
      'create:opensandbox'
    ]);
    expect(result.resource.status).toBe('running');
    expect(result.resource.image).toEqual({ repository: 'target', tag: 'v2' });
  });

  it('completes unhealthy rebuild stop inside the exclusive lease even when a concurrent keepalive refreshes lastActiveAt', async () => {
    await create('running', {
      lastActiveAt: new Date('2026-07-01T00:00:00Z')
    });

    let touchedActiveAt: Date | undefined;
    mocks.runtimeClient
      .mockReturnValueOnce({
        ...makeClientMock(),
        connectRunning: vi.fn(async () => {
          throw new SandboxStateError('stopped', {
            currentState: 'Stopped',
            requiredState: 'Running'
          });
        })
      })
      .mockReturnValueOnce({
        ...makeClientMock(),
        connectRunning: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          const touched = await repository.touchRunningSandboxInstance(query);
          touchedActiveAt = touched?.lastActiveAt;
          throw new SandboxStateError('stopped', {
            currentState: 'Stopped',
            requiredState: 'Running'
          });
        })
      });

    const result = await ensureSandboxRuntime({ query });

    expect(events).toEqual([
      'stop:opensandbox',
      'volume:test-existing-generation',
      'create:opensandbox'
    ]);
    expect(result.resource.status).toBe('running');
    expect(touchedActiveAt).toBeDefined();
  });

  it('checks admission again after rollback releases an active slot', async () => {
    await create('provisioning');
    await MongoSandboxInstance.create({
      ...query,
      sandboxId: 'competing-runtime',
      sourceId: 'competing-app',
      teamId,
      provider: 'opensandbox',
      status: 'running',
      lastActiveAt: new Date()
    });
    await expect(ensureSandboxRuntime({ query })).rejects.toThrow();
    expect((await read())?.status).toBe('stopped');
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it('restores archived tar.zst record within one lease', async () => {
    await create('archived');
    const result = await ensureSandboxRuntime({ query });
    expect(result.resource.provider).toBe('opensandbox');
    expect(result.resource.status).toBe('running');
    expect(mocks.downloadArchiveStream).toHaveBeenCalledWith({
      key: defaultArchive.objectKey,
      sandboxId: query.sandboxId,
      signal: expect.any(AbortSignal)
    });
    expect(events).toContain('create:opensandbox');
    expect(mocks.lease).toHaveBeenCalledTimes(1);
  });

  it('rechecks unmigrated provider mutation occurring while waiting for the lease', async () => {
    await create('archived');
    mocks.lease.mockImplementationOnce(async ({ fn }) => {
      await MongoSandboxInstance.collection.updateOne(
        { sandboxId: query.sandboxId },
        { $set: { provider: 'sealosdevbox' } }
      );
      return fn(lease);
    });
    await expect(ensureSandboxRuntime({ query })).rejects.toThrow(
      SandboxErrEnum.agentSandboxMigrationInProgress
    );
    expect(events).not.toContain('create:opensandbox');
  });

  it('does not execute restore writes when the lease is lost during archive download', async () => {
    await create('archived');
    mocks.downloadArchiveStream.mockImplementationOnce(async () => {
      lease.assertValid.mockImplementation(() => {
        throw new Error('lease lost');
      });
      throw new Error('download aborted');
    });
    await expect(ensureSandboxRuntime({ query })).rejects.toThrow('lease lost');
    expect((await read())?.operation?.error).toBeUndefined();
  });

  it('rejects activation after source deletion before any provider action', async () => {
    mocks.active.mockRejectedValueOnce(new Error('source deleted'));
    await expect(ensureSandboxRuntime({ query })).rejects.toThrow('source deleted');
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(await read()).toBeNull();
  });

  it('retracts provisioning placeholder via Store-Load barrier when source is deleted concurrently', async () => {
    mocks.active
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('source soft deleted after placeholder'));

    await expect(ensureSandboxRuntime({ query })).rejects.toThrow(
      'source soft deleted after placeholder'
    );
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(await read()).toBeNull();
  });

  it('keeps the same generation running and re-verifies health in lease after a transient 502 and concurrent keepalive touch', async () => {
    await create('running', {
      instanceId: 'inst-gen-1',
      lastActiveAt: new Date('2026-07-01T00:00:00Z')
    });
    const slowConnectRunning = vi.fn(async () => {
      await repository.touchRunningSandboxInstance(query);
    });
    mocks.runtimeClient
      .mockReturnValueOnce({
        ...makeClientMock(),
        id: 'inst-gen-1',
        connectRunning: vi.fn(async () => {
          throw Object.assign(new Error('proxy connect failed'), {
            cause: new SandboxApiException({ message: 'Bad gateway', statusCode: 502 })
          });
        })
      })
      .mockReturnValueOnce({
        ...makeClientMock(),
        id: 'inst-gen-1',
        connectRunning: slowConnectRunning
      });

    const result = await ensureSandboxRuntime({ query });

    expect(slowConnectRunning).toHaveBeenCalledWith({
      verifyHealth: true,
      remoteSandboxId: 'inst-gen-1'
    });
    expect(events).not.toContain('stop:opensandbox');
    expect(events).not.toContain('create:opensandbox');
    expect(result.resource.status).toBe('running');
    expect(result.resource.instanceId).toBe('inst-gen-1');
  });

  it('refuses to stop a newer instance generation when physical instanceId changes concurrently before claim', async () => {
    await create('running', { instanceId: 'inst-gen-1' });
    mocks.runtimeClient
      .mockReturnValueOnce({
        ...makeClientMock(),
        id: 'inst-gen-1',
        connectRunning: vi.fn(async () => {
          throw new SandboxStateError('stopped', {
            currentState: 'Stopped',
            requiredState: 'Running'
          });
        })
      })
      .mockReturnValueOnce({
        ...makeClientMock(),
        id: 'inst-gen-1',
        connectRunning: vi.fn(async () => {
          await MongoSandboxInstance.updateOne(
            { sandboxId: query.sandboxId },
            { $set: { instanceId: 'inst-gen-2' } }
          );
          throw new SandboxStateError('stopped', {
            currentState: 'Stopped',
            requiredState: 'Running'
          });
        })
      });

    await expect(ensureSandboxRuntime({ query })).rejects.toThrow(
      SandboxErrEnum.agentSandboxInitializing
    );

    expect(events).not.toContain('stop:opensandbox');
    const latest = await read();
    expect(latest?.status).toBe('running');
    expect(latest?.instanceId).toBe('inst-gen-2');
  });

  it.each([
    { status: 500, bodyText: 'No space left on device (os error 28)' },
    { status: 502, bodyText: 'Bad Gateway' }
  ])(
    'immediately deletes new container/PVC and rolls back to archived when /archive/extract fails with HTTP $status',
    async ({ status, bodyText }) => {
      await create('archived');
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.startsWith('http://sandbox.internal:1319/archive/extract')) {
          await drainWebStream(init?.body);
          return new Response(bodyText, { status });
        }
        return originalFetch(input, init);
      });

      await expect(ensureSandboxRuntime({ query })).rejects.toThrow(bodyText);

      expect(events).toContain('create:opensandbox');
      expect(events).toContain('delete:opensandbox');
      expect(mocks.deleteVolume).toHaveBeenCalledTimes(1);

      const rolledBack = await read();
      expect(rolledBack?.status).toBe('archived');
      expect(rolledBack?.storage?.archive).toEqual(defaultArchive);
      expect(rolledBack?.storage?.volumes).toBeUndefined();
      expect(rolledBack?.operation).toBeUndefined();
    }
  );

  it('passes operationId to ensureRunning and keeps restoring isolated for 240s without premature PVC deletion when control-plane create transport outcome is uncertain', async () => {
    await create('archived');
    let capturedOperationId: string | undefined;
    mocks.ensure.mockImplementationOnce(async (opts?: { operationId?: string }) => {
      capturedOperationId = opts?.operationId;
      throw new ConnectionError('Failed to create sandbox', {
        cause: new TypeError('fetch failed')
      });
    });

    await expect(ensureSandboxRuntime({ query })).rejects.toThrow('Failed to create sandbox');

    expect(mocks.deleteVolume).not.toHaveBeenCalled();
    const isolated = await read();
    expect(capturedOperationId).toBe(isolated?.operation?.id);
    expect(isolated?.status).toBe('restoring');
    expect(isolated?.operation?.retryAfter?.getTime()).toBeGreaterThan(Date.now() + 200_000);
  });

  it('preserves a running container across real OpenSandboxClient translation when slow-path readiness times out on 503, and rebuilds only on confirmed non-directory probe', async () => {
    const { Sandbox, SandboxManager, SandboxReadyTimeoutException } =
      await import('@alibaba-group/opensandbox');
    const { OpenSandboxClient } = await vi.importActual<
      typeof import('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox')
    >('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox');

    await create('running', { instanceId: 'inst-real-1' });
    const connectSpy = vi.spyOn(Sandbox, 'connect');
    const managerSpy = vi.spyOn(SandboxManager, 'create');

    const mockManager = {
      getSandboxInfo: vi.fn(async (id: string) => ({
        id,
        metadata: { app: 'fastgpt', sessionId: query.sandboxId },
        status: { state: 'Running' },
        createdAt: new Date()
      })),
      listSandboxInfos: vi.fn(async () => ({ items: [], pagination: { hasNextPage: false } })),
      killSandbox: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined)
    };
    managerSpy.mockReturnValue(mockManager as never);

    // 真实 OpenSandboxClient + 真实 SandboxReadyTimeoutException(cause: SandboxApiException(503))
    connectSpy
      .mockRejectedValueOnce(
        new SandboxApiException({
          message: 'Pod IP not ready',
          statusCode: 404,
          error: { code: 'KUBERNETES::POD_IP_NOT_AVAILABLE' }
        })
      )
      .mockRejectedValueOnce(
        new SandboxReadyTimeoutException({
          message: 'Health check timed out',
          cause: new SandboxApiException({ message: 'Service Unavailable', statusCode: 503 })
        })
      );

    mocks.runtimeClient
      .mockImplementationOnce(
        () =>
          new OpenSandboxClient(
            {
              baseUrl: 'https://sb.example.com',
              apiKey: 'key',
              sessionId: query.sandboxId,
              remoteSandboxId: 'inst-real-1'
            },
            { image: 'target:v2' }
          )
      )
      .mockImplementationOnce(
        () =>
          new OpenSandboxClient(
            {
              baseUrl: 'https://sb.example.com',
              apiKey: 'key',
              sessionId: query.sandboxId,
              remoteSandboxId: 'inst-real-1'
            },
            { image: 'target:v2' }
          )
      );

    await expect(ensureSandboxRuntime({ query })).rejects.toThrow('Failed to verify sandbox');
    expect(events).not.toContain('stop:opensandbox');
    expect(events).not.toContain('create:opensandbox');
    expect((await read())?.status).toBe('running');
    expect((await read())?.instanceId).toBe('inst-real-1');

    // 当快路径遇到瞬时 502 降级到慢路径且真实探针返回 HTTP 200 非目录（false）导致就绪超时时，才会确认坏状态并同 PVC 重建
    connectSpy.mockReset();
    connectSpy
      .mockRejectedValueOnce(new SandboxApiException({ message: 'Bad gateway', statusCode: 502 }))
      .mockImplementationOnce(async (opts: any) => {
        await opts.healthCheck?.({
          files: {
            getFileInfo: async () => ({ '/home/sandbox/workspace': { type: 'file' } })
          }
        });
        throw new SandboxReadyTimeoutException({
          message: 'Health check returned false continuously.'
        });
      });
    mocks.runtimeClient
      .mockImplementationOnce(
        () =>
          new OpenSandboxClient(
            {
              baseUrl: 'https://sb.example.com',
              apiKey: 'key',
              sessionId: query.sandboxId,
              remoteSandboxId: 'inst-real-1'
            },
            { image: 'target:v2' }
          )
      )
      .mockImplementationOnce(
        () =>
          new OpenSandboxClient(
            {
              baseUrl: 'https://sb.example.com',
              apiKey: 'key',
              sessionId: query.sandboxId,
              remoteSandboxId: 'inst-real-1'
            },
            { image: 'target:v2' }
          )
      )
      .mockImplementationOnce(() => makeClientMock());

    const rebuilt = await ensureSandboxRuntime({ query });
    expect(connectSpy).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      'stop:opensandbox',
      'volume:test-existing-generation',
      'create:opensandbox'
    ]);
    expect(rebuilt.resource.status).toBe('running');
  });
});
