import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as loginApi from '@/pages/api/support/user/account/loginByPassword';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { authCode } from '@fastgpt/service/support/user/auth/controller';
import { createUserSession } from '@fastgpt/service/support/user/session';
import { setCookie } from '@fastgpt/service/support/permission/auth/common';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { Call } from '@test/utils/request';
import type { PostLoginProps } from '@fastgpt/global/support/user/api.d';
import { initTeamFreePlan } from '@fastgpt/service/support/wallet/sub/utils';

describe('loginByPassword API', () => {
  let testUser: any;
  let testTeam: any;
  let testTmb: any;

  beforeEach(async () => {
    // Create test user and team
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

    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('should login successfully with valid credentials', async () => {
    const res = await Call<PostLoginProps, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: 'testpassword',
        code: '123456',
        language: 'zh-CN'
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();
    expect(res.data).toBeDefined();
    expect(res.data.user).toBeDefined();
    expect(res.data.user.team).toBeDefined();
    expect(res.data.token).toBeDefined();
    expect(typeof res.data.token).toBe('string');
    expect(res.data.token.length).toBeGreaterThan(0);

    // Verify authCode was called
    expect(authCode).toHaveBeenCalledWith({
      key: 'testuser',
      code: '123456',
      type: expect.any(String)
    });

    // Verify setCookie was called
    expect(setCookie).toHaveBeenCalled();

    // Verify tracking was called
    expect(pushTrack.login).toHaveBeenCalledWith({
      type: 'password',
      uid: testUser._id,
      teamId: String(testTeam._id),
      tmbId: String(testTmb._id)
    });

    // Verify audit log was called
    expect(addAuditLog).toHaveBeenCalled();
  });

  it('should reject login when username is missing', async () => {
    const res = await Call<PostLoginProps, {}, any>(loginApi.default, {
      body: {
        username: '',
        password: 'testpassword',
        code: '123456'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe(CommonErrEnum.invalidParams);
  });

  it('should reject login when password is missing', async () => {
    const res = await Call<PostLoginProps, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: '',
        code: '123456'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe(CommonErrEnum.invalidParams);
  });

  it('should reject login when code is missing', async () => {
    const res = await Call<PostLoginProps, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: 'testpassword',
        code: ''
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe(CommonErrEnum.invalidParams);
  });

  it('should reject login when auth code verification fails', async () => {
    // Mock authCode to reject
    vi.mocked(authCode).mockRejectedValueOnce(new Error('Invalid code'));

    const res = await Call<PostLoginProps, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: 'testpassword',
        code: 'wrongcode'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should reject login when user does not exist', async () => {
    const res = await Call<PostLoginProps, {}, any>(loginApi.default, {
      body: {
        username: 'nonexistentuser',
        password: 'testpassword',
        code: '123456'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe(UserErrEnum.account_psw_error);
  });

  it('should reject login when user is forbidden', async () => {
    // Update user status to forbidden
    await MongoUser.findByIdAndUpdate(testUser._id, {
      status: UserStatusEnum.forbidden
    });

    const res = await Call<PostLoginProps, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: 'testpassword',
        code: '123456'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe('Invalid account!');
  });

  it('should reject login when password is incorrect', async () => {
    const res = await Call<PostLoginProps, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: 'wrongpassword',
        code: '123456'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBe(UserErrEnum.account_psw_error);
  });

  it('should accept language parameter on successful login', async () => {
    const res = await Call<PostLoginProps, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: 'testpassword',
        code: '123456',
        language: 'en'
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify user was updated with the language
    const updatedUser = await MongoUser.findById(testUser._id);
    expect(updatedUser?.language).toBe('en');
    expect(updatedUser?.lastLoginTmbId).toEqual(testTmb._id);
  });

  it('should handle root user login correctly', async () => {
    // Create root user
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

    const res = await Call<PostLoginProps, {}, any>(loginApi.default, {
      body: {
        username: 'root',
        password: 'rootpassword',
        code: '123456'
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();
    expect(res.data).toBeDefined();
    expect(res.data.token).toBeDefined();
    expect(typeof res.data.token).toBe('string');
  });

  it('should use default language when language is not provided', async () => {
    const res = await Call<PostLoginProps, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: 'testpassword',
        code: '123456'
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify user was updated with the default language 'zh-CN'
    const updatedUser = await MongoUser.findById(testUser._id);
    expect(updatedUser?.language).toBe('zh-CN');
  });

  it('should update lastLoginTmbId on successful login', async () => {
    const updateOneSpy = vi.spyOn(MongoUser, 'updateOne');

    const res = await Call<PostLoginProps, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: 'testpassword',
        code: '123456'
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify user was updated with lastLoginTmbId
    const updatedUser = await MongoUser.findById(testUser._id);
    expect(updatedUser?.lastLoginTmbId).toEqual(testTmb._id);
  });

  it('should verify user authentication flow', async () => {
    const res = await Call<PostLoginProps, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: 'testpassword',
        code: '123456'
      }
    });

    expect(res.code).toBe(200);

    // Verify the full authentication flow
    expect(authCode).toHaveBeenCalled();
    expect(setCookie).toHaveBeenCalled();
    expect(pushTrack.login).toHaveBeenCalled();
    expect(addAuditLog).toHaveBeenCalled();
  });

  it('should return user details with correct structure', async () => {
    const res = await Call<PostLoginProps, {}, any>(loginApi.default, {
      body: {
        username: 'testuser',
        password: 'testpassword',
        code: '123456'
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.user).toBeDefined();
    expect(res.data.user.team).toBeDefined();
    expect(res.data.user.team.teamId).toBe(String(testTeam._id));
    expect(res.data.user.team.tmbId).toBe(String(testTmb._id));
  });
});
