import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as updatePasswordApi from '@/pages/api/support/user/account/updatePasswordByOld';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { initTeamFreePlan } from '@fastgpt/service/support/wallet/sub/utils';
import type { UpdatePasswordByOldBodyType } from '@fastgpt/global/openapi/support/user/account/password/api';
import { Call } from '@test/utils/request';

describe('updatePasswordByOld API', () => {
  let testUser: any;
  let testTeam: any;
  let testTmb: any;

  beforeEach(async () => {
    testUser = await MongoUser.create({
      username: 'testuser',
      password: 'oldhashpassword',
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
    vi.clearAllMocks();
  });

  const makeAuth = (user: any, team: any, tmb: any) => ({
    userId: String(user._id),
    teamId: String(team._id),
    tmbId: String(tmb._id),
    isRoot: false,
    sessionId: 'session123'
  });

  it('should update password successfully with correct old password', async () => {
    const res = await Call<UpdatePasswordByOldBodyType, {}, any>(updatePasswordApi.default, {
      body: { oldPsw: 'oldhashpassword', newPsw: 'newhashpassword' },
      auth: makeAuth(testUser, testTeam, testTmb) as any
    });

    expect(res.code).toBe(200);

    const updatedUser = await MongoUser.findById(testUser._id).select('+password');
    expect(updatedUser?.password).toBeDefined();
    expect(updatedUser?.passwordUpdateTime).toBeDefined();
  });

  it('should reject when old password is incorrect', async () => {
    const res = await Call<UpdatePasswordByOldBodyType, {}, any>(updatePasswordApi.default, {
      body: { oldPsw: 'wrongpassword', newPsw: 'newhashpassword' },
      auth: makeAuth(testUser, testTeam, testTmb) as any
    });

    expect(res.code).toBe(500);

    // Password should not change
    const user = await MongoUser.findById(testUser._id).select('+passwordUpdateTime');
    expect(user?.passwordUpdateTime).toBeUndefined(); // we didn't set it initially
  });

  it('should reject when old and new passwords are the same', async () => {
    const res = await Call<UpdatePasswordByOldBodyType, {}, any>(updatePasswordApi.default, {
      body: { oldPsw: 'oldhashpassword', newPsw: 'oldhashpassword' },
      auth: makeAuth(testUser, testTeam, testTmb) as any
    });

    expect(res.code).toBe(500);
  });

  it('should reject when oldPsw is missing', async () => {
    const res = await Call<any, {}, any>(updatePasswordApi.default, {
      body: { newPsw: 'newhashpassword' },
      auth: makeAuth(testUser, testTeam, testTmb) as any
    });

    expect(res.code).toBe(500);
  });

  it('should reject when newPsw is missing', async () => {
    const res = await Call<any, {}, any>(updatePasswordApi.default, {
      body: { oldPsw: 'oldhashpassword' },
      auth: makeAuth(testUser, testTeam, testTmb) as any
    });

    expect(res.code).toBe(500);
  });

  it('should reject request without authentication', async () => {
    const res = await Call<UpdatePasswordByOldBodyType, {}, any>(updatePasswordApi.default, {
      body: { oldPsw: 'oldhashpassword', newPsw: 'newhashpassword' }
    });

    expect(res.code).toBe(500);
  });

  // ===== Security: NoSQL injection prevention (GHSA-jxvr-h2vx-p73r Step 3) =====

  it('should reject oldPsw as MongoDB operator object ($ne injection)', async () => {
    // GHSA-jxvr-h2vx-p73r Step 3: oldPsw: {"$ne": ""} bypasses old password check
    const res = await Call<any, {}, any>(updatePasswordApi.default, {
      body: { oldPsw: { $ne: '' }, newPsw: 'newhashpassword' },
      auth: makeAuth(testUser, testTeam, testTmb) as any
    });

    // Zod z.string() must reject object-type oldPsw
    expect(res.code).toBe(500);

    // Password must NOT be changed
    const user = await MongoUser.findById(testUser._id).select('+passwordUpdateTime');
    expect(user?.passwordUpdateTime).toBeUndefined();
  });

  it('should reject oldPsw with $regex injection', async () => {
    const res = await Call<any, {}, any>(updatePasswordApi.default, {
      body: { oldPsw: { $regex: '.*' }, newPsw: 'newhashpassword' },
      auth: makeAuth(testUser, testTeam, testTmb) as any
    });

    expect(res.code).toBe(500);
  });

  it('should reject newPsw as non-string type', async () => {
    const res = await Call<any, {}, any>(updatePasswordApi.default, {
      body: { oldPsw: 'oldhashpassword', newPsw: { $ne: '' } },
      auth: makeAuth(testUser, testTeam, testTmb) as any
    });

    expect(res.code).toBe(500);
  });
});
