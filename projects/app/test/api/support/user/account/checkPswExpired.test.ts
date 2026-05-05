import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { initTeamFreePlan } from '@fastgpt/service/support/wallet/sub/utils';
import { Call } from '@test/utils/request';

const originalPasswordExpiredMonth = process.env.PASSWORD_EXPIRED_MONTH;
const loadCheckPswExpiredApi = async () => {
  vi.resetModules();
  return import('@/pages/api/support/user/account/checkPswExpired');
};

describe('checkPswExpired API', () => {
  let testUser: any;
  let testTeam: any;
  let testTmb: any;

  beforeEach(async () => {
    testUser = await MongoUser.create({
      username: 'testuser',
      password: 'testpassword',
      status: UserStatusEnum.active,
      passwordUpdateTime: new Date()
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
    vi.stubEnv('PASSWORD_EXPIRED_MONTH', originalPasswordExpiredMonth);
  });

  it('should return false when PASSWORD_EXPIRED_MONTH is not set', async () => {
    vi.stubEnv('PASSWORD_EXPIRED_MONTH', undefined);
    const checkPswExpiredApi = await loadCheckPswExpiredApi();

    const res = await Call(checkPswExpiredApi.default, {
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(200);
    expect(res.data).toBe(false);
  });

  it('should return false when PASSWORD_EXPIRED_MONTH=0', async () => {
    vi.stubEnv('PASSWORD_EXPIRED_MONTH', '0');
    const checkPswExpiredApi = await loadCheckPswExpiredApi();

    const res = await Call(checkPswExpiredApi.default, {
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(200);
    expect(res.data).toBe(false);
  });

  it('should return false when password was updated recently', async () => {
    vi.stubEnv('PASSWORD_EXPIRED_MONTH', '3');
    const checkPswExpiredApi = await loadCheckPswExpiredApi();

    // Update password time to now
    await MongoUser.findByIdAndUpdate(testUser._id, {
      passwordUpdateTime: new Date()
    });

    const res = await Call(checkPswExpiredApi.default, {
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(200);
    expect(res.data).toBe(false);
  });

  it('should return true when password has expired (update time older than expiry period)', async () => {
    vi.stubEnv('PASSWORD_EXPIRED_MONTH', '1');
    const checkPswExpiredApi = await loadCheckPswExpiredApi();

    // Set password update time to 2 months ago
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    await MongoUser.findByIdAndUpdate(testUser._id, {
      passwordUpdateTime: twoMonthsAgo
    });

    const res = await Call(checkPswExpiredApi.default, {
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(200);
    expect(res.data).toBe(true);
  });

  it('should return true when passwordUpdateTime is not set and env is configured', async () => {
    vi.stubEnv('PASSWORD_EXPIRED_MONTH', '3');
    const checkPswExpiredApi = await loadCheckPswExpiredApi();

    // Remove passwordUpdateTime
    await MongoUser.findByIdAndUpdate(testUser._id, {
      $unset: { passwordUpdateTime: '' }
    });

    const res = await Call(checkPswExpiredApi.default, {
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(200);
    expect(res.data).toBe(true);
  });

  it('should return false when user is not found', async () => {
    const nonExistentId = '000000000000000000000001';
    const checkPswExpiredApi = await loadCheckPswExpiredApi();

    const res = await Call(checkPswExpiredApi.default, {
      auth: {
        userId: nonExistentId,
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(200);
    expect(res.data).toBe(false);
  });

  it('should reject request without authentication', async () => {
    const checkPswExpiredApi = await loadCheckPswExpiredApi();
    const res = await Call(checkPswExpiredApi.default, {});

    expect(res.code).toBe(500);
  });
});
