import { createEntityId } from '@fastgpt/global/common/string/entityId';
import {
  DbConfigurationError,
  DbTransactionConflictError,
  DbTransactionOutcomeUnknownError,
  isDbTransactionOutcomeUnknownError,
  isDbTransientConflictError
} from './errors';
import { getDbLogger, getDbRuntime } from './runtime';
import type { DbDatasource, DbDialect, DbSession } from './types';

export const DEFAULT_TRANSACTION_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_CONFLICT_RETRIES = 3;

type InternalSessionRecord = {
  dialect: DbDialect;
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

  const session = {
    id: sessionId,
    dialect,
    datasource,
    afterCommit: (callback: () => Promise<void> | void) => {
      if (onAfterCommit !== undefined) {
        onAfterCommit(callback);
        return;
      }
      callbacks.push(callback);
    }
  } as unknown as DbSession;

  nativeSessionRegistry.set(session, { dialect, datasource, nativeTx });

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
          // 数据库事务已提交成功，afterCommit 异常仅记录高优告警，不中断后续回调也不重跑事务
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
 * 在方言基类内部解包底层驱动事务对象；若传入跨方言或跨数据源的不匹配会话，立即抛配置异常。
 */
export const unwrapNativeDbSession = <TNative = unknown>(
  tx: DbSession | undefined,
  expected?: { dialect?: DbDialect; datasource?: DbDatasource }
): TNative | undefined => {
  if (tx === undefined) {
    return undefined;
  }

  const record = nativeSessionRegistry.get(tx);
  if (record === undefined) {
    throw new DbConfigurationError('Invalid or unregistered DbSession instance');
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
 * - 当 `datasource === 'log'` 且 `logMode === 'shared'`（默认回退复用主库）时，底层复用 `main` 连接池，
 *   但会话逻辑数据源仍标记为 `'log'`，防止业务把 `'main'` 与 `'log'` 仓储误混入同一事务；
 * - 命中 `DbTransactionOutcomeUnknownError`（如 OceanBase 6225 / 4012、Mongo `UnknownTransactionCommitResult`）
 *   时拒绝盲目重试，保留原始 cause 向上抛出；
 * - 命中确定已回滚的并发冲突时自动重跑（默认最多 3 次），并在每次重跑前清空上一轮 `afterCommit` 队列。
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
  const effectiveDatasource = runtime.resolveEffectiveDatasource(datasource);
  const runner = runtime.getTransactionRunner();
  const logger = runtime.getLogger();
  let conflictRetries = 0;

  while (true) {
    let flushCommittedCallbacks: (() => Promise<void>) | undefined;

    try {
      const result = await runner({
        datasource: effectiveDatasource,
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
      if (isDbTransactionOutcomeUnknownError(error)) {
        const outcomeError =
          error instanceof DbTransactionOutcomeUnknownError
            ? error
            : new DbTransactionOutcomeUnknownError(error);
        logger.error('Database transaction outcome is unknown; refusing to retry', {
          dialect: runtime.dialect,
          datasource,
          error: outcomeError
        });
        throw outcomeError;
      }

      // Mongo 驱动内置 `session.withTransaction` 已自带最长 120s 的 TransientTransactionError 重试；
      // 外层在 Mongo 下仅重试业务显式抛出的 `DbTransactionConflictError`（与旧 `mongoSessionRun` 对齐），
      // 避免驱动耗尽后又叠加 3 轮外层重试导致请求被阻塞放大至 4×120s。
      const canRetryOuter =
        runtime.dialect === 'mongo'
          ? error instanceof DbTransactionConflictError
          : isDbTransientConflictError(error);

      if (canRetryOuter && conflictRetries < maxConflictRetries) {
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
