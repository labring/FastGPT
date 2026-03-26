import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as resetExpiredPswApi from '@/pages/api/support/user/account/resetExpiredPsw';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { initTeamFreePlan } from '@fastgpt/service/support/wallet/sub/utils';
import type { ResetExpiredPswBodyType } from '@fastgpt/global/openapi/support/user/account/password/api';
import { Call } from '@test/utils/request';

describe('resetExpiredPsw API', () => {
  let testUser: any;
  let testTeam: any;
  let testTmb: any;
  const originalEnv = process.env.PASSWORD_EXPIRED_MONTH;

  beforeEach(async () => {
    testUser = await MongoUser.create({
      username: 'testuser',
      password: 'oldpassword',
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

  afterEach(() => {
    process.env.PASSWORD_EXPIRED_MONTH = originalEnv;
  });

  it('should successfully reset password when expired', async () => {
    process.env.PASSWORD_EXPIRED_MONTH = '1';

    // Set password update time to 2 months ago (expired)
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    await MongoUser.findByIdAndUpdate(testUser._id, {
      passwordUpdateTime: twoMonthsAgo
    });

    const res = await Call<ResetExpiredPswBodyType, {}, any>(resetExpiredPswApi.default, {
      body: { newPsw: 'newhashedpassword' },
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(200);

    // Verify password was updated
    const updatedUser = await MongoUser.findById(testUser._id).select(
      '+password +passwordUpdateTime'
    );
    expect(updatedUser?.password).toBeDefined();
    expect(updatedUser?.passwordUpdateTime).toBeDefined();
    const newUpdateTime = new Date(updatedUser!.passwordUpdateTime!).getTime();
    expect(newUpdateTime).toBeGreaterThan(twoMonthsAgo.getTime());
  });

  it('should reject when password is not expired (PASSWORD_EXPIRED_MONTH not set)', async () => {
    delete process.env.PASSWORD_EXPIRED_MONTH;

    await MongoUser.findByIdAndUpdate(testUser._id, {
      passwordUpdateTime: new Date()
    });

    const res = await Call<ResetExpiredPswBodyType, {}, any>(resetExpiredPswApi.default, {
      body: { newPsw: 'newhashedpassword' },
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should reject when password is not expired (still within expiry period)', async () => {
    process.env.PASSWORD_EXPIRED_MONTH = '3';

    // Update password just now — not expired
    await MongoUser.findByIdAndUpdate(testUser._id, {
      passwordUpdateTime: new Date()
    });

    const res = await Call<ResetExpiredPswBodyType, {}, any>(resetExpiredPswApi.default, {
      body: { newPsw: 'newhashedpassword' },
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(500);
  });

  it('should reject when newPsw is missing', async () => {
    process.env.PASSWORD_EXPIRED_MONTH = '1';

    const res = await Call<any, {}, any>(resetExpiredPswApi.default, {
      body: {},
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(500);
  });

  it('should reject when user is not found', async () => {
    process.env.PASSWORD_EXPIRED_MONTH = '1';

    const nonExistentId = '000000000000000000000001';

    const res = await Call<ResetExpiredPswBodyType, {}, any>(resetExpiredPswApi.default, {
      body: { newPsw: 'newhashedpassword' },
      auth: {
        userId: nonExistentId,
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe('The password has not expired');
  });

  it('should reject request without authentication', async () => {
    const res = await Call<ResetExpiredPswBodyType, {}, any>(resetExpiredPswApi.default, {
      body: { newPsw: 'newhashedpassword' }
    });

    expect(res.code).toBe(500);
  });

  it('should reject newPsw as non-string (injection guard)', async () => {
    process.env.PASSWORD_EXPIRED_MONTH = '1';

    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    await MongoUser.findByIdAndUpdate(testUser._id, {
      passwordUpdateTime: twoMonthsAgo
    });

    const res = await Call<any, {}, any>(resetExpiredPswApi.default, {
      body: { newPsw: { $ne: '' } },
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(500);
  });
});
