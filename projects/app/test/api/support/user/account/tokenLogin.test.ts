import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as tokenLoginApi from '@/pages/api/support/user/account/tokenLogin';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { initTeamFreePlan } from '@fastgpt/service/support/wallet/sub/utils';
import { Call } from '@test/utils/request';

describe('tokenLogin API', () => {
  let testUser: any;
  let testTeam: any;
  let testTmb: any;

  beforeEach(async () => {
    testUser = await MongoUser.create({
      username: 'testuser',
      password: 'testpassword',
      status: UserStatusEnum.active
    });
    testTeam = await MongoTeam.create({
      name: 'Test Team',
      ownerId: testUser._id
    });
    await initTeamFreePlan({ teamId: String(testTeam._id) });
    testTmb = await MongoTeamMember.create({
      teamId: testTeam._id,
      userId: testUser._id,
      status: 'active',
      role: 'owner'
    });
    await MongoUser.findByIdAndUpdate(testUser._id, {
      lastLoginTmbId: testTmb._id
    });
    vi.clearAllMocks();
  });

  it('should return user detail on valid token', async () => {
    const res = await Call(tokenLoginApi.default, {
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(200);
    expect(res.data).toBeDefined();
    expect(res.data.team).toBeDefined();
    expect(res.data.team.teamId).toBe(String(testTeam._id));
    expect(res.data.team.tmbId).toBe(String(testTmb._id));
  });

  it('should call pushTrack.dailyUserActive', async () => {
    await Call(tokenLoginApi.default, {
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(pushTrack.dailyUserActive).toHaveBeenCalledWith({
      uid: String(testUser._id),
      teamId: String(testTeam._id),
      tmbId: String(testTmb._id)
    });
  });

  it('should mask openaiAccount key but keep baseUrl', async () => {
    await MongoTeamMember.findByIdAndUpdate(testTmb._id, {
      openaiAccount: { key: 'sk-secret-key', baseUrl: 'https://api.openai.com' }
    });

    const res = await Call(tokenLoginApi.default, {
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(200);
    if (res.data.team.openaiAccount) {
      expect(res.data.team.openaiAccount.key).toBe('');
      expect(res.data.team.openaiAccount.baseUrl).toBe('https://api.openai.com');
    }
  });

  it('should mask all values in externalWorkflowVariables', async () => {
    await MongoTeamMember.findByIdAndUpdate(testTmb._id, {
      externalWorkflowVariables: { SECRET: 'top-secret', API_KEY: 'sk-123' }
    });

    const res = await Call(tokenLoginApi.default, {
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(200);
    if (res.data.team.externalWorkflowVariables) {
      Object.values(res.data.team.externalWorkflowVariables).forEach((val) => {
        expect(val).toBe('');
      });
    }
  });

  it('should reject request without authentication', async () => {
    const res = await Call(tokenLoginApi.default, {});

    expect(res.code).toBe(500);
  });
});
