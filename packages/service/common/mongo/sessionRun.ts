import { retryFn } from '@fastgpt/global/common/system/utils';
import { addLog } from '../system/log';
import { connectionMongo, type ClientSession } from './index';

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
      } else {
        addLog.warn('Un catch mongo session error', { error });
      }
      return Promise.reject(error);
    } finally {
      await session.endSession();
    }
  });
};
