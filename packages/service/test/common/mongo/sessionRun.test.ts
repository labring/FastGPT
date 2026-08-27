import type { ClientSession } from '@fastgpt/service/common/mongo';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import {
  MongoTransactionConflictError,
  mongoSessionRun
} from '@fastgpt/service/common/mongo/sessionRun';
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
});
