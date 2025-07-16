import { describe, expect, it, vi } from 'vitest';
import * as api from '@/web/support/user/api';
import { UserAuthTypeEnum } from '@fastgpt/global/support/user/auth/constants';
import { hashStr } from '@fastgpt/global/common/string/tools';

vi.mock('@/web/common/api/request', () => ({
  GET: vi.fn(),
  POST: vi.fn(),
  PUT: vi.fn()
}));

describe('user api', () => {
  it('should send auth code', async () => {
    const data = {
      username: 'test@test.com',
      type: UserAuthTypeEnum.register,
      googleToken: 'token123',
      captcha: 'captcha123'
    };
    await api.sendAuthCode(data);
  });

  it('should get token login', async () => {
    await api.getTokenLogin();
  });

  it('should oauth login', async () => {
    const params = {
      platform: 'github',
      code: 'code123',
      state: 'state123'
    };
    await api.oauthLogin(params);
  });

  it('should fast login', async () => {
    const params = {
      token: 'token123'
    };
    await api.postFastLogin(params);
  });

  it('should register user', async () => {
    const data = {
      username: 'test@test.com',
      password: 'password123',
      code: '123456',
      inviterId: 'inviter123',
      bd_vid: 'vid123',
      msclkid: 'click123',
      fastgpt_sem: 'sem123'
    };
    await api.postRegister(data);
  });

  it('should find password', async () => {
    const data = {
      username: 'test@test.com',
      code: '123456',
      password: 'newpassword'
    };
    await api.postFindPassword(data);
  });

  it('should update password by old password', async () => {
    const data = {
      oldPsw: 'oldpassword',
      newPsw: 'newpassword'
    };
    await api.updatePasswordByOld(data);
  });

  it('should reset password', async () => {
    await api.resetPassword('newpassword');
  });

  it('should check password expired', async () => {
    await api.getCheckPswExpired();
  });

  it('should update notification account', async () => {
    const data = {
      account: 'test@test.com',
      verifyCode: '123456'
    };
    await api.updateNotificationAccount(data);
  });

  it('should update contact', async () => {
    const data = {
      contact: 'test@test.com',
      verifyCode: '123456'
    };
    await api.updateContact(data);
  });

  it('should login', async () => {
    const data = {
      username: 'test@test.com',
      password: 'password123'
    };
    await api.postLogin(data);
  });

  it('should logout', async () => {
    await api.loginOut();
  });

  it('should update user info', async () => {
    const data = {
      name: 'Test User',
      avatar: 'avatar.jpg'
    };
    await api.putUserInfo(data);
  });

  it('should get WX login QR', async () => {
    await api.getWXLoginQR();
  });

  it('should get WX login result', async () => {
    const params = {
      code: 'code123'
    };
    await api.getWXLoginResult(params);
  });

  it('should get captcha pic', async () => {
    await api.getCaptchaPic('test@test.com');
  });

  it('should get pre login info', async () => {
    await api.getPreLogin('test@test.com');
  });

  it('should sync members', async () => {
    await api.postSyncMembers();
  });

  it('should search users', async () => {
    await api.GetSearchUserGroupOrg('test', {
      members: true,
      orgs: true,
      groups: true
    });
  });

  it('should export members', async () => {
    await api.ExportMembers();
  });
});
