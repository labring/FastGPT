import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import * as repository from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository';
import { checkSandboxQuota } from '@fastgpt/service/core/ai/sandbox/application/quota';
import { buildVolumeConfig } from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';
import {
  recoverArchivingSandboxWithinLease,
  recoverSandboxActivation,
  recoverSandboxActivationWithinLease,
  retryStaleArchivingSandboxes,
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
  disconnectSandbox: vi.fn(),
  createOpenSandboxResourceClient: vi.fn(),
  deleteSessionVolume: vi.fn(),
  withSandboxLease: vi.fn(),
  isAgentSandboxOpenSandboxConfigured: vi.fn(),
  s3: vi.fn(),
  error: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/lease', () => ({
  withSandboxLease: mocks.withSandboxLease
}));
vi.mock('@fastgpt/service/core/ai/sandbox/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/config')>()),
  isAgentSandboxOpenSandboxConfigured: mocks.isAgentSandboxOpenSandboxConfigured,
  getAgentSandboxCommonConfig: () => ({ maxEditDebug: 100, maxPerTeam: 1 })
}));
vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox', () => ({
  createOpenSandboxResourceClient: mocks.createOpenSandboxResourceClient,
  disconnectSandbox: mocks.disconnectSandbox
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
  getLogger: () => ({ error: mocks.error, debug: vi.fn(), info: vi.fn(), warn: vi.fn() }),
  LogCategories: { MODULE: { AI: { SANDBOX: 'sandbox' } } }
}));

const sandboxId = 'activation-recovery-test';
const teamId = 'activation-recovery-team';
const storage = buildVolumeConfig('test-target-generation').storage;
const archive = {
  objectKey: `sandbox/${sandboxId}/gen1.tar.zst`,
  generation: 'gen1',
  format: 'tar.zst' as const,
  sizeBytes: 128,
  archivedAt: new Date('2026-10-01T00:00:00Z')
};
const now = new Date('2026-10-12T00:00:00Z');
const lease = { signal: new AbortController().signal, assertValid: vi.fn() };
let remoteState: 'Running' | 'Stopped' | null;

const createResource = async (
  params: {
    status?: 'provisioning' | 'restoring' | 'archiving';
    phase?: string;
    provider?: SandboxProviderType;
    instanceId?: string;
    heartbeatAt?: Date;
    storage?: Record<string, unknown> | null;
  } = {}
) => {
  const status = params.status ?? 'restoring';
  const defaultStorage = status === 'restoring' ? { ...storage, archive } : storage;
  const doc = await MongoSandboxInstance.create({
    sandboxId,
    teamId,
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'recovery-app',
    userId: 'user',
    provider: params.provider ?? 'opensandbox',
    ...(params.instanceId !== undefined ? { instanceId: params.instanceId } : {}),
    status,
    storage: params.storage === null ? undefined : (params.storage ?? defaultStorage),
    lastActiveAt: new Date(0),
    image: { repository: 'preserved-image', tag: 'v1' },
    versionId: 'preserved-version',
    operation: {
      id: 'original-operation',
      type: status === 'restoring' ? 'restore' : status === 'archiving' ? 'archive' : 'provision',
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
    storage: { ...storage, archive },
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
  mocks.isAgentSandboxOpenSandboxConfigured.mockReturnValue(true);
  mocks.withSandboxLease.mockImplementation(async ({ fn }) => fn(lease));
  mocks.createOpenSandboxResourceClient.mockImplementation(() => ({
    id: 'remote-instance-1',
    stop: mocks.stop,
    delete: mocks.delete,
    getInfo: mocks.getInfo,
    close: vi.fn(async () => undefined)
  }));
  mocks.stop.mockImplementation(async () => {
    remoteState = null;
  });
  mocks.delete.mockImplementation(async () => {
    remoteState = null;
  });
  mocks.getInfo.mockImplementation(async () =>
    remoteState ? { id: 'remote-instance-1', status: { state: remoteState } } : null
  );
  mocks.disconnectSandbox.mockResolvedValue(undefined);
  mocks.deleteSessionVolume.mockResolvedValue(undefined);
});

describe('isSandboxActivationRecoverable / isSandboxActivationRollback', () => {
  it.each([
    { status: 'provisioning' as const, phase: 'claimed', expectedMs: 240_000 },
    { status: 'restoring' as const, phase: 'volumeAssigned', expectedMs: 240_000 },
    { status: 'provisioning' as const, phase: 'providerEnsured', expectedMs: 60_000 },
    { status: 'restoring' as const, phase: 'claimed', expectedMs: 60_000 }
  ])(
    'requires $expectedMs stale timeout for orphaned $status ($phase) operations without retryAfter',
    ({ status, phase, expectedMs }) => {
      const resource = makeResourceDoc({
        status,
        phase,
        heartbeatAt: new Date(now.getTime() - expectedMs + 1)
      });
      expect(isSandboxActivationRecoverable(resource, now)).toBe(false);
      expect(isSandboxActivationRecoverable(resource, new Date(now.getTime() + 1))).toBe(true);
    }
  );

  it('keeps recent orphaned operations untouched without acquiring lease', async () => {
    const resource = await createResource({ status: 'provisioning', heartbeatAt: now });
    expect(isSandboxActivationRecoverable(resource, now)).toBe(false);
    expect(isSandboxActivationRollback(resource)).toBe(false);
    await recoverSandboxActivation({ sandboxId, now });
    expect(mocks.withSandboxLease).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('allows rollback continuation without reopening the forward isolation window', () => {
    const resource = makeResourceDoc({ phase: 'rollbackClaimed', heartbeatAt: now });
    expect(isSandboxActivationRecoverable(resource, now)).toBe(true);
    expect(isSandboxActivationRollback(resource)).toBe(true);
  });
});

describe('recoverSandboxActivationWithinLease', () => {
  it('deletes failed opensandbox provisioning container while preserving PVC and metadata', async () => {
    const resource = await createResource({ status: 'provisioning', provider: 'opensandbox' });
    const result = await recoverSandboxActivationWithinLease({ resource, lease, now });

    expect(result).toMatchObject({
      status: 'stopped',
      teamId,
      storage,
      versionId: 'preserved-version',
      image: resource.image
    });
    expect(result.operation).toBeUndefined();
    expect(result.instanceId).toBeUndefined();
    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
    expect(mocks.s3).not.toHaveBeenCalled();
  });

  it('rolls back restore with durable intent, deletes temp container/PVC, and keeps S3 archive', async () => {
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
      now
    });

    expect(result).toMatchObject({ status: 'archived', teamId });
    expect(result.storage?.archive).toEqual(archive);
    expect(result.storage?.volumes).toBeUndefined();
    expect(result.storage?.mountPath).toBeUndefined();
    expect(mocks.s3).not.toHaveBeenCalled();
  });

  it.each(['providerEnsured', 'archiveInstalled'])(
    'rolls back a completed %s phase whose container is gone',
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

  it('fast-commits running when providerEnsured/archiveInstalled container is already Running', async () => {
    const resource = await createResource({
      phase: 'providerEnsured',
      status: 'provisioning',
      instanceId: 'remote-instance-1'
    });
    remoteState = 'Running';

    const result = await recoverSandboxActivationWithinLease({ resource, lease, now });

    expect(result.status).toBe('running');
    expect(result.instanceId).toBe('remote-instance-1');
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('keeps quota occupied on an uncertain container probe', async () => {
    const resource = await createResource({ phase: 'archiveInstalled' });
    mocks.getInfo.mockRejectedValueOnce(new Error('probe timed out'));
    await expect(recoverSandboxActivationWithinLease({ resource, lease, now })).rejects.toThrow(
      'probe timed out'
    );
    expect((await read())?.operation?.id).toBe('original-operation');
    expect(await repository.countActiveSandboxInstances({ teamId })).toBe(1);
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.disconnectSandbox).toHaveBeenCalledOnce();
  });

  it('skips volume deletion when restore rolls back before volumeAssigned (no storage volumes)', async () => {
    const resource = await createResource({ phase: 'claimed', storage: { archive } });
    const result = await recoverSandboxActivationWithinLease({ resource, lease, now });
    expect(result.status).toBe('archived');
    expect(result.storage?.archive).toEqual(archive);
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
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

  it('retains active quota when remote container remains', async () => {
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

  it('rolls back stale archiving at claimed phase back to stopped while keeping PVC', async () => {
    const resource = await createResource({
      status: 'archiving',
      phase: 'claimed',
      storage
    });
    const result = await recoverArchivingSandboxWithinLease({ resource, lease, now });
    expect(result.status).toBe('stopped');
    expect(result.storage).toEqual(storage);
    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(mocks.deleteSessionVolume).not.toHaveBeenCalled();
  });

  it('continues already-committed rollbackClaimed archiving immediately even before 20m isolation expires', async () => {
    const resource = await createResource({
      status: 'archiving',
      phase: 'rollbackClaimed',
      storage,
      heartbeatAt: now
    });
    const result = await recoverArchivingSandboxWithinLease({ resource, lease, now });
    expect(result.status).toBe('stopped');
    expect(result.storage).toEqual(storage);
    expect(mocks.delete).toHaveBeenCalledOnce();
  });
});

describe('recoverSandboxActivation / retryStaleSandboxActivations', () => {
  it('rereads after acquiring the lease and leaves a concurrent stable transition untouched', async () => {
    await createResource();
    mocks.withSandboxLease.mockImplementation(async ({ fn }) => {
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
    mocks.withSandboxLease.mockImplementation(async ({ fn }) => {
      await MongoSandboxInstance.deleteMany({ sandboxId });
      return fn(lease);
    });
    await expect(recoverSandboxActivation({ sandboxId, now })).resolves.toBeNull();
  });

  it('does not take over a new forward operation that replaced the stale scan candidate', async () => {
    await createResource();
    mocks.withSandboxLease.mockImplementation(async ({ fn }) => {
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
      storage: { ...storage, archive },
      operation: {
        id: 'second-operation',
        type: 'restore',
        phase: 'claimed',
        startedAt: new Date(0),
        heartbeatAt: new Date(0)
      }
    });
    let secondRemoteState: 'Running' | null = 'Running';
    mocks.createOpenSandboxResourceClient.mockImplementation(
      ({ sandboxId: clientSandboxId }: { sandboxId: string }) => {
        if (clientSandboxId === sandboxId) {
          return {
            id: 'remote-instance-1',
            stop: mocks.stop,
            delete: vi.fn(async () => {
              throw new Error('first provider unavailable');
            }),
            getInfo: mocks.getInfo,
            close: vi.fn(async () => undefined)
          };
        }
        return {
          id: `remote-${clientSandboxId}`,
          stop: mocks.stop,
          delete: vi.fn(async () => {
            secondRemoteState = null;
          }),
          getInfo: vi.fn(async () =>
            secondRemoteState
              ? { id: `remote-${clientSandboxId}`, status: { state: secondRemoteState } }
              : null
          ),
          close: vi.fn(async () => undefined)
        };
      }
    );
    await retryStaleSandboxActivations(now);
    expect((await read())?.status).toBe('provisioning');
    expect((await MongoSandboxInstance.findById(second._id).lean())?.status).toBe('archived');
    expect(mocks.error).toHaveBeenCalledOnce();
  });

  it('prevents premature takeover while an in-flight 210s create request may still run, then cleans the late-appearing container after 240s', async () => {
    const resource = await createResource({ status: 'provisioning', heartbeatAt: now });
    // t = 0..180s：旧进程崩溃前发出的 POST /sandboxes 仍在 210s 创建超时窗口内飞行，远端尚不可见。
    remoteState = null;

    const at180s = new Date(now.getTime() + 180_000);
    await retryStaleSandboxActivations(at180s);
    const untouched = await recoverSandboxActivationWithinLease({
      resource,
      lease,
      now: at180s
    });
    expect(untouched.status).toBe('provisioning');
    expect(mocks.delete).not.toHaveBeenCalled();

    // t = 190s（240s 窗口内）：在途 POST /sandboxes 迟到返回 202 落库变为可见，240s 窗口结束前仍不抢跑。
    remoteState = 'Running';
    await retryStaleSandboxActivations(new Date(now.getTime() + 190_000));
    expect(mocks.delete).not.toHaveBeenCalled();
    expect((await read())?.status).toBe('provisioning');

    // t = 240s + 1ms：覆盖 210s create 超时 + 30s 余量后接管，彻底清理迟到容器并收敛至 stopped。
    await retryStaleSandboxActivations(new Date(now.getTime() + 240_000 + 1));
    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(remoteState).toBeNull();
    expect((await read())?.status).toBe('stopped');
    expect((await read())?.operation).toBeUndefined();
  });

  it('converges invisible crashed create after 240s to stopped', async () => {
    await createResource({ status: 'provisioning', heartbeatAt: now });
    remoteState = null;

    // t = 240s + 1ms：旧线程尚未完成，远端仍不可见；接管完成清理并收敛至 stopped。
    await retryStaleSandboxActivations(new Date(now.getTime() + 240_000 + 1));
    expect((await read())?.status).toBe('stopped');
    expect((await read())?.operation).toBeUndefined();
  });

  it('rolls back instead of committing running when instanceId mismatches the remote container id', async () => {
    await MongoSandboxInstance.deleteMany({ teamId });
    await MongoSandboxInstance.create({
      sandboxId,
      teamId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'recovery-app',
      userId: 'user',
      provider: 'opensandbox',
      instanceId: 'expected-instance-1',
      status: 'provisioning',
      storage,
      lastActiveAt: new Date(0),
      operation: {
        id: 'op-current',
        type: 'provision',
        phase: 'providerEnsured',
        previousStatus: 'stopped',
        startedAt: new Date(0),
        heartbeatAt: new Date(0)
      }
    });
    const doc = (await read())!;
    remoteState = 'Running';
    mocks.getInfo.mockImplementation(async () =>
      remoteState
        ? {
            id: 'different-instance-2',
            status: { state: remoteState },
            metadata: { app: 'fastgpt', sessionId: sandboxId, operationId: 'op-current' }
          }
        : null
    );

    const recovered = await recoverSandboxActivationWithinLease({
      resource: doc,
      lease,
      now
    });

    expect(recovered.status).toBe('stopped');
    expect(recovered.instanceId).toBeUndefined();
    expect(mocks.delete).toHaveBeenCalledOnce();
  });

  it('replays container deletion when archiving recovery at rollbackProviderReleased sees a late-appearing container', async () => {
    await createResource({
      status: 'archiving',
      phase: 'rollbackProviderReleased',
      storage,
      heartbeatAt: new Date(Date.now() - 10 * 60 * 1000)
    });
    remoteState = 'Running';

    await retryStaleArchivingSandboxes();

    const recovered = await read();
    expect(mocks.delete).toHaveBeenCalledOnce();
    expect(recovered?.status).toBe('stopped');
    expect(recovered?.operation).toBeUndefined();
  });
});
