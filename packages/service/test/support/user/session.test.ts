import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const cache = {
    delete: vi.fn(),
    deleteMany: vi.fn(),
    get: vi.fn(),
    listByUser: vi.fn(),
    set: vi.fn(),
    updateCancellation: vi.fn()
  };
  return {
    cache,
    SessionCache: class MockSessionCache {
      constructor() {
        return cache;
      }
    }
  };
});

vi.mock('@fastgpt/dal/redis/caches', () => ({
  SessionCache: mocks.SessionCache
}));

import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { AccountCancellationStatus } from '@fastgpt/global/support/user/account/cancellation/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAccountCancellation } from '@fastgpt/service/support/user/account/cancellation/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

let authUserSession: typeof import('@fastgpt/service/support/user/session').authUserSession;
let createUserSession: typeof import('@fastgpt/service/support/user/session').createUserSession;
let delUserAllSession: typeof import('@fastgpt/service/support/user/session').delUserAllSession;
let updateUserSessionCancellation: typeof import('@fastgpt/service/support/user/session').updateUserSessionCancellation;
let serviceEnv: typeof import('@fastgpt/service/env').serviceEnv;
let originalMaxLoginSession: typeof serviceEnv.MAX_LOGIN_SESSION;

beforeAll(async () => {
  // test/setup.ts imports the auth chain before this file, so reset it before loading the service.
  vi.resetModules();
  const sessionModule = await import('@fastgpt/service/support/user/session');
  const envModule = await import('@fastgpt/service/env');
  authUserSession = sessionModule.authUserSession;
  createUserSession = sessionModule.createUserSession;
  delUserAllSession = sessionModule.delUserAllSession;
  updateUserSessionCancellation = sessionModule.updateUserSessionCancellation;
  serviceEnv = envModule.serviceEnv;
  originalMaxLoginSession = serviceEnv.MAX_LOGIN_SESSION;
});

describe('user session service', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await Promise.all([MongoAccountCancellation.deleteMany({}), MongoTeam.deleteMany({})]);
    mocks.cache.delete.mockResolvedValue(undefined);
    mocks.cache.deleteMany.mockResolvedValue(undefined);
    mocks.cache.get.mockResolvedValue({
      userId: 'user-1',
      teamId: 'team-1',
      tmbId: 'tmb-1',
      isRoot: false,
      createdAt: 1000
    });
    mocks.cache.listByUser.mockResolvedValue([]);
    mocks.cache.set.mockResolvedValue(undefined);
    mocks.cache.updateCancellation.mockResolvedValue(undefined);
    serviceEnv.MAX_LOGIN_SESSION = originalMaxLoginSession;
  });

  it('returns a typed session and maps a missing session to unauthorized', async () => {
    await expect(authUserSession('user-1:token-1')).resolves.toEqual(
      expect.objectContaining({ userId: 'user-1' })
    );

    mocks.cache.get.mockResolvedValueOnce(undefined);
    await expect(authUserSession('user-1:missing')).rejects.toBe(ERROR_ENUM.unAuthorization);
  });

  it('creates a session with the historical fields and starts background cleanup', async () => {
    serviceEnv.MAX_LOGIN_SESSION = 2;

    const sessionId = await createUserSession({
      userId: 'user-1',
      teamId: 'team-1',
      tmbId: 'tmb-1',
      ip: null
    });

    expect(sessionId).toMatch(/^user-1:/);
    expect(mocks.cache.set).toHaveBeenCalledWith({
      sessionId,
      data: {
        userId: 'user-1',
        teamId: 'team-1',
        tmbId: 'tmb-1',
        isRoot: false,
        isCancelling: false,
        createdAt: expect.any(Number),
        ip: null
      }
    });
    await vi.waitFor(() => expect(mocks.cache.listByUser).toHaveBeenCalledWith('user-1'));
  });

  it.each([
    ['current user', false],
    ['current team owner', true]
  ])(
    'marks a Session as cancelling for an active %s cancellation',
    async (_, ownerCancellation) => {
      const userId = new Types.ObjectId();
      const ownerId = ownerCancellation ? new Types.ObjectId() : userId;
      const team = await MongoTeam.create({ name: 'Cancelling team', ownerId });
      await MongoAccountCancellation.create({
        userId: ownerCancellation ? ownerId : userId,
        status: AccountCancellationStatus.pending,
        requestedAt: new Date()
      });

      await createUserSession({
        userId: String(userId),
        teamId: String(team._id),
        tmbId: new Types.ObjectId().toString()
      });

      expect(mocks.cache.set).toHaveBeenCalledWith({
        sessionId: expect.stringMatching(new RegExp(`^${userId}:`)),
        data: expect.objectContaining({ isCancelling: true })
      });
    }
  );

  it('uses an explicit cancellation flag without querying MongoDB', async () => {
    const teamFindSpy = vi.spyOn(MongoTeam, 'findById');

    await createUserSession({
      userId: 'user-1',
      teamId: 'team-1',
      tmbId: 'tmb-1',
      isCancelling: true
    });

    expect(teamFindSpy).not.toHaveBeenCalled();
    expect(mocks.cache.set).toHaveBeenCalledWith({
      sessionId: expect.stringMatching(/^user-1:/),
      data: expect.objectContaining({ isCancelling: true })
    });
  });

  it('deletes all sessions except explicitly whitelisted session IDs', async () => {
    mocks.cache.listByUser.mockResolvedValue([
      { sessionId: 'user-1:keep', data: {} },
      { sessionId: 'user-1:remove', data: {} }
    ]);

    await delUserAllSession('user-1', ['user-1:keep', undefined]);

    expect(mocks.cache.deleteMany).toHaveBeenCalledWith(['user-1:remove']);
  });

  it('refreshes the current Session cancellation snapshot', async () => {
    await updateUserSessionCancellation({
      sessionId: 'user-1:token-1',
      isCancelling: false
    });

    expect(mocks.cache.updateCancellation).toHaveBeenCalledWith({
      sessionId: 'user-1:token-1',
      isCancelling: false
    });
  });

  it('removes the oldest sessions in background when the login limit is exceeded', async () => {
    serviceEnv.MAX_LOGIN_SESSION = 2;
    mocks.cache.listByUser.mockResolvedValue([
      { sessionId: 'user-1:old', data: { createdAt: 1000 } },
      { sessionId: 'user-1:new', data: { createdAt: 3000 } },
      { sessionId: 'user-1:middle', data: { createdAt: 2000 } }
    ]);

    await createUserSession({ userId: 'user-1', teamId: 'team-1', tmbId: 'tmb-1' });

    await vi.waitFor(() => expect(mocks.cache.deleteMany).toHaveBeenCalledWith(['user-1:old']));
  });

  it('propagates session write errors so login fails closed', async () => {
    const error = new Error('session write failed');
    mocks.cache.set.mockRejectedValue(error);

    await expect(
      createUserSession({ userId: 'user-1', teamId: 'team-1', tmbId: 'tmb-1' })
    ).rejects.toBe(error);
  });
});
