import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import * as repository from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository';
import { checkSandboxQuota } from '@fastgpt/service/core/ai/sandbox/application/quota';
import { buildVolumeConfig } from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';
import {
  recoverSandboxActivation,
  recoverSandboxActivationWithinLease,
  retryStaleSandboxActivations
} from '@fastgpt/service/core/ai/sandbox/application/lifecycle/service';
import {
  isSandboxActivationRecoverable,
  isSandboxActivationRollback
} from '@fastgpt/service/core/ai/sandbox/application/lifecycle/utils';
import type { SandboxProviderType } from '@fastgpt/service/core/ai/sandbox/type';

const mocks = vi.hoisted(() => ({
  stop: vi.fn(),
  delete: vi.fn(),
  getInfo: vi.fn(),
  close: vi.fn(),
  deleteSessionVolume: vi.fn(),
  withSandboxLifecycleLease: vi.fn(),
  s3: vi.fn(),
  error: vi.fn(),
  buildSandboxResourceAdapter: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxLifecycleLease: mocks.withSandboxLifecycleLease
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter', () => ({
  buildSandboxResourceAdapter: mocks.buildSandboxResourceAdapter
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
    deleteSessionVolume: mocks.deleteSessionVolume
  })
);
vi.mock('@fastgpt/service/common/s3/sources/sandbox', () => ({ getS3SandboxSource: mocks.s3 }));
vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({ error: mocks.error }),
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

/** 使用真实 Mongo、CAS、runner 和 quota，只替换远端基础设施。 */
const createResource = async (
  params: {
    status?: 'provisioning' | 'restoring';
    phase?: string;
    provider?: SandboxProviderType;
    heartbeatAt?: Date;
    storage?: typeof storage | null;
  } = {}
) => {
  const status = params.status ?? 'restoring';
  const doc = await MongoSandboxInstance.create({
    sandboxId,
    teamId,
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'recovery-app',
    userId: 'user',
    provider: params.provider ?? 'opensandbox',
    status,
    storage: params.storage === null ? undefined : (params.storage ?? storage),
    lastActiveAt: new Date(0),
    image: { repository: 'preserved-image', tag: 'v1' },
    versionId: 'preserved-version',
    operation: {
      id: 'original-operation',
      type: status === 'restoring' ? 'restore' : 'provision',
      phase: params.phase ?? 'claimed',
      previousStatus: status === 'restoring' ? 'archived' : 'stopped',
      startedAt: new Date(0),
      heartbeatAt: params.heartbeatAt ?? new Date(0),
      error: 'request failed'
    }
  });
  return doc.toObject();
};
const makeResourceDoc = (params: {
  status?: 'provisioning' | 'restoring';
  phase?: string;
  heartbeatAt?: Date;
  retryAfter?: Date;
}) =>
  ({
    sandboxId,
    teamId,
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'recovery-app',
    userId: 'user',
    provider: 'opensandbox',
    status: params.status ?? 'restoring',
    storage,
    lastActiveAt: new Date(0),
    image: { repository: 'preserved-image', tag: 'v1' },
    versionId: 'preserved-version',
    operation: {
      id: 'original-operation',
      type: (params.status ?? 'restoring') === 'restoring' ? 'restore' : 'provision',
      phase: params.phase ?? 'claimed',
      previousStatus: (params.status ?? 'restoring') === 'restoring' ? 'archived' : 'stopped',
      startedAt: new Date(0),
      heartbeatAt: params.heartbeatAt ?? new Date(0),
      retryAfter: params.retryAfter
    }
  }) as repository.SandboxResourceDoc;
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
  mocks.buildSandboxResourceAdapter.mockReturnValue({
    stop: mocks.stop,
    delete: mocks.delete,
    getInfo: mocks.getInfo,
    close: mocks.close
  });
  mocks.stop.mockImplementation(async () => {
    remoteState = null;
  });
  mocks.delete.mockImplementation(async () => {
    remoteState = null;
  });
  mocks.getInfo.mockImplementation(async () =>
    remoteState ? { status: { state: remoteState } } : null
  );
  mocks.close.mockResolvedValue(undefined);
  mocks.deleteSessionVolume.mockResolvedValue(undefined);
});

describe('isSandboxActivationRecoverable / isSandboxActivationRollback', () => {
  it.each([
    ['provisioning', 5],
    ['restoring', 20]
  ] as const)('requires the full %s isolation window even after an error', (status, minutes) => {
    const resource = makeResourceDoc({
      status,
      heartbeatAt: new Date(now.getTime() - minutes * 60 * 1000 + 1)
    });
    expect(isSandboxActivationRecoverable(resource, now)).toBe(false);
    expect(isSandboxActivationRecoverable(resource, new Date(now.getTime() + 1))).toBe(true);
  });
  it('keeps recent errors isolated without acquiring lease', async () => {
    const resource = await createResource({ status: 'provisioning', heartbeatAt: now });
    expect(isSandboxActivationRecoverable(resource, now)).toBe(false);
    expect(isSandboxActivationRollback(resource)).toBe(false);
    await recoverSandboxActivation({ sandboxId, now });
    expect(mocks.withSandboxLifecycleLease).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
  it('allows rollback continuation without reopening the forward isolation window', () => {
    const resource = makeResourceDoc({ phase: 'rollbackClaimed', heartbeatAt: now });
    expect(isSandboxActivationRecoverable(resource, now)).toBe(true);
    expect(isSandboxActivationRollback(resource)).toBe(true);
  });
});

describe('recoverSandboxActivationWithinLease', () => {
  it('preserves successful recovery when local adapter cleanup fails', async () => {
    const resource = await createResource();
    mocks.close.mockRejectedValueOnce(new Error('connection close failed'));
    await expect(
      recoverSandboxActivationWithinLease({ resource, lease, now })
    ).resolves.toMatchObject({ status: 'archived' });
  });
  it.each(['opensandbox', 'sealosdevbox'] as const)(
    'stops failed %s provisioning and preserves workspace and metadata',
    async (provider) => {
      const resource = await createResource({ status: 'provisioning', provider });
      if (provider === 'sealosdevbox')
        mocks.stop.mockImplementation(async () => {
          remoteState = 'Stopped';
        });
      const result = await recoverSandboxActivationWithinLease({ resource, lease, now });
      expect(result).toMatchObject({
        status: 'stopped',
        teamId,
        storage,
        versionId: 'preserved-version',
        image: resource.image
      });
      expect(result.operation).toBeUndefined();
      expect(mocks.stop).toHaveBeenCalledOnce();
      expect(mocks.delete).not.toHaveBeenCalled();
      expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
      expect(mocks.s3).not.toHaveBeenCalled();
    }
  );

  it('rolls back restore before migration with durable intent and exact volume', async () => {
    const resource = await createResource({ phase: 'claimed' });
    mocks.delete.mockImplementation(async () => {
      expect((await read())?.operation?.phase).toBe('rollbackClaimed');
      remoteState = null;
    });
    mocks.deleteSessionVolume.mockImplementation(async (claimName) => {
      expect(claimName).toBe('test-target-generation');
      expect((await read())?.operation?.phase).toBe('rollbackProviderReleased');
    });
    const result = await recoverSandboxActivationWithinLease({
      resource,
      lease,
      now,
      rollbackRestore: true
    });
    expect(result).toMatchObject({ status: 'archived', storage, teamId });
    expect(mocks.s3).not.toHaveBeenCalled();
  });

  it.each(['providerEnsured', 'archiveInstalled'])(
    'rolls back a completed %s phase whose provider is gone',
    async (phase) => {
      const resource = await createResource({
        phase,
        status: phase === 'providerEnsured' ? 'provisioning' : 'restoring'
      });
      remoteState = null;
      expect((await recoverSandboxActivationWithinLease({ resource, lease, now })).status).toBe(
        phase === 'providerEnsured' ? 'stopped' : 'archived'
      );
    }
  );

  it('keeps quota occupied on an uncertain provider probe', async () => {
    const resource = await createResource({ phase: 'archiveInstalled' });
    mocks.getInfo.mockRejectedValueOnce(new Error('probe timed out'));
    await expect(recoverSandboxActivationWithinLease({ resource, lease, now })).rejects.toThrow(
      'probe timed out'
    );
    expect((await read())?.operation?.id).toBe('original-operation');
    expect(await repository.countActiveSandboxInstances({ teamId })).toBe(1);
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('persists the legacy cleanup target before the first destructive call', async () => {
    const resource = await createResource({ storage: null });
    mocks.delete.mockImplementation(async () => {
      expect((await read())?.storage).toEqual(buildVolumeConfig(`test-${sandboxId}`).storage);
      remoteState = null;
    });
    await recoverSandboxActivationWithinLease({ resource, lease, now });
    expect(mocks.deleteSessionVolume).toHaveBeenCalledWith(`test-${sandboxId}`);
  });

  it('does not guess a missing restore generation', async () => {
    const resource = await createResource({ phase: 'volumeAssigned', storage: null });
    await expect(recoverSandboxActivationWithinLease({ resource, lease, now })).rejects.toThrow(
      'no persisted workspace claimName'
    );
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
    expect((await read())?.status).toBe('restoring');
  });

  it('resumes after an operation failure and only releases quota after terminal commit', async () => {
    const resource = await createResource();
    const fault = new Error('crash during volume release');
    mocks.deleteSessionVolume.mockRejectedValueOnce(fault);
    await expect(recoverSandboxActivationWithinLease({ resource, lease, now })).rejects.toThrow(
      fault.message
    );
    expect(await repository.countActiveSandboxInstances({ teamId })).toBe(1);
    const identity = {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'another-app',
      userId: 'other',
      teamId,
      current: null
    };
    await expect(checkSandboxQuota(identity)).rejects.toThrow();
    const current = await read();
    expect(current).not.toBeNull();
    if (current?.operation?.retryAfter) {
      const beforeRetry = new Date(current.operation.retryAfter.getTime() - 1);
      const skipped = await recoverSandboxActivationWithinLease({
        resource: current,
        lease,
        now: beforeRetry
      });
      expect(skipped.status).toBe('restoring');
    }
    await recoverSandboxActivationWithinLease({
      resource: current!,
      lease,
      now: current?.operation?.retryAfter ?? now
    });
    expect((await read())?.status).toBe('archived');
    expect(await repository.countActiveSandboxInstances({ teamId })).toBe(0);
    await expect(checkSandboxQuota(identity)).resolves.toBeUndefined();
    expect(mocks.s3).not.toHaveBeenCalled();
  });

  it('retains active quota when another physical provider resource remains', async () => {
    const resource = await createResource();
    mocks.delete.mockResolvedValue(undefined);
    await expect(recoverSandboxActivationWithinLease({ resource, lease, now })).rejects.toThrow(
      'not been released'
    );
    expect((await read())?.operation?.phase).toBe('rollbackClaimed');
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
  });

  it('rechecks remote absence on terminal-commit retry', async () => {
    const resource = await createResource({ phase: 'rollbackVolumeReleased' });
    await recoverSandboxActivationWithinLease({ resource, lease, now });
    expect((await read())?.status).toBe('archived');
    expect(mocks.delete).toHaveBeenCalledOnce();
  });

  it('rejects unknown phases without deleting', async () => {
    const unknown = await createResource({ phase: 'rollbackUnknown' });
    await expect(
      recoverSandboxActivationWithinLease({ resource: unknown, lease, now })
    ).rejects.toThrow('Unsupported');
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});

describe('recoverSandboxActivation / retryStaleSandboxActivations', () => {
  it('rolls back an installed old-provider restore before switching to the configured provider', async () => {
    await createResource({ phase: 'archiveInstalled' });
    await recoverSandboxActivation({ sandboxId, now, targetProvider: 'sealosdevbox' });
    expect((await read())?.status).toBe('archived');
    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(mocks.s3).not.toHaveBeenCalled();
  });
  it('rereads after acquiring the lease and leaves a concurrent stable transition untouched', async () => {
    await createResource();
    mocks.withSandboxLifecycleLease.mockImplementation(async ({ fn }) => {
      await MongoSandboxInstance.updateOne(
        { sandboxId },
        { $set: { status: 'running' }, $unset: { operation: '' } }
      );
      return fn(lease);
    });
    await recoverSandboxActivation({ sandboxId, now });
    expect(mocks.delete).not.toHaveBeenCalled();
    expect((await read())?.status).toBe('running');
  });
  it('accepts disappearance while waiting for the lease', async () => {
    await createResource();
    mocks.withSandboxLifecycleLease.mockImplementation(async ({ fn }) => {
      await MongoSandboxInstance.deleteMany({ sandboxId });
      return fn(lease);
    });
    await expect(recoverSandboxActivation({ sandboxId, now })).resolves.toBeNull();
  });

  it('does not take over a new forward operation that replaced the stale scan candidate', async () => {
    await createResource();
    mocks.withSandboxLifecycleLease.mockImplementation(async ({ fn }) => {
      await MongoSandboxInstance.updateOne(
        { sandboxId },
        { $set: { 'operation.id': 'new-operation', 'operation.heartbeatAt': now } }
      );
      return fn(lease);
    });
    await recoverSandboxActivation({ sandboxId, now });
    expect(mocks.delete).not.toHaveBeenCalled();
    expect((await read())?.operation?.id).toBe('new-operation');
  });
  it('recovers stale provisioning via the cron and logs an isolated restore failure', async () => {
    await createResource({ status: 'provisioning' });
    await retryStaleSandboxActivations(now);
    expect((await read())?.status).toBe('stopped');
    await MongoSandboxInstance.deleteMany({ sandboxId });
    await createResource();
    mocks.delete.mockRejectedValueOnce(new Error('provider unavailable'));
    await retryStaleSandboxActivations(now);
    expect(mocks.error).toHaveBeenCalledWith(
      'Failed to recover sandbox activation',
      expect.objectContaining({ sandboxId })
    );
    expect((await read())?.status).toBe('restoring');
    await retryStaleSandboxActivations((await read())?.operation?.retryAfter ?? now);
    expect((await read())?.status).toBe('archived');
  });

  it('continues the cron batch after another identity fails cleanup', async () => {
    await createResource({ status: 'provisioning' });
    const secondId = `${sandboxId}-second`;
    const second = await MongoSandboxInstance.create({
      sandboxId: secondId,
      teamId,
      provider: 'opensandbox',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'other-recovery-app',
      userId: 'user',
      status: 'restoring',
      storage,
      operation: {
        id: 'second-operation',
        type: 'restore',
        phase: 'claimed',
        startedAt: new Date(0),
        heartbeatAt: new Date(0)
      }
    });
    mocks.stop.mockRejectedValueOnce(new Error('first provider unavailable'));
    await retryStaleSandboxActivations(now);
    expect((await read())?.status).toBe('provisioning');
    expect((await MongoSandboxInstance.findById(second._id).lean())?.status).toBe('archived');
    expect(mocks.error).toHaveBeenCalledOnce();
  });
});
