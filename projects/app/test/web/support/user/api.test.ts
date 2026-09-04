import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/web/support/user/api';
import { GET, POST } from '@/web/common/api/request';
import { VerificationCodeTypeEnum } from '@fastgpt/global/support/user/account/verification/constants';

vi.mock('@/web/common/api/request', () => ({
  GET: vi.fn(),
  POST: vi.fn(),
  PUT: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('user api', () => {
  it.each([
    [VerificationCodeTypeEnum.register, 'register'],
    [VerificationCodeTypeEnum.findPassword, 'forgetPassword'],
    [VerificationCodeTypeEnum.bindNotification, 'bindNotification']
  ] as const)('should send %s auth code through the shared endpoint', async (type, purpose) => {
    const data = {
      username: 'test@test.com',
      type,
      purpose,
      captcha: 'captcha123',
      lang: 'zh-CN'
    };
    await api.sendAuthCode(data);
    expect(POST).toHaveBeenCalledWith('/proApi/support/user/inform/sendAuthCode', data);
  });

  it('should get token login', async () => {
    await api.getTokenLogin();
  });

  it('should oauth login', async () => {
    await api.oauthLogin({
      type: 'github',
      callbackUrl: 'https://fastgpt.example.com/login/provider',
      props: { code: 'code123' }
    });
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
      bd_vid: 'vid123',
      msclkid: 'click123',
      fastgpt_sem: {
        keyword: 'sem123',
        visitor_id: 'visitor-1',
        sourceDomain: 'https://example.com'
      }
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
    expect(POST).toHaveBeenCalledWith('/proApi/support/user/account/login/wx/getResult', params, {
      maxQuantity: 1
    });
  });

  it('should get captcha pic', async () => {
    await api.getCaptchaPic('test@test.com', 'register');
  });

  it('should get pre login info', async () => {
    await api.getPreLogin('test@test.com');
  });

  it('should sync members', async () => {
    await api.postSyncMembers();
    expect(POST).toHaveBeenCalledWith('/proApi/support/user/team/sync');
  });

  it('should aggregate search members, orgs and groups', async () => {
    await api.getSearchMembersOrgsGroups('test', {
      members: true,
      orgs: true,
      groups: true
    });
    expect(GET).toHaveBeenCalledWith(
      '/proApi/support/user/team/searchMembersOrgsGroups',
      { searchKey: 'test', members: true, orgs: true, groups: true },
      { maxQuantity: 1 }
    );
  });

  it('should export members', async () => {
    await api.ExportMembers();
  });
});
