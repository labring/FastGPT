import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  SandboxNotFoundError,
  SandboxStateError
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import * as repository from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository';
import { ensureSandboxRuntime } from '@fastgpt/service/core/ai/sandbox/application/runtime/service';
import { buildVolumeConfig } from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';

const DEPLOYMENT_ID = '0123456789abcdef0123456789abcdef';
vi.mock('@fastgpt/service/common/system/config/instanceId', () => ({
  getInstanceId: async () => DEPLOYMENT_ID
}));

const mocks = vi.hoisted(() => ({
  source: vi.fn(),
  active: vi.fn(),
  volume: vi.fn(),
  deleteVolume: vi.fn(),
  unmountVolume: vi.fn(),
  configuration: vi.fn(),
  client: vi.fn(),
  lifecycle: vi.fn(),
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
  withSandboxLifecycleLease: mocks.lifecycle
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/config', () => ({
  getOpenSandboxClientConfig: () => ({ baseUrl: 'http://opensandbox.local', apiKey: 'key' }),
  getOpenSandboxRuntimeConfig: mocks.configuration
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/runtimeProfile', () => ({
  getSandboxRuntimeProfile: () => ({
    workDirectory: '/workspace',
    homeDirectory: '/home/sandbox',
    defaultImage: 'target:v2'
  })
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox', () => ({
  createRuntimeOpenSandboxClient: mocks.client,
  createOpenSandboxResourceClient: mocks.client
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
    ensureSessionVolume: mocks.volume,
    deleteSessionVolume: mocks.deleteVolume,
    unmountSessionVolume: mocks.unmountVolume
  })
);
vi.mock('@fastgpt/service/core/ai/sandbox/config', () => ({
  getAgentSandboxMax: () => 100,
  getAgentSandboxMaxPerTeam: () => 1
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
let remoteRunning = false;
const events: string[] = [];
let leaseDepth = 0;
const read = () => repository.findSandboxInstanceBySandboxId({ sandboxId: query.sandboxId });
const create = async (status: 'running' | 'stopped' | 'provisioning', image = 'target:v2') => {
  await MongoSandboxInstance.create({
    ...query,
    teamId,
    status,
    ...(status === 'running' ? { instanceId: 'existing-instance-1' } : {}),
    storage,
    image,
    lastActiveAt: new Date(),
    ...(status === 'provisioning'
      ? {
          operation: {
            id: 'old-operation',
            type: 'provision',
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
  remoteRunning = false;
  events.length = 0;
  leaseDepth = 0;
  mocks.configuration.mockImplementation(() => ({
    clientConfig: { baseUrl: 'http://opensandbox.local', apiKey: 'key' },
    createConfig: { image: 'target:v2' }
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
  mocks.volume.mockImplementation(async (claimName) => {
    events.push(`volume:${claimName}`);
    return claimName;
  });
  mocks.deleteVolume.mockImplementation(async (claimName) => {
    events.push(`delete-volume:${claimName}`);
  });
  mocks.unmountVolume.mockResolvedValue(undefined);
  mocks.ensure.mockImplementation(async () => {
    if (!remoteRunning) {
      expect(leaseDepth).toBe(1);
      events.push('create:opensandbox');
      remoteRunning = true;
    }
  });
  mocks.client.mockImplementation(() => ({
    id: 'remote-instance-1',
    connectRunning: async () => {
      if (!remoteRunning) throw new SandboxNotFoundError('missing');
    },
    ensureRunning: () => mocks.ensure(),
    close: mocks.close,
    execute: mocks.execute,
    delete: async () => {
      events.push('delete:opensandbox');
      remoteRunning = false;
    },
    getInfo: async () =>
      remoteRunning ? { id: 'remote-instance-1', status: { state: 'Running' } } : null,
    writeFiles: mocks.write,
    deleteFiles: vi.fn(async () => undefined),
    readFiles: vi.fn(async () => [])
  }));
  mocks.execute.mockImplementation(async () => ({
    exitCode: 0,
    stderr: '',
    stdout: '0'
  }));
  mocks.write.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
});

describe('ensureSandboxRuntime', () => {
  it('creates one owned record inside per-sandbox Lifecycle Lease without cross-user Source Lease', async () => {
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
    expect(mocks.lifecycle).toHaveBeenCalledTimes(1);
  });

  it('uses the persisted deployment identity instead of caller-supplied ownership metadata', async () => {
    await ensureSandboxRuntime({
      query,
      options: { createConfig: { metadata: { deploymentId: 'f'.repeat(32), teamId } } }
    });

    expect(mocks.client).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxId: query.sandboxId,
        deploymentId: DEPLOYMENT_ID,
        createConfig: expect.objectContaining({
          metadata: expect.objectContaining({ teamId })
        })
      })
    );
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
    expect(mocks.lifecycle).not.toHaveBeenCalled();
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

  it('repairs a missing running container directly inside the Lifecycle Lease', async () => {
    await create('running');
    const result = await ensureSandboxRuntime({ query });
    expect(result.resource.status).toBe('running');
    expect(mocks.lifecycle).toHaveBeenCalledTimes(1);
    expect(events).toContain('create:opensandbox');
  });

  it('reuses a running container activated by a preceding queued caller without recreating', async () => {
    await create('stopped');
    mocks.lifecycle.mockImplementationOnce(async ({ fn }) => {
      await MongoSandboxInstance.updateOne(
        { sandboxId: query.sandboxId },
        { $set: { status: 'running', instanceId: 'queued-container' } }
      );
      remoteRunning = true;
      return fn(lease);
    });

    const result = await ensureSandboxRuntime({ query });
    expect(result.resource.status).toBe('running');
    expect(events).toEqual([]);
  });

  it('stops outdated running container and recreates with new image on the same volume', async () => {
    await create('running', 'target:v1');
    remoteRunning = true;
    const count = vi.spyOn(repository, 'countActiveSandboxInstances');
    const onUpgrade = vi.fn();
    const result = await ensureSandboxRuntime({ query, options: { onUpgrade } });
    expect(onUpgrade).toHaveBeenCalledOnce();
    expect(count).not.toHaveBeenCalled();
    expect(events).toEqual([
      'delete:opensandbox',
      'volume:test-existing-generation',
      'create:opensandbox'
    ]);
    expect(result.resource.status).toBe('running');
    expect(result.resource.image).toBe('target:v2');
  });

  it('deletes an unhealthy running container before remounting the volume and recreating', async () => {
    await create('running');
    mocks.client.mockImplementationOnce(() => ({
      connectRunning: async () => {
        throw new SandboxStateError('workspace unhealthy', {
          currentState: 'Error',
          requiredState: 'Running'
        });
      },
      close: mocks.close
    }));
    mocks.client.mockImplementationOnce(() => ({
      id: 'repaired-remote-id',
      connectRunning: async () => {
        throw new SandboxStateError('workspace unhealthy', {
          currentState: 'Error',
          requiredState: 'Running'
        });
      },
      delete: async () => {
        events.push('delete:opensandbox');
      },
      ensureRunning: () => mocks.ensure(),
      getInfo: async () => ({ id: 'repaired-remote-id', status: { state: 'Running' } }),
      close: mocks.close
    }));

    const result = await ensureSandboxRuntime({ query });
    expect(events).toEqual([
      'delete:opensandbox',
      'volume:test-existing-generation',
      'create:opensandbox'
    ]);
    expect(result.resource.status).toBe('running');
    expect(result.resource.instanceId).toBe('repaired-remote-id');
  });

  it('rejects invalid target configuration before modifying the existing instance', async () => {
    await create('running');
    mocks.configuration.mockImplementationOnce(() => {
      throw new Error('target credentials missing');
    });
    await expect(ensureSandboxRuntime({ query })).rejects.toThrow('target credentials missing');
    expect((await read())?.status).toBe('running');
  });

  it('checks admission again after rollback releases an active slot', async () => {
    await create('provisioning');
    await MongoSandboxInstance.create({
      ...query,
      sandboxId: 'competing-runtime',
      sourceId: 'competing-app',
      teamId,
      instanceId: 'competing-instance-1',
      status: 'running',
      lastActiveAt: new Date()
    });
    await expect(ensureSandboxRuntime({ query })).rejects.toThrow();
    expect((await read())?.status).toBe('stopped');
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it('rejects activation after source deletion before any remote action', async () => {
    mocks.active.mockRejectedValueOnce(new Error('source deleted'));
    await expect(ensureSandboxRuntime({ query })).rejects.toThrow('source deleted');
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(await read()).toBeNull();
  });

  it('rolls back unprovisioned record via Store-Load barrier when source is deleted concurrently during record creation', async () => {
    mocks.active
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('source deleted concurrently'));

    await expect(ensureSandboxRuntime({ query })).rejects.toThrow('source deleted concurrently');
    expect(mocks.volume).not.toHaveBeenCalled();
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(await read()).toBeNull();
  });

  it('rejects activation instead of committing running when OpenSandbox returns no instanceId', async () => {
    mocks.client.mockImplementationOnce(() => ({
      id: undefined,
      ensureRunning: () => mocks.ensure(),
      getInfo: async () => ({ id: '', status: { state: 'Running' } }),
      close: mocks.close
    }));

    await expect(
      ensureSandboxRuntime({
        query,
        options: { resourceLimits: { cpuCount: 2, memoryMiB: 2048 } }
      })
    ).rejects.toThrow('without returning instanceId');

    const failed = (await read())!;
    expect(failed.status).toBe('provisioning');
    expect(failed.resourceLimits).toEqual({ cpuCount: 2, memoryMiB: 2048 });
    expect(failed.operation?.error).toContain('without returning instanceId');
  });
});
