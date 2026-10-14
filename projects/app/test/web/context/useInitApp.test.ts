import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInitApp } from '@/web/context/useInitApp';
import ClientRouteReadyGate from '@/web/context/ClientRouteReadyGate';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useRequest as ahooksUseRequest } from 'ahooks';
import { clientInitData } from '@/web/common/system/staticData';

const mocks = vi.hoisted(() => ({
  router: {
    isReady: false,
    query: {} as Record<string, string>,
    pathname: '/',
    replace: vi.fn()
  },
  setBdVId: vi.fn(),
  setMsclkid: vi.fn(),
  setUtmWorkflow: vi.fn(),
  initFastGPTSemSourceDomain: vi.fn(),
  setUtmParams: vi.fn(),
  setFastGPTSem: vi.fn(),
  setCouponCode: vi.fn(),
  userInfo: null as { username: string } | null,
  authGeneration: 0,
  isUserInfoInitialized: false
}));

vi.mock('next/router', () => ({
  useRouter: () => mocks.router
}));

vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: vi.fn()
}));

vi.mock('@/web/common/system/staticData', () => ({
  clientInitData: vi.fn().mockResolvedValue({ feConfigs: {} })
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({
    loadGitStar: vi.fn(),
    setInitd: vi.fn(),
    feConfigs: {}
  })
}));

vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({
    userInfo: mocks.userInfo,
    authGeneration: mocks.authGeneration,
    isUserInfoInitialized: mocks.isUserInfoInitialized
  })
}));

vi.mock('@/web/support/marketing/utils', () => ({
  setBdVId: mocks.setBdVId,
  setFastGPTSem: mocks.setFastGPTSem,
  initFastGPTSemSourceDomain: mocks.initFastGPTSemSourceDomain,
  setMsclkid: mocks.setMsclkid,
  setUtmParams: mocks.setUtmParams,
  setUtmWorkflow: mocks.setUtmWorkflow,
  setCouponCode: mocks.setCouponCode
}));

describe('useInitApp marketing params inside AppShell', () => {
  let root: Root;
  let container: HTMLDivElement;

  const Harness = () => {
    useInitApp();
    return null;
  };
  const render = async (clientOnly = true) => {
    await act(async () =>
      root.render(
        React.createElement(
          ClientRouteReadyGate,
          { enabled: clientOnly },
          React.createElement(Harness)
        )
      )
    );
  };

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'https://fastgpt.example.com/#chat'
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    mocks.router.isReady = false;
    mocks.router.query = {};
    mocks.router.pathname = '/';
    mocks.userInfo = null;
    mocks.authGeneration = 0;
    mocks.isUserInfoInitialized = false;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.useRealTimers();
    container.remove();
    window.close();
    vi.unstubAllGlobals();
    vi.mocked(useRequest).mockReset();
  });

  it('waits for CSR query restoration at the application gate before consuming params', async () => {
    await render();
    expect(mocks.setBdVId).not.toHaveBeenCalled();
    expect(mocks.setCouponCode).not.toHaveBeenCalled();
    expect(mocks.initFastGPTSemSourceDomain).not.toHaveBeenCalled();

    mocks.router.isReady = true;
    mocks.router.query = {
      bd_vid: 'test-bd-vid',
      couponCode: 'SAVE20',
      utm_source: 'google',
      appId: 'app-1'
    };
    await render();

    expect(mocks.setBdVId).toHaveBeenCalledWith('test-bd-vid');
    expect(mocks.setCouponCode).toHaveBeenCalledWith('SAVE20');
    expect(mocks.setFastGPTSem).toHaveBeenCalledWith(
      expect.objectContaining({
        shortUrlSource: 'google'
      })
    );
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith('/?appId=app-1#chat');
  });

  it('initializes referrer attribution even without an explicit sourceDomain', async () => {
    mocks.router.isReady = true;
    await render();

    expect(mocks.initFastGPTSemSourceDomain).toHaveBeenCalledWith(undefined);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it('passes the explicit sourceDomain and preserves first attribution across navigation', async () => {
    mocks.router.isReady = true;
    mocks.router.query = { sourceDomain: 'https://campaign.example.com' };

    await render();
    mocks.router.query = { sourceDomain: 'https://later.example.com' };
    mocks.router.isReady = false;
    await render();

    expect(mocks.initFastGPTSemSourceDomain).toHaveBeenCalledOnce();
    expect(mocks.initFastGPTSemSourceDomain).toHaveBeenCalledWith('https://campaign.example.com');
  });

  it('consumes server-provided SSR query without a local router readiness check', async () => {
    mocks.router.query = {
      couponCode: 'SSR20',
      sourceDomain: 'https://ssr.example.com',
      utm_workflow: 'workflow-1',
      msclkid: 'ms-1',
      utm_medium: 'email',
      utm_content: 'chat'
    };
    await render(false);

    expect(mocks.setCouponCode).toHaveBeenCalledWith('SSR20');
    expect(mocks.initFastGPTSemSourceDomain).toHaveBeenCalledWith('https://ssr.example.com');
    expect(mocks.setMsclkid).toHaveBeenCalledWith('ms-1');
    expect(mocks.setUtmWorkflow).toHaveBeenCalledWith('workflow-1');
    expect(mocks.setUtmParams).toHaveBeenCalledWith({
      shortUrlMedium: 'email',
      shortUrlContent: 'chat'
    });
  });

  it.each([true, false])(
    'waits for protected-page user initialization and requests once when authenticated=%s',
    async (authenticated) => {
      vi.mocked(useRequest).mockImplementation(ahooksUseRequest);
      mocks.router.isReady = true;
      mocks.router.pathname = '/dashboard/agent';
      await render();
      expect(clientInitData).not.toHaveBeenCalled();

      mocks.isUserInfoInitialized = true;
      if (authenticated) {
        mocks.userInfo = { username: 'member' };
        mocks.authGeneration = 1;
      }
      await render();
      expect(clientInitData).toHaveBeenCalledTimes(1);

      mocks.router.pathname = '/dashboard/dataset';
      await render();
      expect(clientInitData).toHaveBeenCalledTimes(1);
    }
  );

  it('loads public login configuration immediately and refreshes after login and logout', async () => {
    vi.mocked(useRequest).mockImplementation(ahooksUseRequest);
    mocks.router.isReady = true;
    mocks.router.pathname = '/login';
    await render();
    expect(clientInitData).toHaveBeenCalledTimes(1);

    mocks.userInfo = { username: 'member' };
    mocks.authGeneration = 1;
    mocks.isUserInfoInitialized = true;
    mocks.router.pathname = '/dashboard/agent';
    await render();
    expect(clientInitData).toHaveBeenCalledTimes(2);

    // 退出已明确撤销身份；即使尚未跳离受保护页面，也要开始刷新匿名配置。
    mocks.userInfo = null;
    mocks.authGeneration = 2;
    await render();
    expect(clientInitData).toHaveBeenCalledTimes(3);
  });

  it.each(['/price', '/chat/share', '/apidoc/devapi'])(
    'loads %s without waiting for user initialization',
    async (pathname) => {
      vi.mocked(useRequest).mockImplementation(ahooksUseRequest);
      mocks.router.isReady = true;
      mocks.router.pathname = pathname;
      await render();
      expect(clientInitData).toHaveBeenCalledTimes(1);

      // 匿名身份确认不会改变会话，也不应重复请求。
      mocks.isUserInfoInitialized = true;
      await render();
      expect(clientInitData).toHaveBeenCalledTimes(1);
    }
  );

  it('refreshes same-account sessions and retains five-minute polling', async () => {
    vi.useFakeTimers();
    vi.mocked(useRequest).mockImplementation(ahooksUseRequest);
    mocks.router.isReady = true;
    mocks.router.pathname = '/dashboard/agent';
    mocks.userInfo = { username: 'member' };
    mocks.authGeneration = 1;
    mocks.isUserInfoInitialized = true;
    await render();
    expect(clientInitData).toHaveBeenCalledTimes(1);

    mocks.authGeneration = 2;
    await render();
    expect(clientInitData).toHaveBeenCalledTimes(2);

    await act(async () => vi.advanceTimersByTimeAsync(299999));
    expect(clientInitData).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(clientInitData).toHaveBeenCalledTimes(3);
  });
});
