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
    instanceId: 'runner-instance-1',
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
            run: async () => ({ context: { skillVersionId: 'checkpoint-version' } })
          },
          {
            fromPhase: 'prepared',
            toPhase: 'providerStopped',
            run: async ({ resource }) => {
              expect(resource.context?.skillVersionId).toBe('checkpoint-version');
              expect((await read())?.operation?.phase).toBe('prepared');
            }
          }
        ],
        finish: {
          type: 'complete',
          status: 'stopped',
          set: ({ resource }) => ({
            context: { skillVersionId: resource.context?.skillVersionId }
          })
        }
      }
    });
    expect(result.status).toBe('stopped');
    expect(result.operation).toBeUndefined();
    expect(result.instanceId).toBeUndefined();
    expect(result.context?.skillVersionId).toBe('checkpoint-version');
  });

  it('persists failure diagnostics without imposing an isolation lockout window', async () => {
    const resource = await create();
    const error = new Error('connection interrupted');
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
    expect(failed.operation?.failedAt).toBeInstanceOf(Date);
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
              return { instanceId: 'provisioned-instance-1' };
            }
          }
        ],
        finish: { type: 'complete', status: 'running' }
      }
    });
    expect(await read()).toMatchObject({
      status: 'running',
      instanceId: 'provisioned-instance-1'
    });
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
