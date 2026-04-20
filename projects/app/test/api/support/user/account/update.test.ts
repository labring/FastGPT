import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as updateApi from '@/pages/api/support/user/account/update';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { initTeamFreePlan } from '@fastgpt/service/support/wallet/sub/utils';
import { Call } from '@test/utils/request';

describe('update (user account) API', () => {
  let testUser: any;
  let testTeam: any;
  let testTmb: any;

  beforeEach(async () => {
    testUser = await MongoUser.create({
      username: 'testuser',
      password: 'testpassword',
      status: UserStatusEnum.active,
      language: 'zh-CN',
      timezone: 'Asia/Shanghai'
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
    vi.clearAllMocks();
  });

  const makeAuth = (user: any, team: any, tmb: any) => ({
    userId: String(user._id),
    teamId: String(team._id),
    tmbId: String(tmb._id),
    isRoot: false,
    sessionId: 'session123'
  });

  it('should update language successfully', async () => {
    const res = await Call(updateApi.default, {
      body: { language: 'en' },
      auth: makeAuth(testUser, testTeam, testTmb) as any
    });

    expect(res.code).toBe(200);
    const updatedUser = await MongoUser.findById(testUser._id);
    expect(updatedUser?.language).toBe('en');
  });

  it('should update timezone successfully', async () => {
    const res = await Call(updateApi.default, {
      body: { timezone: 'America/New_York' },
      auth: makeAuth(testUser, testTeam, testTmb) as any
    });

    expect(res.code).toBe(200);
    const updatedUser = await MongoUser.findById(testUser._id);
    expect(updatedUser?.timezone).toBe('America/New_York');
  });

  it('should update both language and timezone simultaneously', async () => {
    const res = await Call(updateApi.default, {
      body: { language: 'zh-Hant', timezone: 'Asia/Tokyo' },
      auth: makeAuth(testUser, testTeam, testTmb) as any
    });

    expect(res.code).toBe(200);
    const updatedUser = await MongoUser.findById(testUser._id);
    expect(updatedUser?.language).toBe('zh-Hant');
    expect(updatedUser?.timezone).toBe('Asia/Tokyo');
  });

  it('should update avatar on team member', async () => {
    const newAvatar = '/avatar/test-avatar.png';

    const res = await Call(updateApi.default, {
      body: { avatar: newAvatar },
      auth: makeAuth(testUser, testTeam, testTmb) as any
    });

    expect(res.code).toBe(200);
    const updatedTmb = await MongoTeamMember.findById(testTmb._id);
    expect(updatedTmb?.avatar).toBe(newAvatar);
  });

  it('should return empty object on success', async () => {
    const res = await Call(updateApi.default, {
      body: { language: 'en' },
      auth: makeAuth(testUser, testTeam, testTmb) as any
    });

    expect(res.code).toBe(200);
    expect(res.data).toEqual({});
  });

  it('should handle empty body without error', async () => {
    const res = await Call(updateApi.default, {
      body: {},
      auth: makeAuth(testUser, testTeam, testTmb) as any
    });

    expect(res.code).toBe(200);
    // Nothing should change
    const updatedUser = await MongoUser.findById(testUser._id);
    expect(updatedUser?.language).toBe('zh-CN');
    expect(updatedUser?.timezone).toBe('Asia/Shanghai');
  });

  it('should reject request without authentication', async () => {
    const res = await Call(updateApi.default, {
      body: { language: 'en' }
    });

    expect(res.code).toBe(500);
  });
});
