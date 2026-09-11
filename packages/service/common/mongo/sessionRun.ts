import { getLogger, LogCategories } from '../logger';
import { connectionMongo, type ClientSession } from './index';

const logger = getLogger(LogCategories.INFRA.MONGO);

const timeout = 60000;
const maxConflictRetries = 3;

/** 标记 ACL 增量写入中的并发冲突，供事务入口重新开启事务后重试。 */
export class MongoTransactionConflictError extends Error {
  cause: unknown;

  constructor(cause: unknown) {
    super('Mongo transaction write conflict', { cause });
    this.name = 'MongoTransactionConflictError';
    this.cause = cause;
  }
}

/**
 * 在 Mongo session 中执行事务，并交给 Mongo driver 处理事务级重试。
 *
 * driver 会因 TransientTransactionError 重跑事务回调，并会单独处理
 * UnknownTransactionCommitResult；ACL 写入冲突会用新 session 重试，业务错误保持原样抛出。
 */
export const mongoSessionRun = async <T = unknown>(
  fn: (session: ClientSession) => Promise<T>,
  options?: Parameters<ClientSession['withTransaction']>[1]
) => {
  let conflictRetries = 0;

  while (true) {
    const session = await connectionMongo.startSession();

    try {
      return await session.withTransaction(() => fn(session), {
        maxCommitTimeMS: timeout,
        ...options
      });
    } catch (error) {
      if (error instanceof MongoTransactionConflictError && conflictRetries < maxConflictRetries) {
        conflictRetries += 1;
        logger.warn('MongoDB transaction conflict, retrying transaction', {
          conflictRetries,
          error: error.cause
        });
        continue;
      }

      logger.warn('MongoDB session transaction failed', { error });
      throw error;
    } finally {
      await session.endSession();
    }
  }
};
