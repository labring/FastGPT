import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { maxHeaderSize } from 'node:http';
import type { NodeHttpRequest, NodeHttpResponse } from '@fastgpt/service/types/http';
import { SESSION_API_PATH } from '@fastgpt/global/support/user/session/constants';
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
    sessionId: 'user-1:token-1',
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
      sessionId: 'user-1:token-1',
      sessionCreatedAt: session.createdAt
    });
    expect(mocks.authUserSession).toHaveBeenCalledExactlyOnceWith('user-1:token-1');
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
      setHeader: vi.fn(),
      getHeader: vi.fn()
    }) as unknown as NodeHttpResponse;

  it('expires Refresh cookies during repeated rekeys even when their Path excludes them from the request', () => {
    const jar = new Map<string, { name: string; value: string; path: string }>();
    const refreshPath = `${serviceEnv.NEXT_PUBLIC_BASE_URL}/api${SESSION_API_PATH}`;
    const mutationPath = `${serviceEnv.NEXT_PUBLIC_BASE_URL}/api/support/user/account/password/update`;
    const cookieHeader = (path: string) =>
      [...jar.values()]
        .filter((cookie) => path.startsWith(cookie.path))
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join('; ');
    const now = Date.now();
    const sessionId = '012345678901234567890123:01234567890123456789012345678901';
    for (let contextVersion = 1; contextVersion <= 111; contextVersion++) {
      const response = createResponse();
      const requestCookies = cookieHeader(mutationPath);
      expect(requestCookies).not.toContain('fastgpt_refresh_');
      setCookie(response, {
        token: `at.${sessionId}.${contextVersion}.${contextVersion}.${'a'.repeat(43)}`,
        refreshToken: `rt.${sessionId}.${contextVersion}.${contextVersion}.${'b'.repeat(43)}`,
        session: {
          sessionId,
          contextVersion,
          generation: contextVersion,
          serverTime: now,
          createdAt: now,
          accessExpiresAt: now + 900_000,
          refreshExpiresAt: now + 604_800_000,
          absoluteExpiresAt: now + 2_592_000_000
        },
        selectSession: contextVersion === 1,
        request: { headers: { cookie: requestCookies } } as NodeHttpRequest
      });
      const headers = vi
        .mocked(response.setHeader)
        .mock.calls.find(([name]) => name === 'Set-Cookie')![1] as string[];
      for (const header of headers) {
        const [entry, ...attributes] = header.split('; ');
        const separator = entry.indexOf('=');
        const name = entry.slice(0, separator);
        const value = entry.slice(separator + 1);
        const path = attributes.find((attribute) => attribute.startsWith('Path='))!.slice(5);
        const key = `${name}|${path}`;
        if (attributes.includes('Max-Age=0')) jar.delete(key);
        else jar.set(key, { name, value, path });
      }
    }
    // 浏览器只发送路径匹配的 Cookie；重复重签后也不能触发 Node 默认 16 KiB Header 上限。
    expect(Buffer.byteLength(cookieHeader(refreshPath))).toBeLessThan(maxHeaderSize);
    expect(
      [...jar.values()].filter((cookie) => cookie.name.startsWith('fastgpt_refresh_'))
    ).toHaveLength(1);
  });

  it('默认不添加 Secure 属性以兼容 HTTP 自部署环境', () => {
    serviceEnv.AUTH_COOKIE_SECURE = false;
    const response = createResponse();

    setCookie(response, 'test-token');

    expect(response.setHeader).toHaveBeenCalledWith('Set-Cookie', [
      'fastgpt_token=test-token; Max-Age=604800; Path=/; HttpOnly; SameSite=Strict'
    ]);
  });

  it('启用配置后为登录 Cookie 添加 Secure 属性', () => {
    serviceEnv.AUTH_COOKIE_SECURE = true;
    const response = createResponse();

    setCookie(response, 'test-token');

    expect(response.setHeader).toHaveBeenCalledWith('Set-Cookie', [
      'fastgpt_token=test-token; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Strict'
    ]);
  });

  it('清理 Cookie 时复用 Secure 配置', () => {
    serviceEnv.AUTH_COOKIE_SECURE = true;
    const response = createResponse();

    clearCookie(response);

    expect(response.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.arrayContaining([
        'fastgpt_token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict'
      ])
    );
  });
});
