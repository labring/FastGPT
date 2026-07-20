import { SagaDefinitionError } from './error';
import type { DurableSagaSnapshot, SagaStatus } from './types';

export const terminalSagaStatuses: ReadonlySet<SagaStatus> = new Set(['completed', 'failed']);

/** Validates persisted invariants before the runtime trusts a driver snapshot. */
export const assertSagaSnapshot = (snapshot: DurableSagaSnapshot): void => {
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) {
    throw new SagaDefinitionError('Saga snapshot revision must be a non-negative integer');
  }
  if (!Number.isSafeInteger(snapshot.nextStepIndex) || snapshot.nextStepIndex < 0) {
    throw new SagaDefinitionError('Saga nextStepIndex must be a non-negative integer');
  }
  if (!Number.isSafeInteger(snapshot.executionEpoch) || snapshot.executionEpoch < 0) {
    throw new SagaDefinitionError('Saga executionEpoch must be a non-negative integer');
  }
  if (new Set(snapshot.reservationKeys).size !== snapshot.reservationKeys.length) {
    throw new SagaDefinitionError('Saga reservationKeys must be unique');
  }
  if (snapshot.status === 'running' && !snapshot.execution) {
    throw new SagaDefinitionError('A running Saga must have execution ownership');
  }
  if (snapshot.status === 'waiting' && !snapshot.nextRunAt) {
    throw new SagaDefinitionError('A waiting Saga must have nextRunAt');
  }
  if (terminalSagaStatuses.has(snapshot.status) && snapshot.execution) {
    throw new SagaDefinitionError('A terminal Saga cannot retain execution ownership');
  }
};

export const calculateRetryDelay = (
  attempt: number,
  policy: {
    initialIntervalMs: number;
    backoffCoefficient?: number;
    maxIntervalMs?: number;
  }
): number => {
  const coefficient = policy.backoffCoefficient ?? 2;
  const delay = policy.initialIntervalMs * Math.pow(coefficient, Math.max(0, attempt - 1));
  return Math.min(delay, policy.maxIntervalMs ?? Number.MAX_SAFE_INTEGER);
};
