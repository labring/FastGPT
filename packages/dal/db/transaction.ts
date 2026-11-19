import { createEntityId } from '@fastgpt/global/common/string/entityId';
import {
  DbConfigurationError,
  DbLogDatasourceNotConfiguredError,
  isDbTransientConflictError
} from './errors';
import { getDbLogger, getDbRuntime } from './runtime';
import {
  getDbDialectFamily,
  type DbDatasource,
  type DbDialect,
  type DbDialectFamily,
  type DbSession
} from './types';

export const DEFAULT_TRANSACTION_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_CONFLICT_RETRIES = 3;

type InternalSessionRecord = {
  dialect: DbDialect;
  family: DbDialectFamily;
  datasource: DbDatasource;
  nativeTx: unknown;
};

/**
 * 私有原生会话映射表。
 *
 * 通过模块私有 WeakMap 隐藏底层 ClientSession / Kysely Transaction，确保业务代码拿到的 DbSession
 * 在运行时也无法枚举或篡改底层驱动句柄，并在会话结束后随 GC 自动回收。
 */
const nativeSessionRegistry = new WeakMap<DbSession, InternalSessionRecord>();

/**
 * 将底层驱动事务句柄包装为对业务层不透明的 `DbSession`（仅供 DAL 适配层和测试桥接使用）。
 */
export const createManagedDbSession = ({
  dialect,
  datasource,
  nativeTx,
  onAfterCommit
}: {
  dialect: DbDialect;
  datasource: DbDatasource;
  nativeTx: unknown;
  onAfterCommit?: (callback: () => Promise<void> | void) => void;
}): {
  session: DbSession;
  resetAfterCommit: () => void;
  flushAfterCommit: () => Promise<void>;
} => {
  const callbacks: Array<() => Promise<void> | void> = [];
  const sessionId = createEntityId();
  const family = getDbDialectFamily(dialect);

  const session = {
    id: sessionId,
    dialect,
    family,
    datasource,
    afterCommit: (callback: () => Promise<void> | void) => {
      if (onAfterCommit !== undefined) {
        onAfterCommit(callback);
        return;
      }
      callbacks.push(callback);
    }
  } as unknown as DbSession;

  nativeSessionRegistry.set(session, { dialect, family, datasource, nativeTx });

  return {
    session,
    resetAfterCommit: () => {
      callbacks.length = 0;
    },
    flushAfterCommit: async () => {
      const logger = getDbLogger();
      const pending = callbacks.splice(0, callbacks.length);
      for (const callback of pending) {
        try {
          await callback();
        } catch (error) {
          // 此时数据库事务已提交成功，afterCommit 副作用异常仅记录高优告警，不中断后续清理回调，也不触发事务重跑
          logger.error('Database transaction afterCommit callback failed', {
            sessionId,
            dialect,
            datasource,
            error
          });
        }
      }
    }
  };
};

/**
 * 在方言基类内部解包底层驱动事务对象；若传入了跨实现族、跨方言或跨数据源的不匹配会话，立即抛配置异常。
 */
export const unwrapNativeDbSession = <TNative = unknown>(
  tx: DbSession | undefined,
  expected?: { dialect?: DbDialect; family?: DbDialectFamily; datasource?: DbDatasource }
): TNative | undefined => {
  if (tx === undefined) {
    return undefined;
  }

  const record = nativeSessionRegistry.get(tx);
  if (record === undefined) {
    throw new DbConfigurationError('Invalid or unregistered DbSession instance');
  }
  if (expected?.family !== undefined && record.family !== expected.family) {
    throw new DbConfigurationError(
      `DbSession family mismatch: expected "${expected.family}", received "${record.family}"`
    );
  }
  if (expected?.dialect !== undefined && record.dialect !== expected.dialect) {
    throw new DbConfigurationError(
      `DbSession dialect mismatch: expected "${expected.dialect}", received "${record.dialect}"`
    );
  }
  if (expected?.datasource !== undefined && record.datasource !== expected.datasource) {
    throw new DbConfigurationError(
      `DbSession datasource mismatch: expected "${expected.datasource}", received "${record.datasource}"`
    );
  }

  return record.nativeTx as TNative;
};

export type RunInTransactionOptions = {
  datasource?: DbDatasource;
  maxConflictRetries?: number;
  timeoutMs?: number;
};

/**
 * 在显式事务上下文中执行数据库编排逻辑。
 *
 * - 当 `datasource === 'log'` 且未配置独立日志库时，直接抛出 `DbLogDatasourceNotConfiguredError`；
 * - 当捕获到 `DbTransactionConflictError` 或驱动层瞬态写冲突/死锁时，自动开启新会话重跑（默认最多重试 3 次），
 *   并在每次重跑前自动清空上一轮未提交的 `afterCommit` 队列；
 * - 事务成功 commit 后，按注册顺序依次执行最终轮次的 `afterCommit` 回调。
 */
export const runInTransaction = async <T>(
  fn: (tx: DbSession) => Promise<T>,
  options: RunInTransactionOptions = {}
): Promise<T> => {
  const {
    datasource = 'main',
    maxConflictRetries = DEFAULT_MAX_CONFLICT_RETRIES,
    timeoutMs = DEFAULT_TRANSACTION_TIMEOUT_MS
  } = options;

  const runtime = getDbRuntime();
  if (datasource === 'log' && !runtime.hasLogDatabase()) {
    throw new DbLogDatasourceNotConfiguredError();
  }

  const runner = runtime.getTransactionRunner();
  const logger = runtime.getLogger();
  let conflictRetries = 0;

  while (true) {
    let flushCommittedCallbacks: (() => Promise<void>) | undefined;

    try {
      const result = await runner({
        datasource,
        timeoutMs,
        execute: async (nativeTx) => {
          const managed = createManagedDbSession({
            dialect: runtime.dialect,
            datasource,
            nativeTx
          });
          // 若底层驱动（如 Mongo withTransaction）内部发生瞬态重试并再次调用 execute，每次都会重置回调队列
          managed.resetAfterCommit();
          const output = await fn(managed.session);
          flushCommittedCallbacks = managed.flushAfterCommit;
          return output;
        }
      });

      await flushCommittedCallbacks?.();
      return result;
    } catch (error) {
      if (isDbTransientConflictError(error) && conflictRetries < maxConflictRetries) {
        conflictRetries += 1;
        logger.warn('Database transaction conflict detected, retrying transaction', {
          dialect: runtime.dialect,
          datasource,
          conflictRetries,
          error
        });
        continue;
      }

      logger.warn('Database transaction failed', {
        dialect: runtime.dialect,
        datasource,
        error
      });
      throw error;
    }
  }
};
