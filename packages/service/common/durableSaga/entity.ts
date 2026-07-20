import {
  SagaConflictError,
  type DurableSagaSnapshot,
  type SagaCandidate
} from '@fastgpt-sdk/durable-saga';
import type {
  BlockSagaCommand,
  ClaimExecutionCommand,
  CommitStepCommand,
  CompleteSagaCommand,
  DurableSagaStore,
  ExecutionMutationCommand,
  FailSagaCommand,
  FindDueCommand,
  MutationResult,
  PersistStepAttemptCommand,
  ResolveBlockedCommand,
  ScheduleRetryCommand,
  StartSagaCommand
} from '@fastgpt-sdk/durable-saga';
import type { ClientSession, FilterQuery } from 'mongoose';
import { terminalSagaStatuses } from '@fastgpt-sdk/durable-saga';
import { MongoDurableSagaInstance, MongoDurableSagaReservation } from './schema';
import { runDurableSagaTransaction } from './transaction';

class DurableSagaFencedWriteError extends Error {}

const isDuplicateKeyError = (error: unknown): error is { code: number } =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;

const loadSnapshot = async (filter: FilterQuery<DurableSagaSnapshot>, session?: ClientSession) =>
  MongoDurableSagaInstance.findOne(filter)
    .select('-_id')
    .session(session ?? null)
    .lean<DurableSagaSnapshot>();

const replaceSnapshot = async (
  previous: DurableSagaSnapshot,
  snapshot: DurableSagaSnapshot,
  session: ClientSession
) => {
  const result = await MongoDurableSagaInstance.replaceOne(
    {
      sagaId: previous.sagaId,
      revision: previous.revision,
      ...(previous.execution ? { 'execution.token': previous.execution.token } : {}),
      ...(previous.execution ? { 'execution.epoch': previous.execution.epoch } : {})
    },
    { _id: snapshot.sagaId, ...snapshot },
    { session }
  );
  if (result.modifiedCount !== 1) throw new DurableSagaFencedWriteError();
};

const isClaimable = (snapshot: DurableSagaSnapshot, command: ClaimExecutionCommand): boolean => {
  if (snapshot.status === 'blocked' || terminalSagaStatuses.has(snapshot.status)) return false;
  if (snapshot.status === 'pending' || snapshot.status === 'waiting') {
    return !snapshot.nextRunAt || snapshot.nextRunAt <= command.now;
  }
  if (snapshot.status === 'running') {
    return !snapshot.execution || snapshot.execution.heartbeatAt <= command.staleBefore;
  }
  return false;
};

/**
 * Mongo implementation of the authoritative durable Saga store.
 */
export const createMongoDurableSagaStore = (): DurableSagaStore<ClientSession> => {
  const mutateOwned = async (params: {
    command: ExecutionMutationCommand;
    statuses: readonly DurableSagaSnapshot['status'][];
    mutate(snapshot: DurableSagaSnapshot): DurableSagaSnapshot;
    transaction?(session: ClientSession, snapshot: DurableSagaSnapshot): Promise<void>;
  }): Promise<MutationResult | null> => {
    try {
      return await runDurableSagaTransaction(async (session) => {
        const snapshot = await loadSnapshot(
          {
            sagaId: params.command.sagaId,
            revision: params.command.expectedRevision,
            'execution.token': params.command.executionToken,
            'execution.epoch': params.command.executionEpoch,
            status: { $in: params.statuses }
          },
          session
        );
        if (!snapshot) return null;

        const updated = params.mutate(snapshot);
        await params.transaction?.(session, snapshot);
        await replaceSnapshot(snapshot, updated, session);
        return { snapshot: updated };
      });
    } catch (error) {
      if (error instanceof DurableSagaFencedWriteError) return null;
      throw error;
    }
  };

  return {
    async start(command: StartSagaCommand<ClientSession>) {
      try {
        return await runDurableSagaTransaction(async (session) => {
          const existing = await loadSnapshot({ sagaId: command.snapshot.sagaId }, session);
          if (existing) return { snapshot: existing, created: false };

          if (command.snapshot.reservationKeys.length > 0) {
            await MongoDurableSagaReservation.insertMany(
              command.snapshot.reservationKeys.map((key) => ({
                _id: key,
                ownerSagaId: command.snapshot.sagaId
              })),
              { session }
            );
          }
          await command.initialize(session);
          await MongoDurableSagaInstance.create(
            [{ _id: command.snapshot.sagaId, ...command.snapshot }],
            { session }
          );
          return { snapshot: command.snapshot, created: true };
        });
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        const existing = await loadSnapshot({ sagaId: command.snapshot.sagaId });
        if (existing) return { snapshot: existing, created: false };
        const conflict = await MongoDurableSagaReservation.findOne({
          _id: { $in: command.snapshot.reservationKeys }
        })
          .select('_id ownerSagaId')
          .lean<{ _id: string; ownerSagaId: string }>();
        throw new SagaConflictError(
          conflict
            ? `Reservation "${conflict._id}" is owned by another Saga`
            : 'Saga start conflicted with another transaction',
          conflict
        );
      }
    },

    load(sagaId) {
      return loadSnapshot({ sagaId });
    },

    async claimExecution(command: ClaimExecutionCommand) {
      try {
        return await runDurableSagaTransaction(async (session) => {
          const snapshot = await loadSnapshot(
            {
              sagaId: command.sagaId,
              ...(command.expectedRevision === undefined
                ? {}
                : { revision: command.expectedRevision })
            },
            session
          );
          if (!snapshot || !isClaimable(snapshot, command)) return null;

          const executionEpoch = snapshot.executionEpoch + 1;
          const updated: DurableSagaSnapshot = {
            ...snapshot,
            status: 'running',
            executionEpoch,
            execution: {
              token: command.token,
              epoch: executionEpoch,
              heartbeatAt: command.now
            },
            currentStep: snapshot.currentStep
              ? { ...snapshot.currentStep, phase: 'uncertain' }
              : undefined,
            nextRunAt: undefined,
            revision: snapshot.revision + 1,
            updatedAt: command.now
          };
          await replaceSnapshot(snapshot, updated, session);
          return { snapshot: updated };
        });
      } catch (error) {
        if (error instanceof DurableSagaFencedWriteError) return null;
        throw error;
      }
    },

    persistStepAttempt(command: PersistStepAttemptCommand) {
      return mutateOwned({
        command,
        statuses: ['running'],
        mutate: (snapshot) => ({
          ...snapshot,
          currentStep: command.currentStep,
          revision: snapshot.revision + 1,
          updatedAt: command.now
        })
      });
    },

    commitStep(command: CommitStepCommand<ClientSession>) {
      return mutateOwned({
        command,
        statuses: ['running'],
        transaction: (session) => command.project(session),
        mutate: (snapshot) => ({
          ...snapshot,
          state: command.nextState,
          nextStepIndex: command.nextStepIndex,
          currentStep: undefined,
          lastError: undefined,
          revision: snapshot.revision + 1,
          updatedAt: command.now
        })
      });
    },

    scheduleRetry(command: ScheduleRetryCommand) {
      return mutateOwned({
        command,
        statuses: ['running'],
        mutate: (snapshot) => ({
          ...snapshot,
          status: 'waiting',
          currentStep: command.currentStep,
          execution: undefined,
          nextRunAt: command.nextRunAt,
          lastError: command.error,
          revision: snapshot.revision + 1,
          updatedAt: command.now
        })
      });
    },

    yieldExecution(command: ExecutionMutationCommand) {
      return mutateOwned({
        command,
        statuses: ['running'],
        mutate: (snapshot) => {
          if (snapshot.currentStep) throw new DurableSagaFencedWriteError();
          return {
            ...snapshot,
            status: 'pending',
            execution: undefined,
            nextRunAt: command.now,
            revision: snapshot.revision + 1,
            updatedAt: command.now
          };
        }
      });
    },

    block(command: BlockSagaCommand) {
      return mutateOwned({
        command,
        statuses: ['running'],
        mutate: (snapshot) => ({
          ...snapshot,
          status: 'blocked',
          currentStep: command.currentStep,
          execution: undefined,
          nextRunAt: undefined,
          lastError: command.error,
          revision: snapshot.revision + 1,
          updatedAt: command.now
        })
      });
    },

    async heartbeat(command) {
      const result = await MongoDurableSagaInstance.updateOne(
        {
          sagaId: command.sagaId,
          status: 'running',
          'execution.token': command.executionToken,
          'execution.epoch': command.executionEpoch
        },
        {
          $set: {
            'execution.heartbeatAt': command.now,
            updatedAt: command.now
          }
        }
      );
      return result.matchedCount === 1;
    },

    complete(command: CompleteSagaCommand<ClientSession>) {
      return mutateOwned({
        command,
        statuses: ['running'],
        transaction: async (session) => {
          await command.complete(session);
          await MongoDurableSagaReservation.deleteMany(
            { ownerSagaId: command.sagaId },
            { session }
          );
        },
        mutate: (snapshot) => ({
          ...snapshot,
          status: 'completed',
          execution: undefined,
          currentStep: undefined,
          nextRunAt: undefined,
          revision: snapshot.revision + 1,
          updatedAt: command.now,
          completedAt: command.now
        })
      });
    },

    fail(command: FailSagaCommand<ClientSession>) {
      return mutateOwned({
        command,
        statuses: ['running'],
        transaction: async (session) => {
          await command.fail(session);
          await MongoDurableSagaReservation.deleteMany(
            { ownerSagaId: command.sagaId },
            { session }
          );
        },
        mutate: (snapshot) => ({
          ...snapshot,
          status: 'failed',
          execution: undefined,
          currentStep: undefined,
          nextRunAt: undefined,
          lastError: command.error,
          revision: snapshot.revision + 1,
          updatedAt: command.now,
          completedAt: command.now
        })
      });
    },

    async resolveBlocked(command: ResolveBlockedCommand) {
      return runDurableSagaTransaction(async (session) => {
        const snapshot = await loadSnapshot(
          {
            sagaId: command.sagaId,
            status: 'blocked',
            revision: command.expectedRevision
          },
          session
        );
        if (!snapshot) return null;
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
        await replaceSnapshot(snapshot, updated, session);
        return { snapshot: updated };
      });
    },

    async findDue(command: FindDueCommand): Promise<readonly SagaCandidate[]> {
      const snapshots = await MongoDurableSagaInstance.find({
        $or: [
          { status: 'pending', nextRunAt: { $lte: command.now } },
          { status: 'pending', nextRunAt: { $exists: false } },
          { status: 'waiting', nextRunAt: { $lte: command.now } },
          { status: 'running', 'execution.heartbeatAt': { $lte: command.staleBefore } }
        ]
      })
        .sort({ nextRunAt: 1, 'execution.heartbeatAt': 1, sagaId: 1 })
        .limit(command.limit)
        .select('-_id sagaId revision nextRunAt execution.heartbeatAt')
        .lean<
          Array<Pick<DurableSagaSnapshot, 'sagaId' | 'revision' | 'nextRunAt' | 'execution'>>
        >();

      return snapshots.map((snapshot) => ({
        sagaId: snapshot.sagaId,
        revision: snapshot.revision,
        nextRunAt: snapshot.nextRunAt ?? snapshot.execution?.heartbeatAt ?? command.now
      }));
    }
  };
};
