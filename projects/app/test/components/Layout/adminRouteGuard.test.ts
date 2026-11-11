import { JSDOM } from 'jsdom';
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  system: {} as any,
  user: {} as any,
  router: { pathname: '/admin/dashboard', query: {}, replace: vi.fn(), push: vi.fn() },
  initLicenseData: vi.fn(),
  clientInitData: vi.fn(),
  setLastRoute: vi.fn(),
  mountChild: vi.fn(),
  toast: vi.fn(),
  syncLanguage: vi.fn()
}));

vi.mock('@/web/common/system/useSystemStore', () => ({ useSystemStore: () => mocks.system }));
vi.mock('@/web/common/system/staticData', () => ({ clientInitData: mocks.clientInitData }));
vi.mock('@/web/support/user/useUserStore', () => ({ useUserStore: () => mocks.user }));
vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: any) => React.createElement('div', null, children)
}));
vi.mock('@/components/Layout/auth', () => ({ default: ({ children }: any) => children }));
vi.mock('@fastgpt/web/hooks/useLoading', () => ({
  useLoading: () => ({
    Loading: ({ loading }: { loading: boolean }) =>
      loading ? React.createElement('span', { 'data-loading': true }) : null
  })
}));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: true }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useI18n', () => ({
  useI18nLng: () => ({
    setUserDefaultLng: mocks.syncLanguage,
    setShareDefaultLng: mocks.syncLanguage
  })
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({}) }));
vi.mock('@/web/support/user/team/useInvitationResultToast', () => ({
  useInvitationResultToast: () => {}
}));
vi.mock('@/web/support/user/inform/api', () => ({ getUnreadCount: vi.fn() }));
vi.mock('@/components/Layout/hooks/checkCoupon', () => ({ useCheckCoupon: () => {} }));
vi.mock('@/components/Layout/SupportBot', () => ({ default: () => null }));
vi.mock('@/web/core/ai/model/api', () => ({
  getAdminModelConfig: () => new Promise(() => {})
}));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({
  useUserModelStore: (selector: (state: { loginGeneration: number }) => unknown) =>
    selector({ loginGeneration: 0 })
}));

import Layout from '@/components/Layout';

const Child = () => {
  useEffect(() => {
    mocks.mountChild();
  }, []);
  return React.createElement('div', null, 'admin content');
};

let dom: JSDOM;
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  mocks.router.pathname = '/admin/dashboard';
  mocks.user = { userInfo: { username: 'root', team: { teamId: 't', tmbId: 'm' } } };
  mocks.system = {
    initd: true,
    loading: false,
    feConfigs: {},
    licenseData: undefined,
    licenseLoading: true,
    initLicenseData: mocks.initLicenseData,
    setLastRoute: mocks.setLastRoute,
    setShowProModal: vi.fn()
  };
  mocks.clientInitData.mockResolvedValue({ feConfigs: {} });
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

const render = async () => {
  await act(async () => root.render(React.createElement(Layout, null, React.createElement(Child))));
};

describe('admin route guard', () => {
  it('waits for the edition and Pro license before mounting or redirecting', async () => {
    mocks.system.initd = false;
    await render();
    expect(mocks.clientInitData).not.toHaveBeenCalled();
    expect(container.querySelector('[data-loading]')).not.toBeNull();

    mocks.system.initd = true;
    await render();
    expect(mocks.initLicenseData).not.toHaveBeenCalled();
    expect(mocks.clientInitData).toHaveBeenCalledTimes(1);
    expect(mocks.mountChild).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();

    await render();
    expect(mocks.clientInitData).toHaveBeenCalledTimes(1);

    mocks.system.feConfigs = { isProService: true };
    await render();
    expect(mocks.initLicenseData).toHaveBeenCalledTimes(1);
    expect(mocks.mountChild).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();

    mocks.system.licenseLoading = false;
    mocks.system.licenseData = {
      startTime: '2020-01-01',
      expiredTime: 'unlimited',
      licenseType: 'official',
      functions: { pay: false }
    };
    await render();
    expect(mocks.mountChild).toHaveBeenCalledTimes(1);
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(container.querySelector('[data-loading]')).toBeNull();

    mocks.router.pathname = '/admin/plans';
    await render();
    expect(container.textContent).not.toContain('admin content');
    expect(mocks.router.replace).toHaveBeenLastCalledWith('/admin/license');

    // 迟到的匿名投影覆盖登录态时，应再次补取，而不是等待下次轮询。
    mocks.system.feConfigs = {};
    mocks.system.licenseLoading = true;
    await render();
    expect(mocks.clientInitData).toHaveBeenCalledTimes(2);
  });

  it('blocks community commercial routes but mounts allowed configuration pages', async () => {
    mocks.system.feConfigs = { isProService: false };
    mocks.system.licenseLoading = false;
    await render();
    expect(mocks.initLicenseData).not.toHaveBeenCalled();
    expect(mocks.mountChild).not.toHaveBeenCalled();
    expect(mocks.router.replace).toHaveBeenCalledWith('/admin/license');

    mocks.router.pathname = '/admin/subservice/code-sandbox';
    await render();
    expect(mocks.mountChild).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('admin content');
  });

  it('redirects non-root users before mounting an admin child', async () => {
    mocks.user.userInfo.username = 'member';
    mocks.system.feConfigs = { isProService: false };
    mocks.system.licenseLoading = false;
    await render();
    expect(mocks.mountChild).not.toHaveBeenCalled();
    expect(mocks.router.replace).toHaveBeenCalledWith('/account/info');
  });
});
