import type { DurableSagaEngine } from '@fastgpt-sdk/durable-saga';
import type { ClientSession } from '../mongo';
import { getLogger, LogCategories } from '../logger';

const logger = getLogger(LogCategories.INFRA.QUEUE);

export type DurableSagaRecoveryPoller = {
  start(): void;
  stop(): void;
  runOnce(): Promise<number>;
};

/**
 * Periodically scans Mongo for due/stale executions and runs them inline. BullMQ is only the low-latency
 * path; duplicate scans across replicas are harmless because Mongo execution fencing picks one owner.
 */
export const createDurableSagaRecoveryPoller = (params: {
  engine: DurableSagaEngine<ClientSession>;
  intervalMs?: number;
  limit?: number;
  concurrency?: number;
}): DurableSagaRecoveryPoller => {
  const intervalMs = params.intervalMs ?? 60_000;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<number> | undefined;

  const runOnce = () => {
    running ??= params.engine
      .recoverDue({
        limit: params.limit ?? 200,
        concurrency: params.concurrency ?? 20
      })
      .catch((error) => {
        logger.error('Durable Saga Mongo recovery scan failed', { error });
        throw error;
      })
      .finally(() => {
        running = undefined;
      });
    return running;
  };

  return {
    start() {
      if (timer) return;
      void runOnce().catch(() => undefined);
      timer = setInterval(() => {
        void runOnce().catch(() => undefined);
      }, intervalMs);
      timer.unref?.();
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = undefined;
    },
    runOnce
  };
};
