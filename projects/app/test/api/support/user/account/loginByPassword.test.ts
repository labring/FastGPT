import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as loginApi from '@/pages/api/support/user/account/loginByPassword';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { authCode } from '@fastgpt/service/support/user/auth/controller';
import { setCookie } from '@fastgpt/service/support/permission/auth/common';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import type { LoginByPasswordBodyType } from '@fastgpt/global/openapi/support/user/account/login/api';
import { Call } from '@test/utils/request';
import { initTeamFreePlan } from '@fastgpt/service/support/wallet/sub/utils';

describe('loginByPassword API', () => {
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

    await initTeamFreePlan({
      teamId: String(testTeam._id)
    });

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

  it('should login successfully with valid credentials', async () => {
    const res = await Call<LoginByPasswordBodyType, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: 'testpassword',
        code: '123456',
        language: 'zh-CN'
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();
    expect(res.data.user).toBeDefined();
    expect(res.data.user.team).toBeDefined();
    expect(res.data.user.team.teamId).toBe(String(testTeam._id));
    expect(res.data.user.team.tmbId).toBe(String(testTmb._id));
    expect(res.data.token).toBeDefined();
    expect(typeof res.data.token).toBe('string');
    expect(res.data.token.length).toBeGreaterThan(0);

    expect(authCode).toHaveBeenCalledWith({
      key: 'testuser',
      code: '123456',
      type: expect.any(String)
    });
    expect(setCookie).toHaveBeenCalled();
    expect(pushTrack.login).toHaveBeenCalledWith({
      type: 'password',
      uid: testUser._id,
      teamId: String(testTeam._id),
      tmbId: String(testTmb._id)
    });
    expect(addAuditLog).toHaveBeenCalled();
  });

  it('should reject login when username is empty', async () => {
    const res = await Call<LoginByPasswordBodyType, {}, any>(loginApi.default, {
      body: {
        username: '',
        password: 'testpassword',
        code: '123456',
        language: 'zh-CN'
      }
    });

    expect(res.code).toBe(500);
  });

  it('should reject login when password is empty', async () => {
    const res = await Call<LoginByPasswordBodyType, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: '',
        code: '123456',
        language: 'zh-CN'
      }
    });

    // Empty password passes zod z.string() but won't match any user record
    expect(res.code).toBe(500);
    expect(res.error).toBe(UserErrEnum.account_psw_error);
  });

  it('should reject login when auth code verification fails', async () => {
    vi.mocked(authCode).mockRejectedValueOnce(new Error('Invalid code'));

    const res = await Call<LoginByPasswordBodyType, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: 'testpassword',
        code: 'wrongcode',
        language: 'zh-CN'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should reject login when user does not exist', async () => {
    const res = await Call<LoginByPasswordBodyType, {}, any>(loginApi.default, {
      body: {
        username: 'nonexistentuser',
        password: 'testpassword',
        code: '123456',
        language: 'zh-CN'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe(UserErrEnum.account_psw_error);
  });

  it('should reject login when user is forbidden', async () => {
    await MongoUser.findByIdAndUpdate(testUser._id, {
      status: UserStatusEnum.forbidden
    });

    const res = await Call<LoginByPasswordBodyType, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: 'testpassword',
        code: '123456',
        language: 'zh-CN'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe('Invalid account!');
  });

  it('should reject login when password is incorrect', async () => {
    const res = await Call<LoginByPasswordBodyType, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: 'wrongpassword',
        code: '123456',
        language: 'zh-CN'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe(UserErrEnum.account_psw_error);
  });

  it('should update language on successful login', async () => {
    const res = await Call<LoginByPasswordBodyType, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: 'testpassword',
        code: '123456',
        language: 'en'
      }
    });

    expect(res.code).toBe(200);

    const updatedUser = await MongoUser.findById(testUser._id);
    expect(updatedUser?.language).toBe('en');
    expect(updatedUser?.lastLoginTmbId).toEqual(testTmb._id);
  });

  it('should handle root user login correctly', async () => {
    const rootUser = await MongoUser.create({
      username: 'root',
      password: 'rootpassword',
      status: UserStatusEnum.active
    });

    const rootTeam = await MongoTeam.create({
      name: 'Root Team',
      ownerId: rootUser._id
    });

    await initTeamFreePlan({
      teamId: String(rootTeam._id)
    });

    const rootTmb = await MongoTeamMember.create({
      teamId: rootTeam._id,
      userId: rootUser._id,
      status: 'active',
      role: 'owner'
    });

    await MongoUser.findByIdAndUpdate(rootUser._id, {
      lastLoginTmbId: rootTmb._id
    });

    const res = await Call<LoginByPasswordBodyType, {}, any>(loginApi.default, {
      body: {
        username: 'root',
        password: 'rootpassword',
        code: '123456',
        language: 'zh-CN'
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.token).toBeDefined();
    expect(typeof res.data.token).toBe('string');
  });

  // ===== Security: NoSQL injection prevention (GHSA-jxvr-h2vx-p73r) =====

  describe('NoSQL injection prevention', () => {
    it('should reject password as object with MongoDB operator ($ne)', async () => {
      // GHSA-jxvr-h2vx-p73r Step 2: password: {"$ne": ""} bypasses password check
      const res = await Call<any, {}, any>(loginApi.default, {
        body: {
          username: 'testuser',
          password: { $ne: '' },
          code: '123456',
          language: 'zh-CN'
        }
      });

      // Zod z.string() must reject object-type password
      expect(res.code).toBe(500);
      expect(res.data?.token).toBeUndefined();
      expect(res.data?.user).toBeUndefined();
    });

    it('should reject password with $regex operator', async () => {
      const res = await Call<any, {}, any>(loginApi.default, {
        body: {
          username: 'testuser',
          password: { $regex: '.*' },
          code: '123456',
          language: 'zh-CN'
        }
      });

      expect(res.code).toBe(500);
    });

    it('should reject password with $where injection', async () => {
      const res = await Call<any, {}, any>(loginApi.default, {
        body: {
          username: 'testuser',
          password: { $where: 'return true' },
          code: '123456',
          language: 'zh-CN'
        }
      });

      expect(res.code).toBe(500);
    });

    it('should reject username as object with MongoDB operator', async () => {
      const res = await Call<any, {}, any>(loginApi.default, {
        body: {
          username: { $ne: '' },
          password: 'testpassword',
          code: '123456',
          language: 'zh-CN'
        }
      });

      expect(res.code).toBe(500);
    });

    it('should reject code as object with MongoDB operator', async () => {
      const res = await Call<any, {}, any>(loginApi.default, {
        body: {
          username: 'testuser',
          password: 'testpassword',
          code: { $regex: '.*' },
          language: 'zh-CN'
        }
      });

      expect(res.code).toBe(500);
    });

    it('should reject all fields as injection objects simultaneously', async () => {
      const res = await Call<any, {}, any>(loginApi.default, {
        body: {
          username: { $ne: '' },
          password: { $ne: '' },
          code: { $ne: '' },
          language: 'zh-CN'
        }
      });

      expect(res.code).toBe(500);
    });

    it('should reject password as non-string types (array, number)', async () => {
      const arrayRes = await Call<any, {}, any>(loginApi.default, {
        body: {
          username: 'testuser',
          password: ['testpassword'],
          code: '123456',
          language: 'zh-CN'
        }
      });
      expect(arrayRes.code).toBe(500);

      const numberRes = await Call<any, {}, any>(loginApi.default, {
        body: {
          username: 'testuser',
          password: 12345,
          code: '123456',
          language: 'zh-CN'
        }
      });
      expect(numberRes.code).toBe(500);
    });
  });
});
