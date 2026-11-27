import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import * as repository from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository';
import {
  runSandboxLifecycleOperation,
  runSandboxLifecycleDeletion,
  type SandboxLifecycleDefinition
} from '@fastgpt/service/core/ai/sandbox/application/lifecycle/runner';
import { SandboxOperationConflictError } from '@fastgpt/service/core/ai/sandbox/application/lifecycle/error';
import { ConnectionError } from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/errors';
import { canResumeSandboxOperation } from '@fastgpt/service/core/ai/sandbox/application/lifecycle/utils';
import {
  SANDBOX_CREATE_UNCERTAIN_TIMEOUT_MS,
  SANDBOX_OPERATION_HEARTBEAT_INTERVAL_MS,
  SANDBOX_STALE_OPERATION_TIMEOUT_MS
} from '@fastgpt/service/core/ai/sandbox/constants';

const sandboxId = 'runner-contract-test';
const lease = { signal: new AbortController().signal, assertValid: vi.fn() };
const read = () => repository.findSandboxInstanceBySandboxId({ sandboxId });
const create = async () => {
  await MongoSandboxInstance.create({
    sandboxId,
    teamId: 'runner-team',
    sourceType: ChatSourceTypeEnum.app,
    sourceId: sandboxId,
    userId: 'user',
    provider: 'opensandbox',
    status: 'running',
    lastActiveAt: new Date()
  });
  return (await read())!;
};
const definition = (
  run: SandboxLifecycleDefinition['steps'][number]['run']
): SandboxLifecycleDefinition => ({
  status: 'stopping',
  steps: [{ fromPhase: 'claimed', toPhase: 'providerStopped', run }],
  finish: { type: 'complete', status: 'stopped' }
});

beforeAll(async () => {
  await MongoSandboxInstance.init();
});
beforeEach(async () => {
  vi.restoreAllMocks();
  lease.assertValid.mockReset();
  await MongoSandboxInstance.deleteMany({ sandboxId });
});

describe('runSandboxLifecycleOperation', () => {
  it('claims, persists returned checkpoint fields and returns the latest stable record', async () => {
    const resource = await create();
    const result = await runSandboxLifecycleOperation({
      resource,
      lease,
      definition: {
        status: 'stopping',
        steps: [
          {
            fromPhase: 'claimed',
            toPhase: 'prepared',
            run: async () => ({ versionId: 'checkpoint-version' })
          },
          {
            fromPhase: 'prepared',
            toPhase: 'providerStopped',
            run: async ({ resource }) => {
              expect(resource.versionId).toBe('checkpoint-version');
              expect((await read())?.operation?.phase).toBe('prepared');
            }
          }
        ],
        finish: {
          type: 'complete',
          status: 'stopped',
          set: ({ resource }) => ({ versionId: resource.versionId })
        }
      }
    });
    expect(result.status).toBe('stopped');
    expect(result.operation).toBeUndefined();
    expect(result.versionId).toBe('checkpoint-version');
  });

  it('allows immediate retry on deterministic errors, cools down 60s on non-create uncertain errors, and cools down 240s on create-phase uncertain errors', async () => {
    const resource = await create();
    const deterministicErr = new Error('data-plane restore failed (502)');
    await expect(
      runSandboxLifecycleOperation({
        resource,
        lease,
        definition: definition(async () => {
          throw deterministicErr;
        })
      })
    ).rejects.toBe(deterministicErr);
    const failedDeterministic = (await read())!;
    expect(canResumeSandboxOperation(failedDeterministic)).toBe(true);

    await MongoSandboxInstance.deleteMany({ sandboxId });
    const second = await create();
    const uncertainErr = new ConnectionError('Failed to stop sandbox', {
      cause: new TypeError('fetch failed')
    });
    await expect(
      runSandboxLifecycleOperation({
        resource: second,
        lease,
        definition: definition(async () => {
          throw uncertainErr;
        })
      })
    ).rejects.toBe(uncertainErr);
    const failedUncertain = (await read())!;
    expect(canResumeSandboxOperation(failedUncertain)).toBe(false);
    expect(
      canResumeSandboxOperation(
        failedUncertain,
        new Date(Date.now() + SANDBOX_STALE_OPERATION_TIMEOUT_MS + 10)
      )
    ).toBe(true);

    await MongoSandboxInstance.deleteMany({ sandboxId });
    await MongoSandboxInstance.create({
      sandboxId,
      teamId: 'runner-team',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: sandboxId,
      userId: 'user',
      provider: 'opensandbox',
      status: 'archived',
      lastActiveAt: new Date()
    });
    const archived = (await read())!;
    const createUncertainErr = new ConnectionError('Failed to create sandbox', {
      cause: new TypeError('fetch failed')
    });
    await expect(
      runSandboxLifecycleOperation({
        resource: archived,
        lease,
        definition: {
          status: 'restoring',
          steps: [
            { fromPhase: 'claimed', toPhase: 'volumeAssigned', run: async () => undefined },
            {
              fromPhase: 'volumeAssigned',
              toPhase: 'archiveInstalled',
              run: async () => {
                throw createUncertainErr;
              }
            }
          ],
          finish: { type: 'complete', status: 'running' }
        }
      })
    ).rejects.toBe(createUncertainErr);
    const failedRestoreCreate = (await read())!;
    expect(failedRestoreCreate.operation?.phase).toBe('volumeAssigned');
    expect(
      canResumeSandboxOperation(
        failedRestoreCreate,
        new Date(Date.now() + SANDBOX_STALE_OPERATION_TIMEOUT_MS + 10)
      )
    ).toBe(false);
    expect(
      canResumeSandboxOperation(
        failedRestoreCreate,
        new Date(Date.now() + SANDBOX_CREATE_UNCERTAIN_TIMEOUT_MS + 10)
      )
    ).toBe(true);
  });

  it('refreshes operation.heartbeatAt periodically while a long-running step holds the lease', async () => {
    const resource = await create();
    let markStepEntered!: () => void;
    const stepEntered = new Promise<void>((resolve) => {
      markStepEntered = resolve;
    });
    let finishStep!: () => void;
    const stepGate = new Promise<void>((resolve) => {
      finishStep = resolve;
    });

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date('2026-11-16T00:00:00.000Z'));
    try {
      const runPromise = runSandboxLifecycleOperation({
        resource,
        lease,
        definition: definition(async () => {
          markStepEntered();
          await stepGate;
        })
      });

      await stepEntered;
      const beforeHeartbeat = (await read())!.operation!.heartbeatAt.getTime();

      await vi.advanceTimersByTimeAsync(SANDBOX_OPERATION_HEARTBEAT_INTERVAL_MS + 100);
      // 后台心跳使用非阻塞 Mongo updateOne，轮询等待真实连接池落盘完成。
      await vi.waitFor(
        async () => {
          const refreshedHeartbeat = (await read())!.operation!.heartbeatAt.getTime();
          expect(refreshedHeartbeat).toBeGreaterThan(beforeHeartbeat);
        },
        { timeout: 2000, interval: 10 }
      );

      finishStep();
      const completed = await runPromise;
      expect(completed.status).toBe('stopped');
    } finally {
      vi.useRealTimers();
    }
  });

  it('resumes checkpoints without repeating prior steps and clears failure metadata', async () => {
    const resource = await create();
    const claimed = (await repository.claimSandboxOperation({
      resource,
      status: 'stopping',
      type: 'stop'
    }))!;
    const advanced = (await repository.advanceSandboxOperation({
      resource: claimed,
      operationId: claimed.operation!.id,
      status: 'stopping',
      phase: 'providerStopped'
    }))!;
    const step = vi.fn();
    const result = await runSandboxLifecycleOperation({
      resource: advanced,
      lease,
      definition: definition(step)
    });
    expect(step).not.toHaveBeenCalled();
    expect(result.status).toBe('stopped');
  });

  it('rejects stale claims without executing side effects', async () => {
    const resource = await create();
    await repository.claimSandboxOperation({ resource, status: 'stopping', type: 'stop' });
    const step = vi.fn();
    await expect(
      runSandboxLifecycleOperation({ resource, lease, definition: definition(step) })
    ).rejects.toBeInstanceOf(SandboxOperationConflictError);
    expect(step).not.toHaveBeenCalled();
  });

  it('uses the operation created with the initial record without replacing its token', async () => {
    const initial = await repository.createSandboxProvisioningInstance({
      sandboxId,
      teamId: 'runner-team',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: sandboxId,
      userId: 'user'
    });
    const token = initial.instance!.operation!.id;
    await runSandboxLifecycleOperation({
      resource: initial.instance!,
      lease,
      claim: { type: 'created' },
      definition: {
        status: 'provisioning',
        steps: [
          {
            fromPhase: 'claimed',
            toPhase: 'providerEnsured',
            run: async ({ operationId }) => {
              expect(operationId).toBe(token);
            }
          }
        ],
        finish: { type: 'complete', status: 'running' }
      }
    });
    expect((await read())?.status).toBe('running');
  });

  it('does not commit or mark failure after losing execution ownership', async () => {
    const resource = await create();
    await expect(
      runSandboxLifecycleOperation({
        resource,
        lease,
        definition: definition(async () => {
          lease.assertValid.mockImplementation(() => {
            throw new Error('lease lost');
          });
        })
      })
    ).rejects.toThrow('lease lost');
    const current = (await read())!;
    expect(current.operation?.phase).toBe('claimed');
    expect(current.operation?.error).toBeUndefined();
  });

  it('checks execution ownership again after terminal verification', async () => {
    const resource = await create();
    await expect(
      runSandboxLifecycleOperation({
        resource,
        lease,
        definition: {
          ...definition(async () => undefined),
          finish: {
            type: 'complete',
            status: 'stopped',
            beforeComplete: async () => {
              lease.assertValid.mockImplementation(() => {
                throw new Error('lease lost');
              });
            }
          }
        }
      })
    ).rejects.toThrow('lease lost');
    expect((await read())?.status).toBe('stopping');
  });

  it('rejects unknown persisted phases instead of treating them as claimed', async () => {
    const resource = await create();
    const claimed = (await repository.claimSandboxOperation({
      resource,
      status: 'stopping',
      type: 'stop',
      phase: 'futurePhase'
    }))!;
    await expect(
      runSandboxLifecycleOperation({
        resource: claimed,
        lease,
        definition: definition(async () => undefined)
      })
    ).rejects.toThrow('Unsupported stop phase');
  });

  it('retains the original failure when error persistence is unavailable', async () => {
    const resource = await create();
    vi.spyOn(repository, 'markSandboxOperationFailed').mockRejectedValueOnce(
      new Error('mongo unavailable')
    );
    await expect(
      runSandboxLifecycleOperation({
        resource,
        lease,
        definition: definition(async () => {
          throw new Error('original failure');
        })
      })
    ).rejects.toThrow('original failure');
  });
});

describe('runSandboxLifecycleDeletion', () => {
  it('deletes only the claimed deleting record and returns void', async () => {
    const resource = await create();
    await expect(
      runSandboxLifecycleDeletion({
        resource,
        lease,
        definition: { status: 'deleting', steps: [], finish: { type: 'delete' } }
      })
    ).resolves.toBeUndefined();
    expect(await read()).toBeNull();
  });
});
