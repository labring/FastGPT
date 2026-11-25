import type { DbSession } from '@fastgpt/dal/db/types';
import { getLogger, LogCategories } from '../logger';
import type { ClientSession } from './index';

type AfterCommitCallback = () => Promise<void> | void;

const getMongoLogger = () => getLogger(LogCategories?.INFRA?.MONGO ?? LogCategories?.SYSTEM);
const managedMongoSessions = new WeakSet<ClientSession>();
const pendingMongoAfterCommit = new WeakMap<ClientSession, AfterCommitCallback[]>();
const bridgedMongoSessions = new WeakMap<ClientSession, DbSession>();

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

/**
 * 将经 `bridgeDbSessionToClientSession` 解包出的 `ClientSession` 关联回外层 `runInTransaction`
 * 持有的 `DbSession`，使存量调用 `afterMongoCommit(session, cb)` 时统一汇入 `tx.afterCommit`。
 *
 * 已由 `mongoSessionRun` 托管的会话忽略绑定，避免双向桥接往返形成递归。
 */
export const registerBridgedMongoSession = (session: ClientSession, tx: DbSession): void => {
  if (managedMongoSessions.has(session)) {
    return;
  }
  bridgedMongoSessions.set(session, tx);
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
 * - `mongoSessionRun` 托管会话：暂存至当前事务尝试队列，提交后按 FIFO 执行，回滚/重试丢弃；
 * - 经 `bridgeDbSessionToClientSession` 桥接自 `runInTransaction` 的会话：委托至外层 `tx.afterCommit`；
 * - 未传入 `session` 或非托管测试替身：立即执行，保证无事务上下文与单测环境同样可触发通知，
 *   且回调异常不会破坏已成功的写操作。
 */
export const afterMongoCommit = async (
  session: ClientSession | null | undefined,
  callback: AfterCommitCallback
): Promise<void> => {
  if (session === null || session === undefined) {
    await runSafeCallback(callback);
    return;
  }

  if (managedMongoSessions.has(session)) {
    const queue = pendingMongoAfterCommit.get(session);
    if (queue === undefined) {
      pendingMongoAfterCommit.set(session, [callback]);
      return;
    }
    queue.push(callback);
    return;
  }

  const bridgedTx = bridgedMongoSessions.get(session);
  if (bridgedTx !== undefined) {
    bridgedTx.afterCommit(callback);
    return;
  }

  await runSafeCallback(callback);
};
