import { describe, expect, it } from 'vitest';
import { SagaConflictError } from '../src';
import { createMemorySagaDriver, type MemorySagaTransaction } from './support';

const now = new Date('2026-01-01T00:00:00.000Z');

const snapshot = (sagaId: string, reservationKeys: string[]) => ({
  sagaId,
  name: 'driver.test',
  version: 1,
  manifestSignature: 'v1',
  inputHash: sagaId,
  reservationKeys,
  status: 'pending' as const,
  input: {},
  state: {},
  nextStepIndex: 0,
  executionEpoch: 0,
  nextRunAt: now,
  revision: 0,
  createdAt: now,
  updatedAt: now
});

describe('createMemorySagaDriver.start', () => {
  it('atomically reserves all keys and rolls back initialize failures', async () => {
    const driver = createMemorySagaDriver({ initialized: [] as string[] });

    await expect(
      driver.start({
        snapshot: snapshot('failed', ['a', 'b']),
        initialize: async (transaction) => {
          transaction.domain.initialized.push('failed');
          throw new Error('rollback');
        }
      })
    ).rejects.toThrow('rollback');
    expect(driver.getReservationOwner('a')).toBeUndefined();
    expect(driver.getDomain().initialized).toEqual([]);

    await driver.start({
      snapshot: snapshot('owner', ['a', 'b']),
      initialize: async (transaction) => {
        transaction.domain.initialized.push('owner');
      }
    });
    await expect(
      driver.start({ snapshot: snapshot('contender', ['b', 'c']), async initialize() {} })
    ).rejects.toBeInstanceOf(SagaConflictError);
    expect(driver.getReservationOwner('c')).toBeUndefined();
  });
});

describe('createMemorySagaDriver fencing', () => {
  it('rejects stale revisions and execution tokens after takeover', async () => {
    const driver = createMemorySagaDriver({});
    await driver.start({ snapshot: snapshot('saga', ['resource']), async initialize() {} });
    const first = await driver.claimExecution({
      sagaId: 'saga',
      token: 'old-token',
      now,
      staleBefore: new Date(now.getTime() - 1)
    });
    expect(first?.snapshot.executionEpoch).toBe(1);

    const takeoverAt = new Date(now.getTime() + 100);
    const second = await driver.claimExecution({
      sagaId: 'saga',
      token: 'new-token',
      now: takeoverAt,
      staleBefore: takeoverAt
    });
    expect(second?.snapshot.executionEpoch).toBe(2);
    expect(
      await driver.persistStepAttempt({
        sagaId: 'saga',
        executionToken: 'old-token',
        executionEpoch: first!.snapshot.executionEpoch,
        expectedRevision: first!.snapshot.revision,
        now: takeoverAt,
        currentStep: {
          stepId: 'step',
          phase: 'started',
          executeAttempts: 1,
          reconcileAttempts: 0,
          idempotencyKey: 'key',
          startedAt: now,
          takeoverNotBefore: now
        }
      })
    ).toBeNull();
  });

  it('rolls back a domain projection when commitStep fails', async () => {
    const driver = createMemorySagaDriver({ projected: false });
    await driver.start({ snapshot: snapshot('saga', []), async initialize() {} });
    const claim = await driver.claimExecution({
      sagaId: 'saga',
      token: 'token',
      now,
      staleBefore: new Date(now.getTime() - 1)
    });

    await expect(
      driver.commitStep({
        sagaId: 'saga',
        executionToken: 'token',
        executionEpoch: claim!.snapshot.executionEpoch,
        expectedRevision: claim!.snapshot.revision,
        now,
        nextState: { projected: true },
        nextStepIndex: 1,
        stepId: 'step',
        project: async (transaction: MemorySagaTransaction<{ projected: boolean }>) => {
          transaction.domain.projected = true;
          throw new Error('project failed');
        }
      })
    ).rejects.toThrow('project failed');
    expect(driver.getDomain().projected).toBe(false);
    expect((await driver.load('saga'))?.nextStepIndex).toBe(0);
  });
});
