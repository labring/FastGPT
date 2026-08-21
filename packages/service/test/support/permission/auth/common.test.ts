import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NodeHttpResponse } from '@fastgpt/service/types/http';
import { serviceEnv } from '@fastgpt/service/env';

const { clearCookie, setCookie } = await vi.importActual<
  typeof import('@fastgpt/service/support/permission/auth/common')
>('@fastgpt/service/support/permission/auth/common');

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
