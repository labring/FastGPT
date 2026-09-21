import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  router: {
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
  effects: [] as Array<() => void>,
  resolveLoginRedirect: vi.fn(),
  setUserInfo: vi.fn(),
  setLoginStore: vi.fn(),
  oauthLogin: vi.fn(),
  clearToken: vi.fn(),
  resetUserModelCatalogAfterLogin: vi.fn()
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => void) => {
    mocks.effects.push(effect);
  },
  useRef: <T>(value?: T) => ({ current: value })
}));

vi.mock('next/router', () => ({
  useRouter: () => mocks.router
}));

vi.mock('ahooks', () => ({
  useMount: vi.fn()
}));

vi.mock('@/pageComponents/login/LoginModal', () => ({
  default: 'login-modal'
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
    initd: true,
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
  default: 'loading'
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.effects.length = 0;
    mocks.router.query = {};
    mocks.router.asPath = '/login/provider?state=oauth-state';
    mocks.loginStore = undefined;
    mocks.resolveLoginRedirect.mockResolvedValue(invitationRoute);
    vi.stubGlobal('location', { origin: 'https://fastgpt.example.com' });
  });

  it('keeps the invitation fallback in regular login', async () => {
    mocks.router.query = {
      lastRoute: invitationRoute,
      lastTmbId: 'tmb-a'
    };

    const page = Login() as ReactElement<{
      onSuccess: (result: { user: typeof user }) => Promise<void>;
    }>;
    await page.props.onSuccess({ user });

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

    Provider();
    expect(mocks.effects).toHaveLength(1);
    mocks.effects[0]();

    await vi.waitFor(() => {
      expect(mocks.resolveLoginRedirect).toHaveBeenCalledWith({
        user,
        fallbackRoute: invitationRoute,
        lastTmbId: 'tmb-a'
      });
      expect(mocks.router.replace).toHaveBeenCalledWith(invitationRoute);
    });
  });
});
