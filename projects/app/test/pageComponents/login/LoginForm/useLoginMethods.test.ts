import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLoginMethods } from '@/pageComponents/login/LoginForm/useLoginMethods';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  setLoginStore: vi.fn(),
  getSsoAuthURL: vi.fn(),
  getWecomRedirectURL: vi.fn(),
  toast: vi.fn(),
  feConfigs: {
    sso: { enabled: true, title: 'Company SSO' },
    oauth: { github: 'github-client-id' }
  }
}));

vi.mock('next/router', () => ({
  useRouter: () => ({
    pathname: '/login',
    asPath: '/login',
    query: { lastRoute: '/dashboard/agent', lastTmbId: 'member-1' },
    replace: mocks.replace
  })
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: mocks.feConfigs, setLoginStore: mocks.setLoginStore })
}));
vi.mock('@/web/support/user/api', () => ({
  getSsoAuthURL: mocks.getSsoAuthURL,
  getWecomRedirectURL: mocks.getWecomRedirectURL
}));

/** 运行真实登录 Hook，只替换路由、配置来源和远端授权地址请求。 */
const renderLoginMethods = () => {
  let methods!: ReturnType<typeof useLoginMethods>;
  const Harness = () => {
    methods = useLoginMethods({
      mode: 'selection',
      pageType: LoginPageTypeEnum.methodSelection,
      setPageType: vi.fn()
    });
    return null;
  };
  renderToStaticMarkup(React.createElement(Harness));
  return methods;
};

describe('useLoginMethods authorization destinations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', { location: { origin: 'https://app.example.com' } });
    vi.stubGlobal('navigator', { userAgent: 'Chrome' });
    mocks.getSsoAuthURL.mockResolvedValue('https://identity.example.com/authorize');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the SSO authorization address on click using capabilities without a configured root URL', async () => {
    const { methods, startLogin } = renderLoginMethods();
    const sso = methods.find((method) => method.id === 'oauth:sso')!;
    await startLogin(sso);

    expect(mocks.getSsoAuthURL).toHaveBeenCalledExactlyOnceWith({
      redirectUri: 'https://app.example.com/login/provider',
      isWecomWorkTerminal: false
    });
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
      'https://identity.example.com/authorize',
      '_self'
    );
    expect(mocks.setLoginStore).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'sso',
        lastRoute: '/dashboard/agent',
        lastTmbId: 'member-1'
      })
    );
  });

  it('still builds the GitHub login address on the client using its Client ID', async () => {
    const { methods, startLogin } = renderLoginMethods();
    const github = methods.find((method) => method.id === 'oauth:github')!;
    await startLogin(github);

    const url = new URL(mocks.replace.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('github-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/login/provider');
    expect(url.searchParams.get('state')).toHaveLength(32);
    expect(mocks.getSsoAuthURL).not.toHaveBeenCalled();
    expect(mocks.getWecomRedirectURL).not.toHaveBeenCalled();
  });
});
