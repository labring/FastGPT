import { JSDOM } from 'jsdom';
import React, { act, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClientRouteReadyGate from '@/web/context/ClientRouteReadyGate';

const mocks = vi.hoisted(() => ({
  router: {
    isReady: true,
    query: {} as Record<string, string>,
    asPath: '/login/provider?state=oauth-state',
    pathname: '/login/provider',
    replace: vi.fn(),
    prefetch: vi.fn()
  },
  loginStore: undefined as
    | {
        provider: string;
        lastRoute: string;
        lastTmbId?: string;
        state?: string;
        flow?: string;
      }
    | undefined,
  initd: true,
  loginSuccess: undefined as ((result: unknown) => Promise<void>) | undefined,
  resolveLoginRedirect: vi.fn(),
  setUserInfo: vi.fn(),
  setLoginStore: vi.fn(),
  oauthLogin: vi.fn(),
  clearToken: vi.fn(),
  resetUserModelCatalogAfterLogin: vi.fn()
}));

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}));

vi.mock('next/router', () => ({
  useRouter: () => mocks.router
}));

vi.mock('ahooks', () => ({
  useMount: vi.fn()
}));

vi.mock('@/pageComponents/login/LoginModal', () => ({
  default: ({ onSuccess }: { onSuccess: (result: unknown) => Promise<void> }) => {
    mocks.loginSuccess = onSuccess;
    return null;
  }
}));

vi.mock('@/web/common/i18n/utils', () => ({
  serviceSideProps: vi.fn()
}));

vi.mock('@/web/support/user/auth', () => ({
  clearToken: mocks.clearToken
}));

vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ setUserInfo: mocks.setUserInfo })
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({
    initd: mocks.initd,
    loginStore: mocks.loginStore,
    setLoginStore: mocks.setLoginStore
  })
}));

vi.mock('@/web/common/system/utils', () => ({
  subRoute: '',
  getWebReqUrl: (route: string) => route
}));

vi.mock('@/web/common/utils/uri', () => ({
  validateRedirectUrl: (route: string) => route
}));

vi.mock('@/web/support/user/loginRedirect', () => ({
  useLoginRedirectAfterLogin: () => mocks.resolveLoginRedirect
}));

vi.mock('@/web/core/ai/model/useUserModelStore', () => ({
  resetUserModelCatalogAfterLogin: mocks.resetUserModelCatalogAfterLogin
}));

vi.mock('@/web/support/user/api', () => ({
  oauthLogin: mocks.oauthLogin
}));

vi.mock('@/web/support/user/account/cancellation/api', () => ({
  submitAccountCancellation: vi.fn()
}));

vi.mock('@/web/support/user/account/password/api', () => ({
  authorizePasswordChange: vi.fn()
}));

vi.mock('@/web/support/user/account/password/store', () => ({
  usePasswordChangeStore: {
    getState: () => ({ setSession: vi.fn() })
  }
}));

vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn() })
}));

vi.mock('@fastgpt/web/components/common/MyLoading', () => ({
  default: () => null
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' }
  })
}));

vi.mock('@fastgpt/global/support/user/constant', () => ({
  OAuthEnum: { sso: 'sso' }
}));

vi.mock('@fastgpt/global/support/user/account/verification/type', () => ({
  AccountExternalVerificationMethodSchema: { parse: (value: string) => value },
  OAuthAccountVerificationMethodSchema: { parse: (value: string) => value }
}));

vi.mock('@/web/support/marketing/utils', () => ({
  getBdVId: vi.fn(),
  getFastGPTSem: vi.fn(),
  getMsclkid: vi.fn(),
  onFastGPTLoginSuccess: async (callback: (result: unknown) => Promise<void>, result: unknown) =>
    callback(result)
}));

vi.mock('@fastgpt/global/common/system/utils', () => ({
  retryFn: (callback: () => unknown) => callback()
}));

vi.mock('@fastgpt/global/common/error/utils', () => ({
  getErrText: (error: unknown) => String(error)
}));

const Login = (await import('@/pages/login')).default;
const Provider = (await import('@/pages/login/provider')).default;

const user = {
  _id: 'user-a',
  team: {
    teamId: 'team-a',
    tmbId: 'tmb-a',
    status: 'active'
  }
};

const invitationRoute = '/account/team?invitelinkid=invite-1';

describe('login page invitation redirects', () => {
  let container: HTMLDivElement;
  let root: Root;
  const render = async (Component: ComponentType = Provider) => {
    await act(async () =>
      root.render(
        React.createElement(ClientRouteReadyGate, { enabled: true }, React.createElement(Component))
      )
    );
  };

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    mocks.router.isReady = true;
    mocks.router.query = {};
    mocks.router.asPath = '/login/provider?state=oauth-state';
    mocks.loginStore = undefined;
    mocks.initd = true;
    mocks.loginSuccess = undefined;
    mocks.oauthLogin.mockResolvedValue({ user });
    mocks.resolveLoginRedirect.mockResolvedValue(invitationRoute);
    vi.stubGlobal('location', { origin: 'https://fastgpt.example.com' });
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

  it('keeps the invitation fallback in regular login', async () => {
    mocks.router.query = {
      lastRoute: invitationRoute,
      lastTmbId: 'tmb-a'
    };

    await render(Login);
    await act(async () => mocks.loginSuccess!({ user }));

    expect(mocks.resolveLoginRedirect).toHaveBeenCalledWith({
      user,
      fallbackRoute: invitationRoute,
      lastTmbId: 'tmb-a'
    });
    expect(mocks.router.replace).toHaveBeenCalledWith(invitationRoute);
  });

  it('keeps the invitation fallback in OAuth login', async () => {
    mocks.loginStore = {
      provider: 'sso',
      lastRoute: invitationRoute,
      lastTmbId: 'tmb-a',
      state: 'oauth-state'
    };
    mocks.router.query = { state: 'oauth-state', code: 'oauth-code' };
    mocks.oauthLogin.mockResolvedValue({ user });

    await render();

    await vi.waitFor(() => {
      expect(mocks.resolveLoginRedirect).toHaveBeenCalledWith({
        user,
        fallbackRoute: invitationRoute,
        lastTmbId: 'tmb-a'
      });
      expect(mocks.router.replace).toHaveBeenCalledWith(invitationRoute);
    });
  });

  it('waits for the CSR route gate before executing the hydrated OAuth callback', async () => {
    mocks.loginStore = {
      provider: 'sso',
      lastRoute: invitationRoute,
      lastTmbId: 'tmb-a',
      state: 'oauth-state'
    };
    mocks.router.isReady = false;
    mocks.router.query = {};

    await render();

    expect(mocks.oauthLogin).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.setLoginStore).not.toHaveBeenCalled();
    expect(mocks.clearToken).not.toHaveBeenCalled();

    mocks.router.query = { state: 'oauth-state', code: 'oauth-code' };
    mocks.router.isReady = true;
    await render();

    expect(mocks.oauthLogin).toHaveBeenCalledOnce();
    expect(mocks.router.replace).toHaveBeenCalledWith(invitationRoute);
  });

  it('continues waiting for system initialization after the CSR route is ready', async () => {
    mocks.initd = false;
    mocks.loginStore = {
      provider: 'sso',
      lastRoute: invitationRoute,
      state: 'oauth-state'
    };
    mocks.router.query = { state: 'oauth-state', code: 'oauth-code' };
    await render();
    expect(mocks.oauthLogin).not.toHaveBeenCalled();

    mocks.initd = true;
    await render();
    expect(mocks.oauthLogin).toHaveBeenCalledOnce();
  });
});
