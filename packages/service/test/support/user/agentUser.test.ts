import { serviceEnv } from '@fastgpt/service/env';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { mockUserFind, mockTeamMemberFind } = vi.hoisted(() => ({
  mockUserFind: vi.fn(),
  mockTeamMemberFind: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/schema', () => ({
  MongoUser: { find: mockUserFind }
}));

vi.mock('@fastgpt/service/support/user/team/teamMemberSchema', () => ({
  MongoTeamMember: { find: mockTeamMemberFind }
}));

import {
  getAgentUserTmbIds,
  initializeAgentUserTmbIds
} from '@fastgpt/service/support/user/agentUser';

const mutableServiceEnv = serviceEnv as { AGENT_USERS?: string };
const originalAgentUsers = serviceEnv.AGENT_USERS;

describe('agent user membership cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.agentUserTmbIds = undefined;
  });

  afterEach(() => {
    mutableServiceEnv.AGENT_USERS = originalAgentUsers;
  });

  it('initializes an empty cache without querying MongoDB when no users are configured', async () => {
    mutableServiceEnv.AGENT_USERS = undefined;

    await initializeAgentUserTmbIds();

    expect(getAgentUserTmbIds()).toEqual(new Set());
    expect(mockUserFind).not.toHaveBeenCalled();
    expect(mockTeamMemberFind).not.toHaveBeenCalled();
  });

  it('loads all configured users team member IDs once during initialization', async () => {
    mutableServiceEnv.AGENT_USERS = 'agent-a, agent-b';
    mockUserFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'user-a' }, { _id: 'user-b' }])
    });
    mockTeamMemberFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'tmb-a' }, { _id: 'tmb-b' }])
    });

    await initializeAgentUserTmbIds();

    expect(mockUserFind).toHaveBeenCalledWith({ username: { $in: ['agent-a', 'agent-b'] } }, '_id');
    expect(mockTeamMemberFind).toHaveBeenCalledWith(
      { userId: { $in: ['user-a', 'user-b'] } },
      '_id'
    );
    expect(getAgentUserTmbIds()).toEqual(new Set(['tmb-a', 'tmb-b']));
  });

  it('fails closed if permissions are checked before cache initialization', () => {
    expect(() => getAgentUserTmbIds()).toThrow('Agent user memberships have not been initialized');
  });
});
