import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { RedisLeaseUnavailableError } from '@fastgpt/dal/redis/caches';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import * as repository from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository';
import { buildVolumeConfig } from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';
import {
  recoverSandboxActivation,
  recoverSandboxActivationWithinLease,
  retryStaleSandboxActivations
} from '@fastgpt/service/core/ai/sandbox/application/lifecycle/service';

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  getInfo: vi.fn(),
  close: vi.fn(),
  withSandboxLifecycleLease: vi.fn(),
  unmountSessionVolume: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  createOpenSandboxResourceClient: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxLifecycleLease: mocks.withSandboxLifecycleLease
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox', () => ({
  createOpenSandboxResourceClient: mocks.createOpenSandboxResourceClient
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/volume/config', () => ({
  getVolumeManagerEnvConfig: () => ({ volumeNamePrefix: 'test', enable: true })
}));
vi.mock(
  '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@fastgpt/service/core/ai/sandbox/infrastructure/volume/service')
      >();
    return {
      ...actual,
      unmountSessionVolume: mocks.unmountSessionVolume
    };
  }
);
vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({ error: mocks.error, warn: mocks.warn }),
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));
vi.mock('@fastgpt/service/core/ai/sandbox/config', () => ({
  getAgentSandboxMax: () => 100,
  getAgentSandboxMaxPerTeam: () => 1
}));

const sandboxId = 'activation-recovery-test';
const teamId = 'activation-recovery-team';
const storage = buildVolumeConfig('test-target-generation').storage;
const now = new Date('2026-10-12T00:00:00Z');
const lease = { signal: new AbortController().signal, assertValid: vi.fn() };
let remoteState: 'Running' | 'Stopped' | null;

const createResource = async (
  params: {
    phase?: string;
    heartbeatAt?: Date;
    storage?: typeof storage | null;
  } = {}
) => {
  const doc = await MongoSandboxInstance.create({
    sandboxId,
    teamId,
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'recovery-app',
    userId: 'user',
    status: 'provisioning',
    storage: params.storage === null ? undefined : (params.storage ?? storage),
    lastActiveAt: new Date(0),
    image: 'preserved-image:v1',
    context: {
      skillVersionId: 'preserved-version'
    },
    operation: {
      id: 'original-operation',
      type: 'provision',
      phase: params.phase ?? 'claimed',
      startedAt: new Date(0),
      heartbeatAt: params.heartbeatAt ?? new Date(0),
      error: 'request failed'
    }
  });
  return doc.toObject();
};

const read = () => repository.findSandboxInstanceBySandboxId({ sandboxId });

beforeAll(async () => {
  await MongoSandboxInstance.init();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  await MongoSandboxInstance.deleteMany({ teamId });
  lease.assertValid.mockReset();
  remoteState = 'Running';
  mocks.withSandboxLifecycleLease.mockImplementation(async ({ fn }) => fn(lease));
  mocks.createOpenSandboxResourceClient.mockReturnValue({
    delete: mocks.delete,
    getInfo: mocks.getInfo,
    close: mocks.close
  });
  mocks.delete.mockImplementation(async () => {
    remoteState = null;
  });
  mocks.getInfo.mockImplementation(async () =>
    remoteState ? { id: 'remote-instance-1', status: { state: remoteState } } : null
  );
  mocks.unmountSessionVolume.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
});

describe('recoverSandboxActivationWithinLease', () => {
  it('preserves successful recovery when local adapter cleanup fails', async () => {
    const resource = await createResource();
    mocks.close.mockRejectedValueOnce(new Error('connection close failed'));
    await expect(recoverSandboxActivationWithinLease({ resource, lease })).resolves.toMatchObject({
      status: 'stopped'
    });
  });

  it('destroys failed opensandbox provisioning, unmounts session volume, and preserves workspace and metadata', async () => {
    const resource = await createResource();
    const result = await recoverSandboxActivationWithinLease({ resource, lease });
    expect(result).toMatchObject({
      status: 'stopped',
      teamId,
      storage,
      context: { skillVersionId: 'preserved-version' },
      image: resource.image
    });
    expect(result.operation).toBeUndefined();
    expect(result.instanceId).toBeUndefined();
    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(mocks.unmountSessionVolume).toHaveBeenCalledWith('test-target-generation');
  });

  it('completes rollback to stopped even when best-effort session volume unmount fails', async () => {
    const resource = await createResource();
    mocks.unmountSessionVolume.mockRejectedValueOnce(new Error('volume-manager busy'));

    const result = await recoverSandboxActivationWithinLease({ resource, lease });
    expect(result.status).toBe('stopped');
    expect(mocks.unmountSessionVolume).toHaveBeenCalledWith('test-target-generation');
    expect(mocks.warn).toHaveBeenCalledOnce();
  });

  it('completes providerEnsured to running and persists remote instanceId when remote is still Running', async () => {
    const resource = await createResource({ phase: 'providerEnsured' });
    remoteState = 'Running';
    await expect(recoverSandboxActivationWithinLease({ resource, lease })).resolves.toMatchObject({
      status: 'running',
      instanceId: 'remote-instance-1'
    });
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('rolls back a completed providerEnsured phase whose provider is gone', async () => {
    const resource = await createResource({ phase: 'providerEnsured' });
    remoteState = null;
    expect((await recoverSandboxActivationWithinLease({ resource, lease })).status).toBe('stopped');
  });

  it('keeps quota occupied on an uncertain provider probe', async () => {
    const resource = await createResource({ phase: 'providerEnsured' });
    mocks.getInfo.mockRejectedValueOnce(new Error('probe timed out'));
    await expect(recoverSandboxActivationWithinLease({ resource, lease })).rejects.toThrow(
      'probe timed out'
    );
    expect((await read())?.operation?.id).toBe('original-operation');
    expect(await repository.countActiveSandboxInstances({ teamId })).toBe(1);
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('rechecks remote absence on terminal-commit retry', async () => {
    const resource = await createResource({ phase: 'rollbackProviderReleased' });
    await recoverSandboxActivationWithinLease({ resource, lease });
    expect((await read())?.status).toBe('stopped');
    expect(mocks.delete).toHaveBeenCalledOnce();
  });

  it('rejects unknown phases without destroying container', async () => {
    const unknown = await createResource({ phase: 'rollbackUnknown' });
    await expect(recoverSandboxActivationWithinLease({ resource: unknown, lease })).rejects.toThrow(
      'Unsupported'
    );
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});

describe('recoverSandboxActivation / retryStaleSandboxActivations', () => {
  it('uses non-blocking try-lock (waitTimeoutMs: 0) and rereads after acquiring the lease', async () => {
    await createResource();
    mocks.withSandboxLifecycleLease.mockImplementation(async ({ waitTimeoutMs, fn }) => {
      expect(waitTimeoutMs).toBe(0);
      await MongoSandboxInstance.updateOne(
        { sandboxId },
        {
          $set: { status: 'running', instanceId: 'leased-instance-1' },
          $unset: { operation: '' }
        }
      );
      return fn(lease);
    });
    await recoverSandboxActivation({ sandboxId });
    expect(mocks.delete).not.toHaveBeenCalled();
    expect((await read())?.status).toBe('running');
  });

  it('accepts disappearance while waiting for the lease', async () => {
    await createResource();
    mocks.withSandboxLifecycleLease.mockImplementation(async ({ fn }) => {
      await MongoSandboxInstance.deleteMany({ sandboxId });
      return fn(lease);
    });
    await expect(recoverSandboxActivation({ sandboxId })).resolves.toBeNull();
  });

  it('recovers stale provisioning via the cron and silently skips live leased operations', async () => {
    await createResource();
    mocks.withSandboxLifecycleLease.mockRejectedValueOnce(
      new RedisLeaseUnavailableError({
        key: `agent-sandbox:lifecycle:${sandboxId}`,
        label: 'recover'
      })
    );
    await retryStaleSandboxActivations(now);
    expect(mocks.error).not.toHaveBeenCalled();
    expect((await read())?.status).toBe('provisioning');

    await retryStaleSandboxActivations(now);
    expect((await read())?.status).toBe('stopped');
  });
});
