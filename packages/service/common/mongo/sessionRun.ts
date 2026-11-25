import { DbTransactionConflictError } from '@fastgpt/dal/db/errors';
import { unwrapMongoSession } from '@fastgpt/dal/db/mongo/base';
import { createManagedDbSession } from '@fastgpt/dal/db/transaction';
import type { DbDatasource, DbSession } from '@fastgpt/dal/db/types';
import { getLogger, LogCategories } from '../logger';
import { connectionMongo, type ClientSession } from './index';
import {
  afterMongoCommit,
  clearPendingMongoAfterCommit,
  flushMongoAfterCommit,
  registerBridgedMongoSession,
  registerManagedMongoSession
} from './sessionCommitHook';

const logger = getLogger(LogCategories.INFRA.MONGO);

const timeout = 60000;
const maxConflictRetries = 3;

/** 标记由 `bridgeClientSessionToDbSession` 包装出的代理会话，防止反向解包时覆盖外层真实 `DbSession` 绑定。 */
const bridgedWrapperSessions = new WeakSet<DbSession>();

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
  const managedSession = createManagedDbSession({
    dialect: 'mongo',
    datasource,
    nativeTx: session,
    onAfterCommit: (callback) => {
      void afterMongoCommit(session, callback);
    }
  }).session;
  bridgedWrapperSessions.add(managedSession);
  return managedSession;
};

/**
 * 渐进迁移反向桥接工具：在已迁入 `runInTransaction` 的外层持有 `DbSession`、但仍需调用未迁移的
 * 存量 Mongoose 写操作或事务内辅助函数时，将其安全解包为底层 `ClientSession`。
 *
 * 仅允许 `dialect === 'mongo'` 且逻辑 `datasource` 匹配的已注册会话通过；若传入 `oceanbase` 会话、
 * 跨数据源会话或未注册伪造会话，立即抛 `DbConfigurationError`（fail-closed），强制约束同事务链路自底向上迁移。
 */
export const bridgeDbSessionToClientSession = (
  tx?: DbSession | null,
  datasource: DbDatasource = 'main'
): ClientSession | undefined => {
  if (tx === null || tx === undefined) {
    return undefined;
  }
  const session = unwrapMongoSession(tx, datasource);
  if (session === null || session === undefined) {
    return undefined;
  }
  // 仅当 `tx` 来自真实的 `runInTransaction`（而非本模块的包装代理）时才绑定 afterCommit 委托，防止往返递归。
  if (!bridgedWrapperSessions.has(tx)) {
    registerBridgedMongoSession(session, tx);
  }
  return session;
};

/**
 * 在 Mongo session 中执行事务，并交给 Mongo driver 处理事务级重试。
 *
 * driver 会因 TransientTransactionError 重跑事务回调，并会单独处理
 * UnknownTransactionCommitResult；ACL 及已迁移仓储抛出的 `DbTransactionConflictError` 会用新 session 重试，
 * 业务错误保持原样抛出。
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
      if (error instanceof DbTransactionConflictError && conflictRetries < maxConflictRetries) {
        conflictRetries += 1;
        logger.warn('MongoDB transaction conflict, retrying transaction', {
          conflictRetries,
          error: error.cause ?? error
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
