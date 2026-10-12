import { serviceEnv } from '@fastgpt/service/env';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { RedisLeaseUnavailableError } from '@fastgpt/dal/redis/caches';

const {
  mockUserFindOne,
  mockUserFind,
  mockUserCreate,
  mockTeamMemberFindOne,
  mockTeamMemberFind,
  mockTeamMemberCreate,
  mockCreateDefaultTeam,
  mockWithLease
} = vi.hoisted(() => ({
  mockUserFindOne: vi.fn(),
  mockUserFind: vi.fn(),
  mockUserCreate: vi.fn(),
  mockTeamMemberFindOne: vi.fn(),
  mockTeamMemberFind: vi.fn(),
  mockTeamMemberCreate: vi.fn(),
  mockCreateDefaultTeam: vi.fn(),
  mockWithLease: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/schema', () => ({
  MongoUser: {
    findOne: mockUserFindOne,
    find: mockUserFind,
    create: mockUserCreate
  }
}));

vi.mock('@fastgpt/service/support/user/team/teamMemberSchema', () => ({
  MongoTeamMember: {
    findOne: mockTeamMemberFindOne,
    find: mockTeamMemberFind,
    create: mockTeamMemberCreate
  }
}));

vi.mock('@fastgpt/service/support/user/team/controller', () => ({
  createDefaultTeam: mockCreateDefaultTeam
}));

vi.mock('@fastgpt/dal/redis/caches', async () => {
  const actual = await vi.importActual<typeof import('@fastgpt/dal/redis/caches')>(
    '@fastgpt/dal/redis/caches'
  );
  return {
    ...actual,
    LeaseCache: vi.fn().mockImplementation(function () {
      return { withLease: mockWithLease };
    })
  };
});

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: (fn: (session: any) => Promise<any>) => fn({} as any)
}));

import {
  checkIsAgentUser,
  getAgentUserTmbIds,
  initSystemUser
} from '@fastgpt/service/support/user/systemUser';

const mutableServiceEnv = serviceEnv as {
  AGENT_USERS?: string;
  DEFAULT_AGENT_PSW?: string;
};
const originalAgentUsers = serviceEnv.AGENT_USERS;
const originalAgentPsw = serviceEnv.DEFAULT_AGENT_PSW;

describe('system user initialization and agent user check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.agentUserTmbIds = undefined;

    mockWithLease.mockImplementation(async ({ fn }: any) => fn({} as any));

    mockUserFindOne.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue([{ _id: 'root-id' }]);
    mockTeamMemberFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ teamId: 'root-team-id' })
    });
    mockCreateDefaultTeam.mockResolvedValue({ teamId: 'root-team-id' });
  });

  afterEach(() => {
    mutableServiceEnv.AGENT_USERS = originalAgentUsers;
    mutableServiceEnv.DEFAULT_AGENT_PSW = originalAgentPsw;
  });

  it('fails closed if permissions are checked before initialization', () => {
    expect(() => getAgentUserTmbIds()).toThrow('Agent user memberships have not been initialized');
    expect(() => checkIsAgentUser('tmb-a')).toThrow(
      'Agent user memberships have not been initialized'
    );
  });

  it('initializes root and sets empty agent cache when AGENT_USERS is empty', async () => {
    mutableServiceEnv.AGENT_USERS = undefined;

    await initSystemUser();

    expect(getAgentUserTmbIds()).toEqual(new Set());
    expect(checkIsAgentUser('any-tmb')).toBe(false);
    expect(checkIsAgentUser(undefined)).toBe(false);
    expect(mockWithLease).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'system-user-init',
        ttlMs: 60000,
        renewIntervalMs: 10000
      })
    );
  });

  it('initializes root and agent users, directly updating global cache', async () => {
    mutableServiceEnv.AGENT_USERS = 'agent-a, agent-b';
    mutableServiceEnv.DEFAULT_AGENT_PSW = 'test-psw-123';

    mockUserFind
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue([])
      })
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue([{ _id: 'user-a' }, { _id: 'user-b' }])
      });

    mockUserCreate.mockResolvedValueOnce([{ _id: 'root-id' }]).mockResolvedValueOnce([
      { _id: 'user-a', username: 'agent-a' },
      { _id: 'user-b', username: 'agent-b' }
    ]);

    mockTeamMemberFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'tmb-a' }, { _id: 'tmb-b' }])
    });

    await initSystemUser();

    expect(getAgentUserTmbIds()).toEqual(new Set(['tmb-a', 'tmb-b']));
    expect(checkIsAgentUser('tmb-a')).toBe(true);
    expect(checkIsAgentUser('tmb-b')).toBe(true);
    expect(checkIsAgentUser('tmb-c')).toBe(false);
    expect(checkIsAgentUser(undefined)).toBe(false);
  });

  it('waits for lease release and retries if another node holds the lease', async () => {
    mutableServiceEnv.AGENT_USERS = 'agent-a';
    mutableServiceEnv.DEFAULT_AGENT_PSW = 'test-psw-123';

    mockUserFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ username: 'agent-a' }])
    });
    mockTeamMemberFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'tmb-agent-a' }])
    });

    // 第一次调用 withLease 抛出 RedisLeaseUnavailableError，模拟锁被占用；第二次成功获得租约执行
    mockWithLease
      .mockRejectedValueOnce(
        new RedisLeaseUnavailableError({ key: 'system-user-init', label: 'test' })
      )
      .mockImplementationOnce(async ({ fn }: any) => fn({} as any));

    await initSystemUser();

    expect(getAgentUserTmbIds()).toEqual(new Set(['tmb-agent-a']));
    expect(checkIsAgentUser('tmb-agent-a')).toBe(true);
    expect(mockWithLease).toHaveBeenCalledTimes(2);
  });
});
