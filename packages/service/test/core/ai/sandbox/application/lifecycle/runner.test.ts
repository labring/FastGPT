import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimSandboxOperation: vi.fn(),
  advanceSandboxOperation: vi.fn(),
  completeSandboxOperation: vi.fn(),
  deleteClaimedSandboxRecord: vi.fn(),
  markSandboxOperationFailed: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/instance/repository', () => ({
  claimSandboxOperation: mocks.claimSandboxOperation,
  advanceSandboxOperation: mocks.advanceSandboxOperation,
  completeSandboxOperation: mocks.completeSandboxOperation,
  deleteClaimedSandboxRecord: mocks.deleteClaimedSandboxRecord,
  markSandboxOperationFailed: mocks.markSandboxOperationFailed
}));

import { runSandboxLifecycleOperation } from '@fastgpt/service/core/ai/sandbox/application/lifecycle/runner';

const createResource = (overrides: Record<string, unknown> = {}) =>
  ({
    _id: 'resource-1',
    provider: 'opensandbox',
    sandboxId: 'sandbox-1',
    sourceType: ChatSourceTypeEnum.app,
    sourceId: 'app-1',
    userId: 'user-1',
    status: 'stopping',
    lastActiveAt: new Date('2026-07-01T00:00:00.000Z'),
    metadata: {
      operation: {
        id: 'operation-1',
        type: 'stop',
        phase: 'claimed',
        startedAt: new Date(),
        heartbeatAt: new Date()
      }
    },
    ...overrides
  }) as any;

const lease = {
  signal: new AbortController().signal,
  assertValid: vi.fn()
};

describe('sandbox lifecycle runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimSandboxOperation.mockResolvedValue(createResource());
    mocks.advanceSandboxOperation.mockImplementation(async ({ phase }: { phase: string }) =>
      createResource({
        metadata: {
          operation: {
            id: 'operation-1',
            type: 'stop',
            phase,
            startedAt: new Date(),
            heartbeatAt: new Date()
          }
        }
      })
    );
    mocks.completeSandboxOperation.mockResolvedValue(createResource({ status: 'stopped' }));
    mocks.deleteClaimedSandboxRecord.mockResolvedValue({ deletedCount: 1 });
    mocks.markSandboxOperationFailed.mockResolvedValue(undefined);
  });

  it('runs each step, checkpoints it, and completes the stable state', async () => {
    const firstStep = vi.fn(async () => undefined);
    const secondStep = vi.fn(async () => undefined);

    await runSandboxLifecycleOperation({
      resource: createResource(),
      lease,
      definition: {
        operationType: 'stop',
        status: 'stopping',
        steps: [
          { fromPhase: 'claimed', toPhase: 'providerStopped', run: firstStep },
          { fromPhase: 'providerStopped', toPhase: 'volumeStopped', run: secondStep }
        ],
        finish: { type: 'complete', status: 'stopped' }
      }
    });

    expect(firstStep).toHaveBeenCalledTimes(1);
    expect(secondStep).toHaveBeenCalledTimes(1);
    expect(mocks.advanceSandboxOperation.mock.calls.map(([input]) => input.phase)).toEqual([
      'providerStopped',
      'volumeStopped'
    ]);
    expect(mocks.completeSandboxOperation).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: 'stopping', status: 'stopped' })
    );
  });

  it('resumes from the persisted phase without replaying completed steps', async () => {
    const firstStep = vi.fn(async () => undefined);
    const secondStep = vi.fn(async () => undefined);
    mocks.claimSandboxOperation.mockResolvedValue(
      createResource({
        metadata: {
          operation: {
            id: 'operation-2',
            type: 'stop',
            phase: 'providerStopped',
            startedAt: new Date(),
            heartbeatAt: new Date()
          }
        }
      })
    );

    await runSandboxLifecycleOperation({
      resource: createResource(),
      lease,
      definition: {
        operationType: 'stop',
        status: 'stopping',
        steps: [
          { fromPhase: 'claimed', toPhase: 'providerStopped', run: firstStep },
          { fromPhase: 'providerStopped', toPhase: 'volumeStopped', run: secondStep }
        ],
        finish: { type: 'complete', status: 'stopped' }
      }
    });

    expect(firstStep).not.toHaveBeenCalled();
    expect(secondStep).toHaveBeenCalledTimes(1);
    expect(mocks.advanceSandboxOperation).toHaveBeenCalledTimes(1);
  });

  it('keeps the operation in its transition state when a step fails', async () => {
    const error = new Error('provider failed');
    await expect(
      runSandboxLifecycleOperation({
        resource: createResource(),
        lease,
        definition: {
          operationType: 'stop',
          status: 'stopping',
          steps: [
            {
              fromPhase: 'claimed',
              toPhase: 'providerStopped',
              run: async () => {
                throw error;
              }
            }
          ],
          finish: { type: 'complete', status: 'stopped' }
        }
      })
    ).rejects.toThrow('provider failed');

    expect(mocks.markSandboxOperationFailed).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'operation-1', status: 'stopping' })
    );
    expect(mocks.completeSandboxOperation).not.toHaveBeenCalled();
  });

  it('deletes the record only after all delete phases are checkpointed', async () => {
    await runSandboxLifecycleOperation({
      resource: createResource({ status: 'deleting' }),
      lease,
      definition: {
        operationType: 'delete',
        status: 'deleting',
        steps: [
          { fromPhase: 'claimed', toPhase: 'providerDeleted', run: async () => undefined },
          { fromPhase: 'providerDeleted', toPhase: 'archiveDeleted', run: async () => undefined }
        ],
        finish: { type: 'delete' }
      }
    });

    expect(mocks.deleteClaimedSandboxRecord).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'operation-1' })
    );
    expect(mocks.completeSandboxOperation).not.toHaveBeenCalled();
  });
});
