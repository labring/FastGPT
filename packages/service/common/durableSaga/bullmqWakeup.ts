import { createHash } from 'node:crypto';
import type { DurableSagaEngine, SagaRunResult, WakeupScheduler } from '@fastgpt-sdk/durable-saga';
import type { Queue } from 'bullmq';
import { getLogger, LogCategories } from '../logger';
import { getQueue, getWorker, QueueNames } from '../bullmq';
import type { ClientSession } from '../mongo';

const logger = getLogger(LogCategories.INFRA.QUEUE);

type DurableSagaWakeupJob = {
  sagaId: string;
  expectedRevision: number;
};

type DurableSagaWakeupQueue = Pick<Queue<DurableSagaWakeupJob, void, 'wakeup'>, 'add'>;

const createWakeupJobId = (params: { sagaId: string; expectedRevision: number; runAt: Date }) =>
  createHash('sha256')
    .update(`${params.sagaId}\n${params.expectedRevision}\n${params.runAt.toISOString()}`)
    .digest('hex');

/** Creates the BullMQ wake-up adapter; Mongo remains authoritative for status and retry timing. */
export const createBullMQSagaWakeupScheduler = (options?: {
  queue?: DurableSagaWakeupQueue;
  now?: () => Date;
}): WakeupScheduler => {
  const queue = options?.queue ?? getQueue<DurableSagaWakeupJob, void>(QueueNames.durableSaga);
  const now = options?.now ?? (() => new Date());

  return {
    async schedule(params) {
      await queue.add(
        'wakeup',
        { sagaId: params.sagaId, expectedRevision: params.expectedRevision },
        {
          jobId: createWakeupJobId(params),
          delay: Math.max(0, params.runAt.getTime() - now().getTime()),
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          // The same Mongo revision must be schedulable again after a transient worker/lease
          // failure. Retaining a terminal BullMQ job would make its deterministic jobId suppress
          // every polling fallback attempt.
          removeOnComplete: true,
          removeOnFail: true
        }
      );
    }
  };
};

const parseWakeupJob = (value: unknown): DurableSagaWakeupJob => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('sagaId' in value) ||
    typeof value.sagaId !== 'string' ||
    !('expectedRevision' in value) ||
    typeof value.expectedRevision !== 'number' ||
    !Number.isSafeInteger(value.expectedRevision)
  ) {
    throw new TypeError('Invalid durable Saga wake-up job');
  }
  return { sagaId: value.sagaId, expectedRevision: value.expectedRevision };
};

/** Builds a testable BullMQ processor that always revalidates revision and status through the Engine. */
export const createDurableSagaWakeupProcessor =
  (engine: DurableSagaEngine<ClientSession>) =>
  async (job: { data: unknown }): Promise<void> => {
    const data = parseWakeupJob(job.data);
    const result: SagaRunResult = await engine.run(data.sagaId, {
      expectedRevision: data.expectedRevision
    });
    if (result.type === 'definitionUnavailable') {
      logger.error('Durable Saga definition is unavailable for wake-up', {
        sagaId: data.sagaId,
        name: result.snapshot.name,
        version: result.snapshot.version
      });
    }
  };

/** Registers the process-local BullMQ worker used only to wake Mongo-backed Saga executions. */
export const initDurableSagaWorker = (params: {
  engine: DurableSagaEngine<ClientSession>;
  concurrency?: number;
}) =>
  getWorker<DurableSagaWakeupJob>(
    QueueNames.durableSaga,
    createDurableSagaWakeupProcessor(params.engine),
    {
      concurrency: params.concurrency ?? 20,
      lockDuration: 60_000,
      stalledInterval: 15_000,
      maxStalledCount: 3
    }
  );
