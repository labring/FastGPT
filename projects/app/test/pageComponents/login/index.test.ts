import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginContainer from '@/pageComponents/login';
import ClientRouteReadyGate from '@/web/context/ClientRouteReadyGate';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { LAST_LOGIN_METHOD_STORAGE_KEY } from '@/web/support/user/login/utils';

const mocks = vi.hoisted(() => ({
  router: { isReady: false, query: {} as Record<string, string> },
  system: {
    initd: true,
    feConfigs: {
      sso: { enabled: true, autoLogin: true }
    } as {
      isPlus?: boolean;
      login_method?: Array<'email' | 'phone'>;
      sso?: {
        enabled?: boolean;
        autoLogin?: boolean;
        disablePasswordForSsoUsers?: boolean;
      };
      oauth?: { wecom?: boolean; wechat?: string };
      wecomLoginAutoRedirect?: boolean;
    }
  },
  startLogin: vi.fn().mockResolvedValue(undefined),
  resetChatCache: vi.fn(),
  setPageType: undefined as ((pageType: `${LoginPageTypeEnum}`) => void) | undefined,
  loginSuccess: undefined as
    | ((res: any, options?: { skipLastLoginMethod?: boolean }) => Promise<void> | void)
    | undefined
}));

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('@/web/common/system/useSystemStore', () => ({ useSystemStore: () => mocks.system }));
vi.mock('@/web/core/chat/context/useChatStore', () => ({
  useChatStore: () => ({ resetChatCache: mocks.resetChatCache })
}));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: true }) }));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: { children: React.ReactNode }) => children,
  Flex: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/pageComponents/login/LoginForm/useLoginMethods', () => ({
  useLoginMethods: () => ({ startLogin: mocks.startLogin })
}));
vi.mock('@/pageComponents/login/components/LoginFormPanel', () => ({
  default: ({
    pageType,
    setPageType,
    loginSuccess
  }: {
    pageType?: string;
    setPageType: (pageType: `${LoginPageTypeEnum}`) => void;
    loginSuccess: (res: any) => Promise<void> | void;
  }) => {
    mocks.setPageType = setPageType;
    mocks.loginSuccess = loginSuccess;
    return React.createElement('span', null, pageType ?? 'pending');
  }
}));
vi.mock('@/pageComponents/login/components/ChineseRedirectModal', () => ({ default: () => null }));
vi.mock('@/pageComponents/login/components/CookieConsentModal', () => ({ default: () => null }));
vi.mock('@/components/Select/I18nLngSelector', () => ({ default: () => null }));
vi.mock('@/pageComponents/login/LoginForm/LoginGuideLink', () => ({ default: () => null }));

describe('LoginContainer route initialization', () => {
  let root: Root;
  let container: HTMLDivElement;
  const render = async (clientOnly = false) => {
    await act(async () =>
      root.render(
        React.createElement(
          ClientRouteReadyGate,
          { enabled: clientOnly },
          React.createElement(LoginContainer, { onSuccess: vi.fn() })
        )
      )
    );
  };

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost'
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    mocks.startLogin.mockResolvedValue(undefined);
    mocks.setPageType = undefined;
    mocks.loginSuccess = undefined;
    mocks.router.isReady = false;
    mocks.router.query = {};
    mocks.system.initd = true;
    mocks.system.feConfigs = { sso: { enabled: true, autoLogin: true } };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    vi.unstubAllGlobals();
  });

  it('uses the server-provided rootLogin query in SSR HTML without waiting locally', async () => {
    mocks.router.query = { rootLogin: '1' };
    expect(renderToString(React.createElement(LoginContainer, { onSuccess: vi.fn() }))).toContain(
      LoginPageTypeEnum.passwordLogin
    );
    await render();
    expect(container.textContent).toBe(LoginPageTypeEnum.passwordLogin);
    expect(mocks.startLogin).not.toHaveBeenCalled();
  });

  it('waits for restored CSR query before choosing automatic login', async () => {
    await render(true);
    expect(mocks.startLogin).not.toHaveBeenCalled();

    mocks.router.query = { rootLogin: '1' };
    mocks.router.isReady = true;
    await render(true);
    expect(container.textContent).toBe(LoginPageTypeEnum.passwordLogin);
    expect(mocks.startLogin).not.toHaveBeenCalled();
  });

  it('still waits for system config and starts SSR automatic login only once', async () => {
    mocks.system.initd = false;
    await render();
    expect(mocks.startLogin).not.toHaveBeenCalled();
    expect(container.textContent).toBe('pending');

    mocks.system.initd = true;
    await render();
    expect(mocks.startLogin).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ provider: 'sso' })
    );
    await render();
    expect(mocks.startLogin).toHaveBeenCalledOnce();
    expect(container.textContent).toBe('pending');
  });

  it('shows password login when automatic login fails', async () => {
    mocks.startLogin.mockRejectedValueOnce(new Error('SSO unavailable'));
    await render();
    expect(container.textContent).toBe(LoginPageTypeEnum.passwordLogin);
    expect(mocks.startLogin).toHaveBeenCalledOnce();
  });

  it('starts automatic login once when SSO capability later recovers', async () => {
    mocks.system.feConfigs.sso!.enabled = false;
    await render();
    expect(container.textContent).toBe(LoginPageTypeEnum.passwordLogin);
    expect(mocks.startLogin).not.toHaveBeenCalled();

    mocks.system.feConfigs.sso!.enabled = true;
    await render();
    expect(mocks.startLogin).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ provider: 'sso' })
    );
    await render();
    expect(mocks.startLogin).toHaveBeenCalledOnce();
  });

  it('does not redirect to SSO in WeCom terminal when sso.autoLogin is off, and redirects to WeCom OAuth when configured', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 wxwork/4.1.0' });
    mocks.system.feConfigs = {
      sso: { enabled: true, autoLogin: false },
      wecomLoginAutoRedirect: true
    };
    await render();
    expect(container.textContent).toBe(LoginPageTypeEnum.passwordLogin);
    expect(mocks.startLogin).not.toHaveBeenCalled();

    mocks.system.feConfigs = {
      sso: { enabled: true, autoLogin: false },
      oauth: { wecom: true },
      wecomLoginAutoRedirect: true
    };
    await render();
    expect(mocks.startLogin).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ provider: 'wecom' })
    );
  });

  it('redirects to SSO in WeCom terminal when sso.autoLogin is on and wecomLoginAutoRedirect is off', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 wxwork/4.1.0' });
    mocks.system.feConfigs = {
      sso: { enabled: true, autoLogin: true },
      oauth: { wecom: true },
      wecomLoginAutoRedirect: false
    };
    await render();
    expect(mocks.startLogin).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ provider: 'sso' })
    );
  });

  it('prioritizes WeCom OAuth over SSO in WeCom terminal when both switches are on', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 wxwork/4.1.0' });
    mocks.system.feConfigs = {
      sso: { enabled: true, autoLogin: true },
      oauth: { wecom: true },
      wecomLoginAutoRedirect: true
    };
    await render();
    expect(mocks.startLogin).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ provider: 'wecom' })
    );
  });

  it('prefers code login when email or phone code login is enabled, while keeping rootLogin and query credentials on password login', async () => {
    mocks.system.feConfigs = {
      isPlus: true,
      login_method: ['email']
    };
    await render();
    expect(container.textContent).toBe(LoginPageTypeEnum.codeLogin);

    mocks.router.query = { rootLogin: '1' };
    await render();
    expect(container.textContent).toBe(LoginPageTypeEnum.passwordLogin);

    mocks.router.query = { u: 'user@example.com', p: 'secret' };
    await render();
    expect(container.textContent).toBe(LoginPageTypeEnum.passwordLogin);
  });

  it('restores the saved last login method when available, falls back when unavailable, and records login success', async () => {
    mocks.system.feConfigs = {
      isPlus: true,
      login_method: ['email'],
      oauth: { wechat: 'wechat-app-id' }
    };

    // 1. 首次登录后记录用户切换的密码登录方式
    await render();
    expect(container.textContent).toBe(LoginPageTypeEnum.codeLogin);

    await act(async () => {
      mocks.setPageType?.(LoginPageTypeEnum.passwordLogin);
    });
    expect(container.textContent).toBe(LoginPageTypeEnum.passwordLogin);

    await act(async () => {
      await mocks.loginSuccess?.({ user: { _id: 'u1' } });
    });
    expect(window.localStorage.getItem(LAST_LOGIN_METHOD_STORAGE_KEY)).toBe('page:password');

    // 2. 重新挂载登录页时恢复上次的密码登录方式
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    expect(container.textContent).toBe(LoginPageTypeEnum.passwordLogin);

    // 3. 微信登录可用时恢复微信登录；微信关闭后回退默认验证码登录
    window.localStorage.setItem(LAST_LOGIN_METHOD_STORAGE_KEY, 'page:wechat');
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    expect(container.textContent).toBe(LoginPageTypeEnum.wechat);

    mocks.system.feConfigs = {
      isPlus: true,
      login_method: ['email']
    };
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    expect(container.textContent).toBe(LoginPageTypeEnum.codeLogin);

    // 4. rootLogin 运维登录不覆盖本地记录的上次登录方式
    window.localStorage.setItem(LAST_LOGIN_METHOD_STORAGE_KEY, 'page:code');
    mocks.router.query = { rootLogin: '1' };
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    expect(container.textContent).toBe(LoginPageTypeEnum.passwordLogin);
    await act(async () => {
      await mocks.loginSuccess?.({ user: { _id: 'root' } });
    });
    expect(window.localStorage.getItem(LAST_LOGIN_METHOD_STORAGE_KEY)).toBe('page:code');
  });

  it('keeps password login latched and blocks SSO auto-redirect across query cleanup during auto-login 2FA', async () => {
    window.localStorage.setItem(LAST_LOGIN_METHOD_STORAGE_KEY, 'page:wechat');
    mocks.system.feConfigs = {
      isPlus: true,
      login_method: ['email'],
      sso: { enabled: true, autoLogin: true, disablePasswordForSsoUsers: true },
      oauth: { wechat: 'wechat-app-id' }
    };
    mocks.router.query = { u: 'user@example.com', p: 'secret' };

    await render();
    expect(container.textContent).toBe(LoginPageTypeEnum.passwordLogin);
    expect(mocks.startLogin).not.toHaveBeenCalled();

    // 模拟密码表单收到 2FA Challenge 后清理 URL 中的明文凭据：不得卸载密码表单，也不得触发 SSO 跳转。
    mocks.router.query = { u: '', p: '' };
    await render();
    expect(container.textContent).toBe(LoginPageTypeEnum.passwordLogin);
    expect(mocks.startLogin).not.toHaveBeenCalled();

    // 2FA 完成后若来源仍为自动凭据，不得覆盖用户原本保存的登录方式偏好。
    await act(async () => {
      await mocks.loginSuccess?.({ user: { _id: 'u-auto' } }, { skipLastLoginMethod: true });
    });
    expect(window.localStorage.getItem(LAST_LOGIN_METHOD_STORAGE_KEY)).toBe('page:wechat');

    // 取消 2FA 或密码错误后在同一密码表单手动登录成功，即使页面仍锁存在密码页也应记录本地偏好。
    await act(async () => {
      await mocks.loginSuccess?.({ user: { _id: 'u-manual' } }, { skipLastLoginMethod: false });
    });
    expect(window.localStorage.getItem(LAST_LOGIN_METHOD_STORAGE_KEY)).toBe('page:password');

    // 用户显式切走页面后，释放自动登录锁存态。
    await act(async () => {
      mocks.setPageType?.(LoginPageTypeEnum.codeLogin);
    });
    expect(container.textContent).toBe(LoginPageTypeEnum.codeLogin);
  });
});
