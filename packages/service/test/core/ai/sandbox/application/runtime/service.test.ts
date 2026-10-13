import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxNotFoundError, SandboxStateError } from '@fastgpt-sdk/sandbox-adapter';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import * as repository from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository';
import {
  ensureSandboxRuntime,
  ensureSandboxRuntimeConfiguration,
  connectRunningSandbox
} from '@fastgpt/service/core/ai/sandbox/application/runtime/service';
import { buildVolumeConfig } from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  active: vi.fn(),
  volume: vi.fn(),
  deleteVolume: vi.fn(),
  configuration: vi.fn(),
  adapter: vi.fn(),
  connect: vi.fn(),
  lifecycle: vi.fn(),
  sourceLease: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  deleteArchive: vi.fn(),
  execute: vi.fn(),
  write: vi.fn(),
  ensure: vi.fn(),
  close: vi.fn(),
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/sourceGuard', () => ({
  resolveSandboxSourceTeamId: mocks.source,
  assertSandboxSourceActive: mocks.active
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxLifecycleLease: mocks.lifecycle,
  withSandboxSourceMutationLease: mocks.sourceLease
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/config', () => ({
  getConfiguredSandboxProvider: () => 'opensandbox',
  getSandboxAdapterConfig: mocks.configuration
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile', () => ({
  getSandboxRuntimeProfile: () => ({
    workDirectory: '/workspace',
    defaultImage: { repository: 'target', tag: 'v2' }
  })
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter', () => ({
  buildRuntimeSandboxAdapter: mocks.adapter,
  buildSandboxResourceAdapter: mocks.adapter
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/lifecycle', () => ({
  connectToSandbox: mocks.connect,
  disconnectSandbox: (adapter: { close: () => Promise<void> }) => adapter.close()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/volume/config', () => ({
  getVolumeManagerEnvConfig: () => ({ volumeNamePrefix: 'test' })
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
  getAgentSandboxMax: () => 100,
  getAgentSandboxMaxPerTeam: () => 1,
  getAgentSandboxArchiveMaxBytes: () => 1024 * 1024
}));
vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({
  getS3SandboxSource: () => ({
    downloadWorkspaceArchive: mocks.download,
    uploadWorkspaceArchive: mocks.upload,
    deleteWorkspaceArchiveNow: mocks.deleteArchive
  })
}));
vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.log,
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));

const query = {
  sandboxId: 'runtime-orchestration-test',
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'runtime-app',
  userId: 'user'
};
const teamId = 'runtime-orchestration-team';
const storage = buildVolumeConfig('test-existing-generation').storage;
const lease = { signal: new AbortController().signal, assertValid: vi.fn() };
const remotes = new Map<string, boolean>();
const events: string[] = [];
let leaseDepth = 0;
const read = () => repository.findSandboxInstanceBySandboxId({ sandboxId: query.sandboxId });
const create = async (
  status: 'running' | 'stopped' | 'archived' | 'provisioning' | 'restoring',
  provider: 'opensandbox' | 'sealosdevbox' = 'opensandbox'
) => {
  await MongoSandboxInstance.create({
    ...query,
    teamId,
    provider,
    status,
    storage,
    image: { repository: 'target', tag: 'v2' },
    lastActiveAt: new Date(),
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
  });
};

beforeAll(async () => {
  await MongoSandboxInstance.init();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  await MongoSandboxInstance.deleteMany({ teamId });
  lease.assertValid.mockReset();
  remotes.clear();
  events.length = 0;
  leaseDepth = 0;
  mocks.configuration.mockImplementation(({ provider }) => ({
    providerConfig: { provider },
    createConfig: { image: { repository: 'target', tag: 'v2' } }
  }));
  mocks.source.mockResolvedValue(teamId);
  mocks.active.mockResolvedValue(undefined);
  mocks.lifecycle.mockImplementation(async ({ fn }) => {
    leaseDepth++;
    try {
      return await fn(lease);
    } finally {
      leaseDepth--;
    }
  });
  mocks.sourceLease.mockImplementation(async ({ fn }) => fn(lease));
  mocks.volume.mockImplementation(async (claimName) => {
    events.push(`volume:${claimName}`);
    return buildVolumeConfig(claimName);
  });
  mocks.deleteVolume.mockImplementation(async (claimName) => {
    events.push(`delete-volume:${claimName}`);
  });
  mocks.ensure.mockImplementation(async (provider, options) => {
    if (!remotes.get(provider) && options?.allowCreate === false)
      throw new SandboxNotFoundError('missing');
    if (!remotes.get(provider)) {
      expect(leaseDepth).toBe(1);
      events.push(`create:${provider}`);
      remotes.set(provider, true);
    }
  });
  mocks.adapter.mockImplementation((providerOrResource) => {
    const provider =
      typeof providerOrResource === 'string' ? providerOrResource : providerOrResource.provider;
    return {
      provider,
      connectRunning: async () => {
        if (!remotes.get(provider)) throw new SandboxNotFoundError('missing');
      },
      ensureRunning: (options: unknown) => mocks.ensure(provider, options),
      close: mocks.close,
      execute: mocks.execute,
      stop: async () => {
        events.push(`stop:${provider}`);
        remotes.delete(provider);
      },
      delete: async () => {
        events.push(`delete:${provider}`);
        remotes.delete(provider);
      },
      getInfo: async () => (remotes.get(provider) ? { status: { state: 'Running' } } : null),
      writeFiles: mocks.write,
      deleteFiles: vi.fn(async () => []),
      readFiles: vi.fn(async () => [{ content: Buffer.from('archive') }])
    };
  });
  mocks.connect.mockImplementation(async ({ provider }) => {
    const adapter = mocks.adapter(provider);
    await adapter.ensureRunning();
    return adapter;
  });
  mocks.execute.mockImplementation(async (command: string) => ({
    exitCode: 0,
    stderr: '',
    stdout: command.includes('wc -l') ? '1' : '0'
  }));
  mocks.write.mockResolvedValue([{}]);
  mocks.close.mockResolvedValue(undefined);
  mocks.download.mockResolvedValue(
    Buffer.from('504b0506000000000000000000000000000000000000', 'hex')
  );
});

describe('ensureSandboxRuntime', () => {
  it('creates one owned record before provider side effects', async () => {
    mocks.ensure.mockImplementationOnce(async (provider) => {
      const current = (await read())!;
      expect(current.status).toBe('provisioning');
      expect(current.teamId).toBe(teamId);
      expect(current.storage?.volumes?.[0].claimName).toBeTruthy();
      remotes.set(provider, true);
    });
    const result = await ensureSandboxRuntime({ query });
    expect(result.resource.status).toBe('running');
    expect(result.resource.operation).toBeUndefined();
    expect(mocks.sourceLease).toHaveBeenCalledTimes(1);
  });
  it('uses one instance read on the running fast path without acquiring a lease or rechecking quota', async () => {
    await create('running');
    remotes.set('opensandbox', true);
    const find = vi.spyOn(repository, 'findSandboxInstanceBySource');
    const count = vi.spyOn(repository, 'countActiveSandboxInstances');
    const result = await ensureSandboxRuntime({ query });
    expect(result.resource.status).toBe('running');
    expect(find).toHaveBeenCalledTimes(1);
    expect(count).not.toHaveBeenCalled();
    expect(mocks.lifecycle).not.toHaveBeenCalled();
  });
  it('reuses a connection with source and generation CAS checks, without repeated instance reads', async () => {
    await create('running');
    remotes.set('opensandbox', true);
    const connection = await ensureSandboxRuntime({ query });
    const find = vi.spyOn(repository, 'findSandboxInstanceBySource');
    const result = await ensureSandboxRuntime({ query, connection });
    expect(result.adapter).toBe(connection.adapter);
    expect(find).not.toHaveBeenCalled();
    expect(mocks.active).toHaveBeenCalledWith(query);
  });
  it('never starts an inactive remote on the connect-only path', async () => {
    await create('running');
    mocks.adapter.mockReturnValueOnce({
      connectRunning: vi.fn(async () => {
        throw new SandboxStateError('stopped', 'Stopped', 'Running');
      }),
      close: mocks.close
    });
    await expect(connectRunningSandbox({ query })).rejects.toThrow('is not running');
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.lifecycle).not.toHaveBeenCalled();
  });
  it('activates a remotely stopped running record only under the lifecycle lease', async () => {
    await create('running');
    mocks.adapter.mockReturnValueOnce({
      connectRunning: vi.fn(async () => {
        throw new SandboxStateError('stopped', 'Stopped', 'Running');
      }),
      close: mocks.close
    });
    const result = await ensureSandboxRuntime({ query });
    expect(result.resource.status).toBe('running');
    expect(mocks.lifecycle).toHaveBeenCalledTimes(1);
    expect(events).toContain('create:opensandbox');
  });

  it('rejects invalid target configuration before archiving the old provider', async () => {
    await create('running', 'sealosdevbox');
    mocks.configuration.mockImplementationOnce(() => {
      throw new Error('target credentials missing');
    });
    await expect(ensureSandboxRuntime({ query })).rejects.toThrow('target credentials missing');
    expect(mocks.upload).not.toHaveBeenCalled();
    expect((await read())?.provider).toBe('sealosdevbox');
    expect((await read())?.status).toBe('running');
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

  it('recovers an old-provider failed activation, migrates and restores within one lease', async () => {
    await create('restoring', 'sealosdevbox');
    remotes.set('sealosdevbox', true);
    const result = await ensureSandboxRuntime({ query });
    expect(result.resource.provider).toBe('opensandbox');
    expect(result.resource.status).toBe('running');
    expect(events.indexOf('delete:sealosdevbox')).toBeLessThan(
      events.indexOf('create:opensandbox')
    );
    expect(mocks.lifecycle).toHaveBeenCalledTimes(1);
  });
  it('uses the provider re-read inside the lease instead of the initial snapshot', async () => {
    await create('archived');
    mocks.lifecycle.mockImplementationOnce(async ({ fn }) => {
      await MongoSandboxInstance.updateOne(
        { sandboxId: query.sandboxId },
        { $set: { provider: 'sealosdevbox' } }
      );
      leaseDepth++;
      try {
        return await fn(lease);
      } finally {
        leaseDepth--;
      }
    });
    const result = await ensureSandboxRuntime({ query });
    expect(result.resource.provider).toBe('opensandbox');
    expect(events).toContain('create:opensandbox');
    expect(events).not.toContain('create:sealosdevbox');
  });
  it('does not execute restore writes when the lease is lost during a successful download', async () => {
    await create('archived');
    mocks.download.mockImplementationOnce(async () => {
      lease.assertValid.mockImplementation(() => {
        throw new Error('lease lost');
      });
      return Buffer.alloc(0);
    });
    await expect(ensureSandboxRuntime({ query })).rejects.toThrow('lease lost');
    expect(mocks.write).not.toHaveBeenCalled();
    expect((await read())?.operation?.error).toBeUndefined();
  });
  it('rejects activation after source deletion before any provider action', async () => {
    mocks.active.mockRejectedValueOnce(new Error('source deleted'));
    await expect(ensureSandboxRuntime({ query })).rejects.toThrow('source deleted');
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(await read()).toBeNull();
  });
});

describe('ensureSandboxRuntimeConfiguration', () => {
  it('configuration preparation recovers old-provider provisioning instead of failing before migration', async () => {
    await create('provisioning', 'sealosdevbox');
    await ensureSandboxRuntimeConfiguration({ query });
    expect((await read())?.provider).toBe('opensandbox');
    expect((await read())?.status).toBe('archived');
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
