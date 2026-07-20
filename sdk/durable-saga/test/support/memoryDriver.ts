import { SagaConflictError } from '../../src/core/error';
import { terminalSagaStatuses } from '../../src/core/state';
import type { DurableSagaSnapshot, SagaCandidate } from '../../src/core/types';
import type {
  BlockSagaCommand,
  ClaimExecutionCommand,
  CommitStepCommand,
  CompleteSagaCommand,
  DurableSagaStore,
  FailSagaCommand,
  FindDueCommand,
  MutationResult,
  PersistStepAttemptCommand,
  ResolveBlockedCommand,
  ScheduleRetryCommand,
  StartSagaCommand
} from '../../src/runtime/ports';

export type MemorySagaTransaction<TDomain> = {
  domain: TDomain;
};

export type MemorySagaDriver<TDomain> = DurableSagaStore<MemorySagaTransaction<TDomain>> & {
  getDomain(): TDomain;
  getReservationOwner(key: string): string | undefined;
};

const clone = <T>(value: T): T => structuredClone(value);

const createMutex = () => {
  let tail = Promise.resolve();
  return async <T>(run: () => Promise<T>): Promise<T> => {
    const previous = tail;
    let release = () => {};
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await run();
    } finally {
      release();
    }
  };
};

/**
 * In-memory reference driver with serialized transactions and rollback-capable domain drafts.
 * It intentionally follows the same fencing and reservation contract expected from Mongo.
 */
export const createMemorySagaDriver = <TDomain>(
  initialDomain: TDomain
): MemorySagaDriver<TDomain> => {
  const instances = new Map<string, DurableSagaSnapshot>();
  const reservations = new Map<string, string>();
  const runExclusive = createMutex();
  let domain = clone(initialDomain);

  const getOwned = (params: {
    sagaId: string;
    executionToken: string;
    executionEpoch: number;
    expectedRevision: number;
    statuses?: readonly DurableSagaSnapshot['status'][];
  }) => {
    const snapshot = instances.get(params.sagaId);
    if (
      !snapshot ||
      snapshot.revision !== params.expectedRevision ||
      snapshot.execution?.token !== params.executionToken ||
      snapshot.execution?.epoch !== params.executionEpoch ||
      (params.statuses && !params.statuses.includes(snapshot.status))
    ) {
      return undefined;
    }
    return snapshot;
  };

  const commit = (snapshot: DurableSagaSnapshot): MutationResult => {
    instances.set(snapshot.sagaId, snapshot);
    return { snapshot: clone(snapshot) };
  };

  const releaseReservations = (snapshot: DurableSagaSnapshot) => {
    for (const key of snapshot.reservationKeys) {
      if (reservations.get(key) === snapshot.sagaId) reservations.delete(key);
    }
  };

  const terminalSnapshot = (params: {
    snapshot: DurableSagaSnapshot;
    status: 'completed' | 'failed';
    now: Date;
    error?: DurableSagaSnapshot['lastError'];
  }) =>
    ({
      ...params.snapshot,
      status: params.status,
      execution: undefined,
      currentStep: undefined,
      nextRunAt: undefined,
      revision: params.snapshot.revision + 1,
      updatedAt: params.now,
      completedAt: params.now,
      lastError: params.error
    }) satisfies DurableSagaSnapshot;

  return {
    async start(command: StartSagaCommand<MemorySagaTransaction<TDomain>>) {
      return runExclusive(async () => {
        const existing = instances.get(command.snapshot.sagaId);
        if (existing) return { snapshot: clone(existing), created: false };

        for (const key of command.snapshot.reservationKeys) {
          const ownerSagaId = reservations.get(key);
          if (ownerSagaId) {
            throw new SagaConflictError(`Reservation "${key}" is owned by another Saga`, {
              key,
              ownerSagaId
            });
          }
        }

        const domainDraft = clone(domain);
        await command.initialize({ domain: domainDraft });
        domain = domainDraft;
        const snapshot = clone(command.snapshot);
        instances.set(snapshot.sagaId, snapshot);
        for (const key of snapshot.reservationKeys) reservations.set(key, snapshot.sagaId);
        return { snapshot: clone(snapshot), created: true };
      });
    },

    async load(sagaId) {
      const snapshot = instances.get(sagaId);
      return snapshot ? clone(snapshot) : null;
    },

    async claimExecution(command: ClaimExecutionCommand) {
      return runExclusive(async () => {
        const snapshot = instances.get(command.sagaId);
        if (
          !snapshot ||
          terminalSagaStatuses.has(snapshot.status) ||
          snapshot.status === 'blocked'
        ) {
          return null;
        }
        if (
          command.expectedRevision !== undefined &&
          snapshot.revision !== command.expectedRevision
        ) {
          return null;
        }
        if (
          snapshot.status === 'waiting' &&
          snapshot.nextRunAt &&
          snapshot.nextRunAt > command.now
        ) {
          return null;
        }
        if (snapshot.execution && snapshot.execution.heartbeatAt > command.staleBefore) {
          return null;
        }

        const executionEpoch = snapshot.executionEpoch + 1;
        const claimed: DurableSagaSnapshot = {
          ...snapshot,
          status: 'running',
          executionEpoch,
          execution: {
            token: command.token,
            epoch: executionEpoch,
            heartbeatAt: command.now
          },
          nextRunAt: undefined,
          revision: snapshot.revision + 1,
          updatedAt: command.now
        };
        return commit(claimed);
      });
    },

    async persistStepAttempt(command: PersistStepAttemptCommand) {
      return runExclusive(async () => {
        const snapshot = getOwned({ ...command, statuses: ['running'] });
        if (!snapshot) return null;
        if (snapshot.currentStep && snapshot.currentStep.stepId !== command.currentStep.stepId) {
          return null;
        }
        const updated: DurableSagaSnapshot = {
          ...snapshot,
          currentStep: clone(command.currentStep),
          revision: snapshot.revision + 1,
          updatedAt: command.now
        };
        return commit(updated);
      });
    },

    async commitStep(command: CommitStepCommand<MemorySagaTransaction<TDomain>>) {
      return runExclusive(async () => {
        const snapshot = getOwned({ ...command, statuses: ['running'] });
        if (!snapshot) return null;
        const domainDraft = clone(domain);
        await command.project({ domain: domainDraft });
        domain = domainDraft;
        const updated: DurableSagaSnapshot = {
          ...snapshot,
          state: clone(command.nextState),
          nextStepIndex: command.nextStepIndex,
          currentStep: undefined,
          lastError: undefined,
          revision: snapshot.revision + 1,
          updatedAt: command.now
        };
        return commit(updated);
      });
    },

    async scheduleRetry(command: ScheduleRetryCommand) {
      return runExclusive(async () => {
        const snapshot = getOwned({ ...command, statuses: ['running'] });
        if (!snapshot) return null;
        const updated: DurableSagaSnapshot = {
          ...snapshot,
          status: 'waiting',
          currentStep: clone(command.currentStep),
          execution: undefined,
          nextRunAt: command.nextRunAt,
          lastError: command.error,
          revision: snapshot.revision + 1,
          updatedAt: command.now
        };
        return commit(updated);
      });
    },

    async yieldExecution(command) {
      return runExclusive(async () => {
        const snapshot = getOwned({ ...command, statuses: ['running'] });
        if (!snapshot || snapshot.currentStep) return null;
        const updated: DurableSagaSnapshot = {
          ...snapshot,
          status: 'pending',
          execution: undefined,
          nextRunAt: command.now,
          revision: snapshot.revision + 1,
          updatedAt: command.now
        };
        return commit(updated);
      });
    },

    async block(command: BlockSagaCommand) {
      return runExclusive(async () => {
        const snapshot = getOwned({ ...command, statuses: ['running'] });
        if (!snapshot) return null;
        const updated: DurableSagaSnapshot = {
          ...snapshot,
          status: 'blocked',
          currentStep: command.currentStep ? clone(command.currentStep) : undefined,
          execution: undefined,
          nextRunAt: undefined,
          lastError: command.error,
          revision: snapshot.revision + 1,
          updatedAt: command.now
        };
        return commit(updated);
      });
    },

    async heartbeat(command) {
      return runExclusive(async () => {
        const snapshot = instances.get(command.sagaId);
        if (
          snapshot?.status !== 'running' ||
          snapshot.execution?.token !== command.executionToken ||
          snapshot.execution?.epoch !== command.executionEpoch
        ) {
          return false;
        }
        instances.set(command.sagaId, {
          ...snapshot,
          execution: { ...snapshot.execution, heartbeatAt: command.now },
          updatedAt: command.now
        });
        return true;
      });
    },

    async complete(command: CompleteSagaCommand<MemorySagaTransaction<TDomain>>) {
      return runExclusive(async () => {
        const snapshot = getOwned({ ...command, statuses: ['running'] });
        if (!snapshot) return null;
        const domainDraft = clone(domain);
        await command.complete({ domain: domainDraft });
        domain = domainDraft;
        const updated = terminalSnapshot({
          snapshot,
          status: 'completed',
          now: command.now
        });
        releaseReservations(updated);
        return commit(updated);
      });
    },

    async fail(command: FailSagaCommand<MemorySagaTransaction<TDomain>>) {
      return runExclusive(async () => {
        const snapshot = getOwned({ ...command, statuses: ['running'] });
        if (!snapshot) return null;
        const domainDraft = clone(domain);
        await command.fail({ domain: domainDraft });
        domain = domainDraft;
        const updated = terminalSnapshot({
          snapshot,
          status: 'failed',
          now: command.now,
          error: command.error
        });
        releaseReservations(updated);
        return commit(updated);
      });
    },

    async resolveBlocked(command: ResolveBlockedCommand) {
      return runExclusive(async () => {
        const snapshot = instances.get(command.sagaId);
        if (
          !snapshot ||
          snapshot.status !== 'blocked' ||
          snapshot.revision !== command.expectedRevision
        )
          return null;
        const updated: DurableSagaSnapshot = {
          ...snapshot,
          status: 'pending',
          currentStep: command.clearCurrentStep ? undefined : snapshot.currentStep,
          execution: undefined,
          nextRunAt: command.now,
          lastError: undefined,
          revision: snapshot.revision + 1,
          updatedAt: command.now
        };
        return commit(updated);
      });
    },

    async findDue(command: FindDueCommand): Promise<readonly SagaCandidate[]> {
      return [...instances.values()]
        .filter((snapshot) => {
          if (snapshot.status === 'pending')
            return (snapshot.nextRunAt ?? snapshot.createdAt) <= command.now;
          if (snapshot.status === 'waiting')
            return Boolean(snapshot.nextRunAt && snapshot.nextRunAt <= command.now);
          if (snapshot.status === 'running') {
            return Boolean(
              snapshot.execution && snapshot.execution.heartbeatAt <= command.staleBefore
            );
          }
          return false;
        })
        .sort((left, right) => {
          const leftAt = left.nextRunAt ?? left.execution?.heartbeatAt ?? left.createdAt;
          const rightAt = right.nextRunAt ?? right.execution?.heartbeatAt ?? right.createdAt;
          return leftAt.getTime() - rightAt.getTime() || left.sagaId.localeCompare(right.sagaId);
        })
        .slice(0, command.limit)
        .map((snapshot) => ({
          sagaId: snapshot.sagaId,
          revision: snapshot.revision,
          nextRunAt: snapshot.nextRunAt ?? command.now
        }));
    },

    getDomain: () => clone(domain),
    getReservationOwner: (key) => reservations.get(key)
  };
};
