import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const repository = {
    delete: vi.fn(),
    deleteMany: vi.fn(),
    get: vi.fn(),
    listByUser: vi.fn(),
    set: vi.fn()
  };
  return {
    repository,
    createSessionRepository: vi.fn(() => repository)
  };
});

vi.mock('@fastgpt/dal/redis/repositories', () => ({
  createSessionRepository: mocks.createSessionRepository
}));

import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

let authUserSession: typeof import('@fastgpt/service/support/user/session').authUserSession;
let createUserSession: typeof import('@fastgpt/service/support/user/session').createUserSession;
let delUserAllSession: typeof import('@fastgpt/service/support/user/session').delUserAllSession;
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
  serviceEnv = envModule.serviceEnv;
  originalMaxLoginSession = serviceEnv.MAX_LOGIN_SESSION;
});

describe('user session service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSessionRepository.mockReturnValue(mocks.repository);
    mocks.repository.delete.mockResolvedValue(undefined);
    mocks.repository.deleteMany.mockResolvedValue(undefined);
    mocks.repository.get.mockResolvedValue({
      userId: 'user-1',
      teamId: 'team-1',
      tmbId: 'tmb-1',
      isRoot: false,
      createdAt: 1000
    });
    mocks.repository.listByUser.mockResolvedValue([]);
    mocks.repository.set.mockResolvedValue(undefined);
    serviceEnv.MAX_LOGIN_SESSION = originalMaxLoginSession;
  });

  it('returns a typed session and maps a missing session to unauthorized', async () => {
    await expect(authUserSession('user-1:token-1')).resolves.toEqual(
      expect.objectContaining({ userId: 'user-1' })
    );

    mocks.repository.get.mockResolvedValueOnce(undefined);
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
    expect(mocks.repository.set).toHaveBeenCalledWith({
      sessionId,
      data: {
        userId: 'user-1',
        teamId: 'team-1',
        tmbId: 'tmb-1',
        isRoot: false,
        createdAt: expect.any(Number),
        ip: null
      }
    });
    await vi.waitFor(() => expect(mocks.repository.listByUser).toHaveBeenCalledWith('user-1'));
  });

  it('deletes all sessions except explicitly whitelisted session IDs', async () => {
    mocks.repository.listByUser.mockResolvedValue([
      { sessionId: 'user-1:keep', data: {} },
      { sessionId: 'user-1:remove', data: {} }
    ]);

    await delUserAllSession('user-1', ['user-1:keep', undefined]);

    expect(mocks.repository.deleteMany).toHaveBeenCalledWith(['user-1:remove']);
  });

  it('removes the oldest sessions in background when the login limit is exceeded', async () => {
    serviceEnv.MAX_LOGIN_SESSION = 2;
    mocks.repository.listByUser.mockResolvedValue([
      { sessionId: 'user-1:old', data: { createdAt: 1000 } },
      { sessionId: 'user-1:new', data: { createdAt: 3000 } },
      { sessionId: 'user-1:middle', data: { createdAt: 2000 } }
    ]);

    await createUserSession({ userId: 'user-1', teamId: 'team-1', tmbId: 'tmb-1' });

    await vi.waitFor(() =>
      expect(mocks.repository.deleteMany).toHaveBeenCalledWith(['user-1:old'])
    );
  });

  it('propagates session write errors so login fails closed', async () => {
    const error = new Error('session write failed');
    mocks.repository.set.mockRejectedValue(error);

    await expect(
      createUserSession({ userId: 'user-1', teamId: 'team-1', tmbId: 'tmb-1' })
    ).rejects.toBe(error);
  });
});
