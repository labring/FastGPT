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

/**
 * 在 Mongo session 中执行事务，并交给 Mongo driver 处理事务级重试。
 *
 * driver 只会因 TransientTransactionError 重跑事务回调，并会单独处理
 * UnknownTransactionCommitResult；业务错误不会触发整个回调重试。
 */
export const mongoSessionRunWithDriverRetry = async <T = unknown>(
  fn: (session: ClientSession) => Promise<T>
) => {
  const session = await connectionMongo.startSession();

  try {
    return await session.withTransaction(() => fn(session), {
      maxCommitTimeMS: timeout
    });
  } catch (error) {
    if (!session.transaction.isCommitted) {
      logger.warn('MongoDB session transaction aborted', { error });
    } else {
      logger.warn('Unexpected MongoDB session error after commit', { error });
    }
    throw error;
  } finally {
    await session.endSession();
  }
};
