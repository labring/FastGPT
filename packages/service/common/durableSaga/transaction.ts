import { connectionMongo, type ClientSession } from '../mongo';

const defaultMaxCommitTimeMs = 30_000;

/**
 * Runs a Saga storage/domain mutation in a Mongo transaction using the driver's label-aware retry logic.
 * The callback may be retried and therefore must only contain transaction-scoped database operations.
 */
export const runDurableSagaTransaction = async <T>(
  run: (session: ClientSession) => Promise<T>,
  options?: { maxCommitTimeMs?: number }
): Promise<T> => {
  const session = await connectionMongo.startSession();
  let result: T | undefined;
  let completed = false;

  try {
    await session.withTransaction(
      async () => {
        result = await run(session);
        completed = true;
      },
      {
        readPreference: 'primary',
        writeConcern: { w: 'majority' },
        readConcern: { level: 'snapshot' },
        maxCommitTimeMS: options?.maxCommitTimeMs ?? defaultMaxCommitTimeMs
      }
    );
    if (!completed) {
      throw new Error('MongoDB ended the durable Saga transaction without running its callback');
    }
    return result as T;
  } finally {
    await session.endSession();
  }
};
