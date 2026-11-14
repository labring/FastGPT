import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';

import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { initTeamFreePlan } from '@fastgpt/service/support/wallet/sub/utils';
import { Call } from '@test/utils/request';

const originalPasswordExpiredMonth = process.env.PASSWORD_EXPIRED_MONTH;
const loadCheckPswExpiredApi = async () => {
  vi.resetModules();
  return import('@/pages/api/support/user/account/password/checkPswExpired');
};

describe('checkPswExpired API', () => {
  let testUser: any;
  let testTeam: any;
  let testTmb: any;

  beforeEach(async () => {
    global.systemInstanceConfig = resolveSystemInstanceConfig({});
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

  it('uses the default never-expire config independently of ENV', async () => {
    vi.stubEnv('PASSWORD_EXPIRED_MONTH', '1');
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

  it('should return false when the config expiration is zero', async () => {
    global.systemInstanceConfig!.auth.passwordExpiredMonth = 0;
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
    global.systemInstanceConfig!.auth.passwordExpiredMonth = 3;
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
    global.systemInstanceConfig!.auth.passwordExpiredMonth = 1;
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

  it('should return true when passwordUpdateTime is not set and config requires expiration', async () => {
    global.systemInstanceConfig!.auth.passwordExpiredMonth = 3;
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

  it('checks expiry only when the Pro SSO policy permits the account password', async () => {
    const oldFeConfigs = global.feConfigs;
    const oldHandler = global.getSsoConfiguredHandler;
    try {
      global.systemInstanceConfig!.auth.passwordExpiredMonth = 1;
      global.feConfigs = { ...global.feConfigs, sso: { disablePasswordForSsoUsers: true } };
      global.getSsoConfiguredHandler = () => true;
      await MongoUser.findByIdAndUpdate(testUser._id, {
        username: 'tenant-user',
        passwordUpdateTime: new Date(0)
      });
      const checkPswExpiredApi = await loadCheckPswExpiredApi();
      const auth = {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: false,
        sessionId: 'session123'
      } as any;

      const restricted = await Call(checkPswExpiredApi.default, { auth });
      expect(restricted.code).toBe(200);
      expect(restricted.data).toBe(false);

      global.getSsoConfiguredHandler = () => false;
      const permitted = await Call(checkPswExpiredApi.default, { auth });
      expect(permitted.code).toBe(200);
      expect(permitted.data).toBe(true);
    } finally {
      global.feConfigs = oldFeConfigs;
      global.getSsoConfiguredHandler = oldHandler;
    }
  });

  it('should return false for root when password expiry is configured', async () => {
    global.systemInstanceConfig!.auth.passwordExpiredMonth = 1;
    const checkPswExpiredApi = await loadCheckPswExpiredApi();

    await MongoUser.findByIdAndUpdate(testUser._id, {
      $unset: { passwordUpdateTime: '' }
    });

    const res = await Call(checkPswExpiredApi.default, {
      auth: {
        userId: String(testUser._id),
        teamId: String(testTeam._id),
        tmbId: String(testTmb._id),
        isRoot: true,
        sessionId: 'session123'
      } as any
    });

    expect(res.code).toBe(200);
    expect(res.data).toBe(false);
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

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['null', null]
  ])('should return false when password is %s', async (_label, password) => {
    global.systemInstanceConfig!.auth.passwordExpiredMonth = 1;
    const checkPswExpiredApi = await loadCheckPswExpiredApi();
    const update =
      password === undefined
        ? { $set: { passwordUpdateTime: new Date(0) }, $unset: { password: 1 } }
        : { $set: { password, passwordUpdateTime: new Date(0) } };
    await MongoUser.collection.updateOne({ _id: testUser._id }, update as any);

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

  it('should reject request without authentication', async () => {
    const checkPswExpiredApi = await loadCheckPswExpiredApi();
    const res = await Call(checkPswExpiredApi.default, {});

    expect(res.code).toBe(500);
  });
});
