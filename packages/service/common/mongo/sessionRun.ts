import { DbTransactionConflictError } from '@fastgpt/dal/db/errors';
import { createManagedDbSession } from '@fastgpt/dal/db/transaction';
import type { DbDatasource, DbSession } from '@fastgpt/dal/db/types';
import { getLogger, LogCategories } from '../logger';
import { connectionMongo, type ClientSession } from './index';
import {
  afterMongoCommit,
  clearPendingMongoAfterCommit,
  flushMongoAfterCommit,
  registerManagedMongoSession
} from './sessionCommitHook';

const logger = getLogger(LogCategories.INFRA.MONGO);

const timeout = 60000;
const maxConflictRetries = 3;

/**
 * 标记 ACL 增量写入等场景中的并发冲突，供事务入口重新开启事务后重试。
 *
 * 继承自 `@fastgpt/dal/db/errors` 的 `DbTransactionConflictError`，使存量抛错代码同时兼容
 * 旧 `mongoSessionRun` 与新 `runInTransaction` 重试器。
 */
export class MongoTransactionConflictError extends DbTransactionConflictError {
  constructor(cause: unknown) {
    super(cause, 'Mongo transaction write conflict');
    this.name = 'MongoTransactionConflictError';
  }
}

/**
 * 渐进迁移桥接工具：在存量外层仍持有 Mongoose `ClientSession` 时，将其临时包装为 `DbSession`
 * 传入已完成重构的领域 Service / Repository；待全仓切换至 `runInTransaction` 后移除。
 */
export const bridgeClientSessionToDbSession = (
  session?: ClientSession | null,
  datasource: DbDatasource = 'main'
): DbSession | undefined => {
  if (session === null || session === undefined) {
    return undefined;
  }
  return createManagedDbSession({
    dialect: 'mongo',
    datasource,
    nativeTx: session,
    onAfterCommit: (callback) => {
      void afterMongoCommit(session, callback);
    }
  }).session;
};

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
    registerManagedMongoSession(session);

    try {
      const result = await session.withTransaction(
        () => {
          // 驱动因 TransientTransactionError 重跑回调前清空上一轮失败尝试的队列。
          clearPendingMongoAfterCommit(session);
          return fn(session);
        },
        {
          maxCommitTimeMS: timeout,
          ...options
        }
      );
      await flushMongoAfterCommit(session);
      return result;
    } catch (error) {
      clearPendingMongoAfterCommit(session);
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
      clearPendingMongoAfterCommit(session);
      await session.endSession();
    }
  }
};
