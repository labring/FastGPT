import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '@/web/support/user/api';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { GET, POST, PUT } from '@/web/common/api/request';

vi.mock('@/web/common/api/request', () => ({
  GET: vi.fn(),
  POST: vi.fn(),
  PUT: vi.fn()
}));

vi.mock('@fastgpt/global/common/string/tools', () => ({
  hashStr: vi.fn((str) => `hashed_${str}`)
}));

describe('user api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send auth code', async () => {
    const data = {
      username: 'test@test.com',
      type: 'register' as const,
      googleToken: 'token123',
      captcha: 'captcha123'
    };

    await api.sendAuthCode(data);

    expect(POST).toHaveBeenCalledWith('/proApi/support/user/inform/sendAuthCode', data);
  });

  it('should post register', async () => {
    const registerData = {
      username: 'test@test.com',
      password: 'password123',
      code: '123456',
      inviterId: 'inviter123',
      bd_vid: 'bd123',
      msclkid: 'ms123',
      fastgpt_sem: 'sem123'
    };

    await api.postRegister(registerData);

    expect(hashStr).toHaveBeenCalledWith(registerData.password);
    expect(POST).toHaveBeenCalledWith('/proApi/support/user/account/register/emailAndPhone', {
      username: registerData.username,
      code: registerData.code,
      inviterId: registerData.inviterId,
      bd_vid: registerData.bd_vid,
      msclkid: registerData.msclkid,
      fastgpt_sem: registerData.fastgpt_sem,
      password: `hashed_${registerData.password}`
    });
  });

  it('should post login', async () => {
    const loginData = {
      username: 'test@test.com',
      password: 'password123'
    };

    await api.postLogin(loginData);

    expect(hashStr).toHaveBeenCalledWith(loginData.password);
    expect(POST).toHaveBeenCalledWith('/support/user/account/loginByPassword', {
      username: loginData.username,
      password: `hashed_${loginData.password}`
    });
  });

  it('should update password by old password', async () => {
    const data = {
      oldPsw: 'oldPassword',
      newPsw: 'newPassword'
    };

    await api.updatePasswordByOld(data);

    expect(hashStr).toHaveBeenCalledWith(data.oldPsw);
    expect(hashStr).toHaveBeenCalledWith(data.newPsw);
    expect(POST).toHaveBeenCalledWith('/support/user/account/updatePasswordByOld', {
      oldPsw: `hashed_${data.oldPsw}`,
      newPsw: `hashed_${data.newPsw}`
    });
  });

  it('should reset password', async () => {
    const newPassword = 'newPassword123';

    await api.resetPassword(newPassword);

    expect(hashStr).toHaveBeenCalledWith(newPassword);
    expect(POST).toHaveBeenCalledWith('/support/user/account/resetExpiredPsw', {
      newPsw: `hashed_${newPassword}`
    });
  });

  it('should update notification account', async () => {
    const data = {
      account: 'test@test.com',
      verifyCode: '123456'
    };

    await api.updateNotificationAccount(data);

    expect(PUT).toHaveBeenCalledWith('/proApi/support/user/team/updateNotificationAccount', data);
  });

  it('should update contact', async () => {
    const data = {
      contact: 'test@test.com',
      verifyCode: '123456'
    };

    await api.updateContact(data);

    expect(PUT).toHaveBeenCalledWith('/proApi/support/user/account/updateContact', data);
  });

  it('should get WX login QR', async () => {
    await api.getWXLoginQR();
    expect(GET).toHaveBeenCalledWith('/proApi/support/user/account/login/wx/getQR');
  });

  it('should get WX login result', async () => {
    const code = 'wx_code_123';
    await api.getWXLoginResult(code);
    expect(GET).toHaveBeenCalledWith('/proApi/support/user/account/login/wx/getResult', { code });
  });

  it('should get captcha pic', async () => {
    const username = 'test@test.com';
    await api.getCaptchaPic(username);
    expect(GET).toHaveBeenCalledWith('/proApi/support/user/account/captcha/getImgCaptcha', {
      username
    });
  });

  it('should search users', async () => {
    const searchKey = 'test';
    const options = {
      members: true,
      orgs: true,
      groups: true
    };

    await api.GetSearchUserGroupOrg(searchKey, options);
    expect(GET).toHaveBeenCalledWith(
      '/proApi/support/user/search',
      { searchKey, ...options },
      { maxQuantity: 1 }
    );
  });

  it('should export members', async () => {
    await api.ExportMembers();
    expect(GET).toHaveBeenCalledWith('/proApi/support/user/team/member/export');
  });
});
