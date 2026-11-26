import { DbConfigurationError, DbTransactionConflictError } from '@fastgpt/dal/db/errors';
import { createMongoTransactionRunner, unwrapMongoSession } from '@fastgpt/dal/db/mongo/base';
import { closeDbRuntime, configureDbRuntime } from '@fastgpt/dal/db/runtime';
import { createManagedDbSession, runInTransaction } from '@fastgpt/dal/db/transaction';
import type { DbSession } from '@fastgpt/dal/db/types';
import type { ClientSession } from '@fastgpt/service/common/mongo';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { configureMongoDalRuntime } from '@fastgpt/service/common/mongo/dalRuntime';
import {
  bridgeClientSessionToDbSession,
  bridgeDbSessionToClientSession,
  MongoTransactionConflictError,
  mongoSessionRun
} from '@fastgpt/service/common/mongo/sessionRun';
import { afterMongoCommit } from '@fastgpt/service/common/mongo/sessionCommitHook';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const isErrorWithLabels = (error: unknown): error is { errorLabels: readonly unknown[] } =>
  typeof error === 'object' &&
  error !== null &&
  'errorLabels' in error &&
  Array.isArray(error.errorLabels);

const hasErrorLabel = (error: unknown, label: string): boolean =>
  isErrorWithLabels(error) && error.errorLabels.includes(label);

const createSession = () =>
  ({
    withTransaction: vi.fn(),
    endSession: vi.fn(async () => undefined),
    commitTransaction: vi.fn()
  }) as unknown as ClientSession;

describe('mongoSessionRun', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await closeDbRuntime();
    configureMongoDalRuntime();
  });

  it('does not retry a business error or rerun its callback', async () => {
    const session = createSession();
    const businessError = new Error('business error');
    const handler = vi.fn(async () => Promise.reject(businessError));
    session.withTransaction = vi.fn(async (callback) => callback());
    vi.spyOn(connectionMongo, 'startSession').mockResolvedValue(session);

    await expect(mongoSessionRun(handler)).rejects.toBe(businessError);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(session.withTransaction).toHaveBeenCalledWith(expect.any(Function), {
      maxCommitTimeMS: 60000
    });
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('lets commit retry without rerunning the transaction callback', async () => {
    const session = createSession();
    const handler = vi.fn(async () => 'completed');
    const unknownCommitError = Object.assign(new Error('unknown commit result'), {
      errorLabels: ['UnknownTransactionCommitResult']
    });
    session.commitTransaction = vi
      .fn()
      .mockRejectedValueOnce(unknownCommitError)
      .mockResolvedValueOnce(undefined);
    session.withTransaction = vi.fn(async (callback) => {
      const result = await callback();
      let committed = false;
      while (!committed) {
        try {
          await session.commitTransaction();
          committed = true;
        } catch (error) {
          if (!hasErrorLabel(error, 'UnknownTransactionCommitResult')) {
            throw error;
          }
        }
      }
      return result;
    });
    vi.spyOn(connectionMongo, 'startSession').mockResolvedValue(session);

    await expect(mongoSessionRun(handler)).resolves.toBe('completed');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(session.commitTransaction).toHaveBeenCalledTimes(2);
  });

  it('retries a transaction conflict with a fresh session', async () => {
    const firstSession = createSession();
    const secondSession = createSession();
    firstSession.withTransaction = vi.fn(async (callback) => callback());
    secondSession.withTransaction = vi.fn(async (callback) => callback());
    const handler = vi.fn(async () => {
      if (handler.mock.calls.length === 1) {
        throw new MongoTransactionConflictError(new Error('duplicate key'));
      }
      return 'completed';
    });
    vi.spyOn(connectionMongo, 'startSession')
      .mockResolvedValueOnce(firstSession)
      .mockResolvedValueOnce(secondSession);

    await expect(mongoSessionRun(handler)).resolves.toBe('completed');
    expect(handler).toHaveBeenCalledTimes(2);
    expect(firstSession.endSession).toHaveBeenCalledTimes(1);
    expect(secondSession.endSession).toHaveBeenCalledTimes(1);
  });

  it('executes afterMongoCommit callbacks in order only after commit, and drops retried/aborted queues', async () => {
    const firstSession = createSession();
    const secondSession = createSession();
    const events: string[] = [];

    firstSession.withTransaction = vi.fn(async (callback) => callback());
    secondSession.withTransaction = vi.fn(async (callback) => callback());

    let attempt = 0;
    const handler = vi.fn(async (session: ClientSession) => {
      attempt += 1;
      await afterMongoCommit(session, () => {
        events.push(`attempt-${attempt}`);
      });
      if (attempt === 1) {
        throw new MongoTransactionConflictError(new Error('write conflict'));
      }
      await afterMongoCommit(session, () => {
        events.push('second-hook');
      });
      return 'ok';
    });

    vi.spyOn(connectionMongo, 'startSession')
      .mockResolvedValueOnce(firstSession)
      .mockResolvedValueOnce(secondSession);

    await expect(mongoSessionRun(handler)).resolves.toBe('ok');
    expect(events).toEqual(['attempt-2', 'second-hook']);

    // 业务异常回滚时不触发已注册回调；无 session 时直接触发。
    const rollbackSession = createSession();
    rollbackSession.withTransaction = vi.fn(async (callback) => callback());
    vi.spyOn(connectionMongo, 'startSession').mockResolvedValueOnce(rollbackSession);

    await expect(
      mongoSessionRun(async (session) => {
        await afterMongoCommit(session, () => {
          events.push('should-not-run');
        });
        throw new Error('abort');
      })
    ).rejects.toThrow('abort');
    expect(events).toEqual(['attempt-2', 'second-hook']);

    await afterMongoCommit(undefined, () => {
      events.push('immediate');
    });
    expect(events).toEqual(['attempt-2', 'second-hook', 'immediate']);
  });

  it('bridges ClientSession to DbSession with working tx.afterCommit and rollback isolation', async () => {
    const firstSession = createSession();
    const secondSession = createSession();
    const events: string[] = [];

    firstSession.withTransaction = vi.fn(async (callback) => callback());
    secondSession.withTransaction = vi.fn(async (callback) => callback());

    let attempt = 0;
    vi.spyOn(connectionMongo, 'startSession')
      .mockResolvedValueOnce(firstSession)
      .mockResolvedValueOnce(secondSession);

    await expect(
      mongoSessionRun(async (session) => {
        attempt += 1;
        const tx = bridgeClientSessionToDbSession(session);
        expect(tx?.dialect).toBe('mongo');
        tx?.afterCommit(() => {
          events.push(`bridged-attempt-${attempt}`);
        });
        if (attempt === 1) {
          throw new MongoTransactionConflictError(new Error('retry me'));
        }
        return 'bridged-ok';
      })
    ).resolves.toBe('bridged-ok');
    expect(events).toEqual(['bridged-attempt-2']);

    const rollbackSession = createSession();
    rollbackSession.withTransaction = vi.fn(async (callback) => callback());
    vi.spyOn(connectionMongo, 'startSession').mockResolvedValueOnce(rollbackSession);

    await expect(
      mongoSessionRun(async (session) => {
        const tx = bridgeClientSessionToDbSession(session);
        tx?.afterCommit(() => {
          events.push('bridged-aborted');
        });
        throw new Error('bridged-rollback');
      })
    ).rejects.toThrow('bridged-rollback');
    expect(events).toEqual(['bridged-attempt-2']);
    expect(bridgeClientSessionToDbSession(undefined)).toBeUndefined();
    expect(bridgeClientSessionToDbSession(null)).toBeUndefined();
  });

  it('retries base DbTransactionConflictError (with or without cause) and stops after maxConflictRetries', async () => {
    const sessions = [createSession(), createSession(), createSession()];
    for (const session of sessions) {
      session.withTransaction = vi.fn(async (callback) => callback());
    }
    const events: string[] = [];

    let attempt = 0;
    vi.spyOn(connectionMongo, 'startSession')
      .mockResolvedValueOnce(sessions[0])
      .mockResolvedValueOnce(sessions[1])
      .mockResolvedValueOnce(sessions[2]);

    await expect(
      mongoSessionRun(async (session) => {
        attempt += 1;
        await afterMongoCommit(session, () => {
          events.push(`attempt-${attempt}`);
        });
        if (attempt === 1) {
          throw new DbTransactionConflictError(new Error('dal conflict'));
        }
        if (attempt === 2) {
          throw new DbTransactionConflictError();
        }
        return 'recovered';
      })
    ).resolves.toBe('recovered');

    expect(attempt).toBe(3);
    expect(events).toEqual(['attempt-3']);
    expect(sessions.every((session) => vi.mocked(session.endSession).mock.calls.length === 1)).toBe(
      true
    );

    // 超过最大重试次数（初始 1 次 + 重试 3 次）后原样抛出，且不执行任何 afterCommit 回调。
    const exhaustedSessions = Array.from({ length: 4 }, () => {
      const session = createSession();
      session.withTransaction = vi.fn(async (callback) => callback());
      return session;
    });
    const startSpy = vi.spyOn(connectionMongo, 'startSession');
    for (const session of exhaustedSessions) {
      startSpy.mockResolvedValueOnce(session);
    }

    const terminalConflict = new DbTransactionConflictError(new Error('persistent conflict'));
    let exhaustedAttempts = 0;
    await expect(
      mongoSessionRun(async (session) => {
        exhaustedAttempts += 1;
        await afterMongoCommit(session, () => {
          events.push('exhausted-should-not-run');
        });
        throw terminalConflict;
      })
    ).rejects.toBe(terminalConflict);

    expect(exhaustedAttempts).toBe(4);
    expect(events).toEqual(['attempt-3']);
  });

  it('bridges DbSession back to ClientSession under mongo runInTransaction with unified afterCommit ordering, retry clearing, and rollback isolation', async () => {
    configureMongoDalRuntime({
      transactionRunner: createMongoTransactionRunner({
        getMainClient: () => connectionMongo
      })
    });

    const events: string[] = [];

    // 1. 模拟驱动内 TransientTransactionError 重试（复用同一 ClientSession）：
    // 第 1 轮回调全部丢弃，第 2 轮提交后按 FIFO 执行 tx.afterCommit 与 afterMongoCommit。
    const retriedSession = createSession();
    let driverAttempts = 0;
    retriedSession.withTransaction = vi.fn(async (callback) => {
      try {
        await callback();
      } catch (error) {
        if (!hasErrorLabel(error, 'TransientTransactionError')) {
          throw error;
        }
        await callback();
      }
      events.push('mongo-committed');
    });
    vi.spyOn(connectionMongo, 'startSession').mockResolvedValueOnce(retriedSession);

    const committed = await runInTransaction(async (tx) => {
      driverAttempts += 1;
      const bridgedSession = bridgeDbSessionToClientSession(tx);
      expect(bridgedSession).toBe(retriedSession);

      tx.afterCommit(() => {
        events.push(`tx-before-${driverAttempts}`);
      });
      await afterMongoCommit(bridgedSession, () => {
        events.push(`legacy-middle-${driverAttempts}`);
      });
      tx.afterCommit(() => {
        events.push(`tx-after-${driverAttempts}`);
      });

      // 提交前回调绝不能提前触发。
      expect(events).toEqual([]);

      if (driverAttempts === 1) {
        throw Object.assign(new Error('transient write conflict'), {
          errorLabels: ['TransientTransactionError']
        });
      }
      return 'mixed-ok';
    });

    expect(committed).toBe('mixed-ok');
    expect(driverAttempts).toBe(2);
    expect(events).toEqual(['mongo-committed', 'tx-before-2', 'legacy-middle-2', 'tx-after-2']);

    // 2. 业务异常回滚时，tx.afterCommit 与 afterMongoCommit 均不得触发。
    const rollbackSession = createSession();
    rollbackSession.withTransaction = vi.fn(async (callback) => {
      await callback();
    });
    vi.spyOn(connectionMongo, 'startSession').mockResolvedValueOnce(rollbackSession);

    await expect(
      runInTransaction(async (tx) => {
        const bridgedSession = bridgeDbSessionToClientSession(tx);
        tx.afterCommit(() => {
          events.push('rollback-tx-should-not-run');
        });
        await afterMongoCommit(bridgedSession, () => {
          events.push('rollback-legacy-should-not-run');
        });
        throw new Error('mixed-rollback');
      })
    ).rejects.toThrow('mixed-rollback');

    expect(events).toEqual(['mongo-committed', 'tx-before-2', 'legacy-middle-2', 'tx-after-2']);

    // 3. 外层 DbTransactionConflictError 开启新 session 重试时，旧尝试的回调同样被丢弃。
    const conflictSession1 = createSession();
    const conflictSession2 = createSession();
    conflictSession1.withTransaction = vi.fn(async (callback) => {
      await callback();
    });
    conflictSession2.withTransaction = vi.fn(async (callback) => {
      await callback();
    });
    vi.spyOn(connectionMongo, 'startSession')
      .mockResolvedValueOnce(conflictSession1)
      .mockResolvedValueOnce(conflictSession2);

    const conflictEvents: string[] = [];
    let outerAttempt = 0;
    await expect(
      runInTransaction(async (tx) => {
        outerAttempt += 1;
        const bridgedSession = bridgeDbSessionToClientSession(tx);
        await afterMongoCommit(bridgedSession, () => {
          conflictEvents.push(`outer-legacy-${outerAttempt}`);
        });
        if (outerAttempt === 1) {
          throw new DbTransactionConflictError(new Error('acl conflict'));
        }
        return 'outer-ok';
      })
    ).resolves.toBe('outer-ok');

    expect(conflictEvents).toEqual(['outer-legacy-2']);
  });

  it('fails closed for oceanbase, cross-datasource, or unregistered DbSession, and prevents ping-pong recursion', async () => {
    expect(bridgeDbSessionToClientSession(undefined)).toBeUndefined();
    expect(bridgeDbSessionToClientSession(null)).toBeUndefined();

    // OceanBase 会话必须 fail-closed 抛 DbConfigurationError。
    const obManaged = createManagedDbSession({
      dialect: 'oceanbase',
      datasource: 'main',
      nativeTx: { obTx: true }
    });
    expect(() => bridgeDbSessionToClientSession(obManaged.session)).toThrow(DbConfigurationError);

    // 逻辑 datasource 不匹配必须 fail-closed。
    const mongoLogManaged = createManagedDbSession({
      dialect: 'mongo',
      datasource: 'log',
      nativeTx: createSession()
    });
    expect(() => bridgeDbSessionToClientSession(mongoLogManaged.session, 'main')).toThrow(
      DbConfigurationError
    );
    expect(bridgeDbSessionToClientSession(mongoLogManaged.session, 'log')).toBeDefined();

    // 未注册伪造对象必须 fail-closed。
    const fakeSession = {
      id: 'fake',
      dialect: 'mongo',
      datasource: 'main',
      afterCommit: vi.fn()
    } as unknown as DbSession;
    expect(() => bridgeDbSessionToClientSession(fakeSession)).toThrow(DbConfigurationError);

    // 测试空壳 runner 传入 nativeTx: undefined / null 时安全返回 undefined，不触碰 WeakMap。
    const undefinedNativeTx = createManagedDbSession({
      dialect: 'mongo',
      datasource: 'main',
      nativeTx: undefined
    });
    const nullNativeTx = createManagedDbSession({
      dialect: 'mongo',
      datasource: 'main',
      nativeTx: null
    });
    expect(bridgeDbSessionToClientSession(undefinedNativeTx.session)).toBeUndefined();
    expect(bridgeDbSessionToClientSession(nullNativeTx.session)).toBeUndefined();

    // 双向往返桥接（mongoSessionRun -> DbSession -> ClientSession -> afterMongoCommit）无递归且提交后单次执行。
    const mongoEvents: string[] = [];
    const roundTripMongoSession = createSession();
    roundTripMongoSession.withTransaction = vi.fn(async (callback) => callback());
    vi.spyOn(connectionMongo, 'startSession').mockResolvedValueOnce(roundTripMongoSession);

    await mongoSessionRun(async (session) => {
      const tx = bridgeClientSessionToDbSession(session);
      const unwrapped = bridgeDbSessionToClientSession(tx);
      expect(unwrapped).toBe(session);
      await afterMongoCommit(unwrapped, () => {
        mongoEvents.push('mongo-roundtrip-legacy');
      });
      tx?.afterCommit(() => {
        mongoEvents.push('mongo-roundtrip-tx');
      });
      expect(mongoEvents).toEqual([]);
    });
    expect(mongoEvents).toEqual(['mongo-roundtrip-legacy', 'mongo-roundtrip-tx']);

    // 双向往返桥接（runInTransaction -> ClientSession -> DbSession -> ClientSession -> afterMongoCommit）无递归。
    await closeDbRuntime();
    configureDbRuntime({
      dialect: 'mongo',
      mainWriteUrl: 'mongodb://127.0.0.1:27017/test',
      transactionRunner: createMongoTransactionRunner({
        getMainClient: () => connectionMongo
      })
    });

    const dalEvents: string[] = [];
    const roundTripDalSession = createSession();
    roundTripDalSession.withTransaction = vi.fn(async (callback) => {
      await callback();
    });
    vi.spyOn(connectionMongo, 'startSession').mockResolvedValueOnce(roundTripDalSession);

    await runInTransaction(async (tx1) => {
      const s1 = bridgeDbSessionToClientSession(tx1);
      const tx2 = bridgeClientSessionToDbSession(s1);
      const s2 = bridgeDbSessionToClientSession(tx2);
      expect(tx2).toBe(tx1);
      expect(s1).toBe(roundTripDalSession);
      expect(s2).toBe(roundTripDalSession);
      expect(bridgeClientSessionToDbSession(s1, 'main')).toBe(tx1);
      expect(() => bridgeClientSessionToDbSession(s1, 'log')).toThrow(DbConfigurationError);

      tx2?.afterCommit(() => {
        dalEvents.push('dal-roundtrip-tx2');
      });
      await afterMongoCommit(s2, () => {
        dalEvents.push('dal-roundtrip-legacy');
      });
      expect(dalEvents).toEqual([]);
    });
    expect(dalEvents).toEqual(['dal-roundtrip-tx2', 'dal-roundtrip-legacy']);

    // 共享连接池模式下的 log 事务往返必须保留原始 logical datasource='log'，
    // 不得被默认重标为 'main' 后绕过 DAL 跨数据源隔离，且显式传入不匹配 datasource 必须 fail-closed。
    const logRoundTripEvents: string[] = [];
    const roundTripLogSession = createSession();
    roundTripLogSession.withTransaction = vi.fn(async (callback) => {
      await callback();
    });
    vi.spyOn(connectionMongo, 'startSession').mockResolvedValueOnce(roundTripLogSession);

    await runInTransaction(
      async (logTx) => {
        expect(logTx.datasource).toBe('log');
        expect(() => unwrapMongoSession(logTx, 'main')).toThrow(DbConfigurationError);

        const unwrappedLogSession = bridgeDbSessionToClientSession(logTx, 'log');
        expect(unwrappedLogSession).toBe(roundTripLogSession);

        const rebridgedDefault = bridgeClientSessionToDbSession(unwrappedLogSession);
        expect(rebridgedDefault).toBe(logTx);
        expect(rebridgedDefault?.datasource).toBe('log');
        expect(() => unwrapMongoSession(rebridgedDefault, 'main')).toThrow(DbConfigurationError);
        expect(() => bridgeDbSessionToClientSession(rebridgedDefault, 'main')).toThrow(
          DbConfigurationError
        );
        expect(unwrapMongoSession(rebridgedDefault, 'log')).toBe(roundTripLogSession);

        expect(bridgeClientSessionToDbSession(unwrappedLogSession, 'log')).toBe(logTx);
        expect(() => bridgeClientSessionToDbSession(unwrappedLogSession, 'main')).toThrow(
          DbConfigurationError
        );

        rebridgedDefault?.afterCommit(() => {
          logRoundTripEvents.push('log-roundtrip-tx');
        });
        await afterMongoCommit(unwrappedLogSession, () => {
          logRoundTripEvents.push('log-roundtrip-legacy');
        });
        expect(logRoundTripEvents).toEqual([]);
      },
      { datasource: 'log' }
    );
    expect(logRoundTripEvents).toEqual(['log-roundtrip-tx', 'log-roundtrip-legacy']);
  });
});
