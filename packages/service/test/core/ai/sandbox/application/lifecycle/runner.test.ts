import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import * as repository from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository';
import {
  runSandboxLifecycleOperation,
  runSandboxLifecycleDeletion,
  type SandboxLifecycleDefinition
} from '@fastgpt/service/core/ai/sandbox/application/lifecycle/runner';
import {
  SandboxOperationSettledError,
  SandboxOperationConflictError
} from '@fastgpt/service/core/ai/sandbox/application/lifecycle/error';
import { canResumeSandboxOperation } from '@fastgpt/service/core/ai/sandbox/application/lifecycle/utils';
import { SANDBOX_OPERATION_ISOLATION_MS } from '@fastgpt/service/core/ai/sandbox/constants';
import { ConnectionError, SandboxTerminationError } from '@fastgpt-sdk/sandbox-adapter';

/** 只包一层可观测 spy，行为仍委托真实 SDK 契约，用于断言“只判定一次”。 */
const sdkMocks = vi.hoisted(() => ({ getSandboxFailureDetail: vi.fn() }));
vi.mock('@fastgpt-sdk/sandbox-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt-sdk/sandbox-adapter')>();
  return { ...actual, getSandboxFailureDetail: sdkMocks.getSandboxFailureDetail };
});

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
    provider: 'sealosdevbox',
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
  const actual = await vi.importActual<typeof import('@fastgpt-sdk/sandbox-adapter')>(
    '@fastgpt-sdk/sandbox-adapter'
  );
  sdkMocks.getSandboxFailureDetail.mockReset();
  sdkMocks.getSandboxFailureDetail.mockImplementation(actual.getSandboxFailureDetail);
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

  it.each([true, false])('persists safe retry eligibility for settled=%s', async (settled) => {
    const resource = await create();
    const error = settled
      ? new SandboxOperationSettledError('command exited')
      : new Error('connection interrupted');
    await expect(
      runSandboxLifecycleOperation({
        resource,
        lease,
        definition: definition(async () => {
          throw error;
        })
      })
    ).rejects.toBe(error);
    const failed = (await read())!;
    expect(failed.status).toBe('stopping');
    expect(failed.operation?.error).toBe(error.message);
    expect(canResumeSandboxOperation(failed)).toBe(settled);
    expect(failed.operation?.retryAfter).toBeInstanceOf(Date);
  });

  it('settles structured termination evidence and allows immediate retry', async () => {
    const resource = await create();
    // 真实包装形态：provider 终止原因在 cause 链，外层是通用 ConnectionError。
    const error = new ConnectionError(
      'Failed to create sandbox',
      'http://opensandbox.local',
      new SandboxTerminationError(
        'KUBERNETES::POD_FAILED',
        'primary reason=ContainerFailed; container sandbox exited with code 127 (Error)'
      )
    );
    await expect(
      runSandboxLifecycleOperation({
        resource,
        lease,
        definition: definition(async () => {
          throw error;
        })
      })
    ).rejects.toBe(error);

    const failed = (await read())!;
    expect(failed.operation?.retryAfter).toBeInstanceOf(Date);
    expect(failed.operation!.retryAfter!.getTime() - Date.now()).toBeLessThanOrEqual(1_000);
    expect(canResumeSandboxOperation(failed)).toBe(true);
    // 只在本层判定一次，不重复遍历 cause 链。
    expect(sdkMocks.getSandboxFailureDetail).toHaveBeenCalledTimes(1);
  });

  it('keeps unknown results in the isolation window without settling the failure', async () => {
    const resource = await create();
    const error = new ConnectionError(
      'Failed to create sandbox',
      'http://opensandbox.local',
      new Error('KUBERNETES::POD_READY_TIMEOUT: sandbox did not become ready')
    );
    await expect(
      runSandboxLifecycleOperation({
        resource,
        lease,
        definition: definition(async () => {
          throw error;
        })
      })
    ).rejects.toBe(error);

    const failed = (await read())!;
    const retryDelta = failed.operation!.retryAfter!.getTime() - Date.now();
    expect(retryDelta).toBeGreaterThanOrEqual(SANDBOX_OPERATION_ISOLATION_MS.stop - 1_000);
    expect(retryDelta).toBeLessThanOrEqual(SANDBOX_OPERATION_ISOLATION_MS.stop);
    expect(canResumeSandboxOperation(failed)).toBe(false);
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
      userId: 'user',
      provider: 'sealosdevbox'
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
