import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Auth from '@/components/Layout/auth';

const mocks = vi.hoisted(() => ({
  pathname: '/tools/price',
  userInfo: null as { username: string } | null,
  initUserInfo: vi.fn(),
  useQuery: vi.fn(),
  toast: vi.fn()
}));

vi.mock('next/router', () => ({ useRouter: () => ({ pathname: mocks.pathname }) }));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: mocks.userInfo, initUserInfo: mocks.initUserInfo })
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

describe('Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = '/tools/price';
    mocks.userInfo = null;
  });

  it.each([
    { pathname: '/price', userInfo: null, enabled: false, visible: true },
    { pathname: '/tools/price', userInfo: null, enabled: true, visible: false },
    {
      pathname: '/tools/price',
      userInfo: { username: 'member' },
      enabled: true,
      visible: true
    }
  ])('applies the login gate for $pathname with user $userInfo', (scenario) => {
    mocks.pathname = scenario.pathname;
    mocks.userInfo = scenario.userInfo;

    const html = renderToStaticMarkup(React.createElement(Auth, null, 'page-content'));

    expect(html).toBe(scenario.visible ? 'page-content' : '');
    expect(mocks.useQuery).toHaveBeenCalledWith(
      ['initUserInfo'],
      mocks.initUserInfo,
      expect.objectContaining({ enabled: scenario.enabled })
    );
  });

  it('shows a login warning when user initialization fails', () => {
    renderToStaticMarkup(React.createElement(Auth, null, 'page-content'));
    mocks.useQuery.mock.calls[0][2].onError();
    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'warning',
      title: 'common:support.user.Need to login'
    });
  });
});
