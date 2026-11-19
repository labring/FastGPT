import { getLogger, LogCategories } from '../logger';
import type { ClientSession } from './index';

type AfterCommitCallback = () => Promise<void> | void;

const getMongoLogger = () => getLogger(LogCategories?.INFRA?.MONGO ?? LogCategories?.SYSTEM);
const managedMongoSessions = new WeakSet<ClientSession>();
const pendingMongoAfterCommit = new WeakMap<ClientSession, AfterCommitCallback[]>();

const runSafeCallback = async (callback: AfterCommitCallback): Promise<void> => {
  try {
    await callback();
  } catch (error) {
    getMongoLogger()?.error?.('Mongo afterCommit callback failed', { error });
  }
};

/** 标记由 `mongoSessionRun` 托管生命周期的 MongoDB ClientSession。 */
export const registerManagedMongoSession = (session: ClientSession): void => {
  managedMongoSessions.add(session);
};

/** 清空某次失败或即将重试的事务尝试期间暂存的回调队列，避免回滚/重跑后重复执行。 */
export const clearPendingMongoAfterCommit = (session: ClientSession): void => {
  pendingMongoAfterCommit.delete(session);
};

/** 在 `session.withTransaction` 成功提交后按注册顺序执行全部后置副作用。 */
export const flushMongoAfterCommit = async (session: ClientSession): Promise<void> => {
  const callbacks = pendingMongoAfterCommit.get(session);
  if (callbacks === undefined || callbacks.length === 0) {
    return;
  }
  pendingMongoAfterCommit.delete(session);
  for (const callback of callbacks) {
    await runSafeCallback(callback);
  }
};

/**
 * 注册在 MongoDB 事务提交后才执行的副作用回调（如 Redis Pub/Sub 广播、队列唤醒）。
 *
 * 若未传入 `session`，或传入的是测试替身等非 `mongoSessionRun` 托管会话，则立即执行，
 * 保证无事务上下文与单测环境同样可触发通知，且回调异常不会破坏已成功的写操作。
 */
export const afterMongoCommit = async (
  session: ClientSession | null | undefined,
  callback: AfterCommitCallback
): Promise<void> => {
  if (session === null || session === undefined || !managedMongoSessions.has(session)) {
    await runSafeCallback(callback);
    return;
  }

  const queue = pendingMongoAfterCommit.get(session);
  if (queue === undefined) {
    pendingMongoAfterCommit.set(session, [callback]);
    return;
  }
  queue.push(callback);
};
