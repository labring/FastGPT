import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeHttpResponse } from '@fastgpt/service/types/http';
import { serviceEnv } from '@fastgpt/service/env';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';

const mocks = vi.hoisted(() => ({
  authUserSession: vi.fn(),
  assertCancellation: vi.fn()
}));

const { clearCookie, setCookie } = await vi.importActual<
  typeof import('@fastgpt/service/support/permission/auth/common')
>('@fastgpt/service/support/permission/auth/common');

describe('token auth cancellation access', () => {
  const session = {
    userId: 'user-1',
    teamId: 'team-1',
    tmbId: 'tmb-1',
    isRoot: false,
    createdAt: 1000
  };

  const loadParseHeaderCert = async () => {
    vi.resetModules();
    vi.doMock('@fastgpt/service/support/user/session', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@fastgpt/service/support/user/session')>()),
      authUserSession: mocks.authUserSession
    }));
    vi.doMock('@fastgpt/service/support/user/account/cancellation/guard', () => ({
      assertCancellation: mocks.assertCancellation
    }));
    const authModule = await vi.importActual<
      typeof import('@fastgpt/service/support/permission/auth/common')
    >('@fastgpt/service/support/permission/auth/common');
    return authModule.parseHeaderCert;
  };

  beforeEach(() => {
    mocks.authUserSession.mockReset();
    mocks.assertCancellation.mockReset();
  });

  it('rejects a cancelling Session with a business error by default', async () => {
    mocks.authUserSession.mockResolvedValue(session);
    mocks.assertCancellation.mockRejectedValue(UserErrEnum.accountCancellationPending);
    const parseHeaderCert = await loadParseHeaderCert();

    await expect(
      parseHeaderCert({
        req: { headers: { token: 'user-1:token-1' } } as any,
        authToken: true
      })
    ).rejects.toBe(UserErrEnum.accountCancellationPending);
    expect(mocks.assertCancellation).toHaveBeenCalledWith({
      teamId: 'team-1',
      userId: 'user-1'
    });
  });

  it('skips cancellation validation when the caller opts in', async () => {
    mocks.authUserSession.mockResolvedValue(session);
    mocks.assertCancellation.mockRejectedValue(UserErrEnum.accountCancellationPending);
    const parseHeaderCert = await loadParseHeaderCert();

    await expect(
      parseHeaderCert({
        req: { headers: { token: 'user-1:token-1' } } as any,
        authToken: true,
        allowAccountCancellation: true
      })
    ).resolves.toMatchObject({
      userId: 'user-1',
      teamId: 'team-1',
      tmbId: 'tmb-1',
      sessionId: 'user-1:token-1'
    });
    expect(mocks.assertCancellation).not.toHaveBeenCalled();
  });
});

describe('auth cookie', () => {
  const originalAuthCookieSecure = serviceEnv.AUTH_COOKIE_SECURE;

  afterEach(() => {
    serviceEnv.AUTH_COOKIE_SECURE = originalAuthCookieSecure;
  });

  const createResponse = () =>
    ({
      setHeader: vi.fn()
    }) as unknown as NodeHttpResponse;

  it('默认不添加 Secure 属性以兼容 HTTP 自部署环境', () => {
    serviceEnv.AUTH_COOKIE_SECURE = false;
    const response = createResponse();

    setCookie(response, 'test-token');

    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      'fastgpt_token=test-token; Max-Age=604800; Path=/; HttpOnly; SameSite=Strict'
    );
  });

  it('启用配置后为登录 Cookie 添加 Secure 属性', () => {
    serviceEnv.AUTH_COOKIE_SECURE = true;
    const response = createResponse();

    setCookie(response, 'test-token');

    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      'fastgpt_token=test-token; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Strict'
    );
  });

  it('清理 Cookie 时复用 Secure 配置', () => {
    serviceEnv.AUTH_COOKIE_SECURE = true;
    const response = createResponse();

    clearCookie(response);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      'fastgpt_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict'
    );
  });
});
