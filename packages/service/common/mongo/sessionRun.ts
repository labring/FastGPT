import { retryFn } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../logger';
import { connectionMongo, type ClientSession } from './index';

const logger = getLogger(LogCategories.INFRA.MONGO);

const timeout = 60000;

export const mongoSessionRun = async <T = unknown>(fn: (session: ClientSession) => Promise<T>) => {
  return retryFn(async () => {
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
        logger.warn('MongoDB session transaction aborted', { error });
      } else {
        logger.warn('Unexpected MongoDB session error after commit', { error });
      }
      return Promise.reject(error);
    } finally {
      await session.endSession();
    }
  });
};
