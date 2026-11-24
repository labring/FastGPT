import type { ClientSession } from '@fastgpt/service/common/mongo';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import {
  bridgeClientSessionToDbSession,
  MongoTransactionConflictError,
  mongoSessionRun
} from '@fastgpt/service/common/mongo/sessionRun';
import { afterMongoCommit } from '@fastgpt/service/common/mongo/sessionCommitHook';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.unmock(import('@fastgpt/service/common/mongo/sessionRun'));

const createSession = () =>
  ({
    withTransaction: vi.fn(),
    endSession: vi.fn(async () => undefined),
    commitTransaction: vi.fn()
  }) as unknown as ClientSession;

describe('mongoSessionRun', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
          if (
            !(error as { errorLabels?: string[] }).errorLabels?.includes(
              'UnknownTransactionCommitResult'
            )
          ) {
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
});
