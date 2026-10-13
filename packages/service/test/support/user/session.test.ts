import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEAF_ABSENT_SNAPSHOT } from '@test/utils/instanceConfigSnapshot';

// commit 94ae033d7 起 delRedundantSession 改为 `getSystemInstanceConfig().security.maxLoginSession ?? serviceEnv.MAX_LOGIN_SESSION`：
// 生产快照的叶子字段被 schema 默认值填满，`?? serviceEnv` 兜底分支永不触发。
// 本文件通过改写 serviceEnv 驱动被测行为，因此预置"域对象存在、叶子字段全部缺省"的种子快照，
// 使 getSystemInstanceConfig 首次调用采纳它、读取回落到 serviceEnv，保持原 env 驱动的测试意图。
// beforeAll 里的 vi.resetModules 会清空 controller 的模块级缓存，但 global 上的种子保留，重新导入后仍走兜底。
(global as any).systemInstanceConfig = LEAF_ABSENT_SNAPSHOT();

const mocks = vi.hoisted(() => {
  const cache = {
    delete: vi.fn(),
    deleteMany: vi.fn(),
    get: vi.fn(),
    listByUser: vi.fn(),
    set: vi.fn()
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
      isRoot: false,
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
        createdAt: expect.any(Number),
        ip: null
      }
    });
    await vi.waitFor(() => expect(mocks.cache.listByUser).toHaveBeenCalledWith('user-1'));
  });

  it('preserves an explicit root identity when creating a session for another team', async () => {
    await createUserSession({ userId: 'user-1', teamId: 'team-2', tmbId: 'tmb-2', isRoot: true });

    expect(mocks.cache.set).toHaveBeenCalledWith({
      sessionId: expect.any(String),
      data: expect.objectContaining({ teamId: 'team-2', tmbId: 'tmb-2', isRoot: true })
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

  it('removes the oldest sessions in background when the login limit is exceeded', async () => {
    serviceEnv.MAX_LOGIN_SESSION = 2;
    mocks.cache.listByUser.mockResolvedValue([
      { sessionId: 'user-1:old', data: { createdAt: 1000 } },
      { sessionId: 'user-1:new', data: { createdAt: 3000 } },
      { sessionId: 'user-1:middle', data: { createdAt: 2000 } }
    ]);

    await createUserSession({ userId: 'user-1', teamId: 'team-1', tmbId: 'tmb-1', isRoot: false });

    await vi.waitFor(() => expect(mocks.cache.deleteMany).toHaveBeenCalledWith(['user-1:old']));
  });

  it('propagates session write errors so login fails closed', async () => {
    const error = new Error('session write failed');
    mocks.cache.set.mockRejectedValue(error);

    await expect(
      createUserSession({ userId: 'user-1', teamId: 'team-1', tmbId: 'tmb-1', isRoot: false })
    ).rejects.toBe(error);
  });
});
