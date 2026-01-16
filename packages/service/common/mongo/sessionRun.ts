import { getLogger, infra } from '../logger';
import { connectionMongo, type ClientSession } from './index';

const timeout = 60000;
const logger = getLogger(infra.mongo);

export const mongoSessionRun = async <T = unknown>(fn: (session: ClientSession) => Promise<T>) => {
  const session = await connectionMongo.startSession();

  try {
    session.startTransaction({
      maxCommitTimeMS: timeout
    });
    const result = await fn(session);

    await session.commitTransaction();

    return result as T;
  } catch (error) {
    if (!session.transaction.isCommitted) {
      await session.abortTransaction();
    } else {
      logger.warn('Un catch mongo session error', { error });
    }
    return Promise.reject(error);
  } finally {
    await session.endSession();
  }
};
