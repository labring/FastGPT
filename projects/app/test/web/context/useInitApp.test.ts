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
  configAuthenticated: false,
  loadedPage: undefined as string | undefined
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
    feConfigs: {},
    authenticatedConfigGeneration: mocks.configAuthenticated ? mocks.authGeneration : undefined,
    initDataPage: mocks.loadedPage
  })
}));

vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: { getState: () => ({ authGeneration: mocks.authGeneration }) }
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
    mocks.configAuthenticated = false;
    mocks.loadedPage = undefined;
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

  it.each(['/dashboard/agent', '/login', '/price', '/chat/share', '/apidoc/devapi'])(
    'initializes %s immediately without waiting for user restoration',
    async (pathname) => {
      vi.mocked(useRequest).mockImplementation(ahooksUseRequest);
      mocks.router.isReady = true;
      mocks.router.pathname = pathname;
      await render();
      expect(clientInitData).toHaveBeenCalledExactlyOnceWith(3, pathname);
      mocks.userInfo = { username: 'restored-member' };
      await render();
      expect(clientInitData).toHaveBeenCalledTimes(1);
    }
  );

  it('refreshes anonymous configuration on category changes while retaining reuse within the same category', async () => {
    vi.mocked(useRequest).mockImplementation(ahooksUseRequest);
    mocks.router.isReady = true;
    mocks.router.pathname = '/login';
    await render();
    expect(clientInitData).toHaveBeenLastCalledWith(3, '/login');

    mocks.router.query = { lastRoute: '/price' };
    await render();
    expect(clientInitData).toHaveBeenCalledTimes(1);

    mocks.router.pathname = '/price';
    await render();
    expect(clientInitData).toHaveBeenLastCalledWith(3, '/price');
    expect(clientInitData).toHaveBeenCalledTimes(2);

    mocks.router.pathname = '/tools/price';
    await render();
    expect(clientInitData).toHaveBeenCalledTimes(2);

    mocks.router.pathname = '/chat/share';
    await render();
    expect(clientInitData).toHaveBeenLastCalledWith(3, '/chat/share');
    expect(clientInitData).toHaveBeenCalledTimes(3);

    mocks.router.pathname = '/chat';
    await render();
    expect(clientInitData).toHaveBeenLastCalledWith(3, '/chat');
    expect(clientInitData).toHaveBeenCalledTimes(4);
  });

  it('does not request on user, session or timer changes and reuses authenticated data across pages', async () => {
    vi.useFakeTimers();
    vi.mocked(useRequest).mockImplementation(ahooksUseRequest);
    mocks.router.isReady = true;
    mocks.router.pathname = '/dashboard/agent';
    mocks.configAuthenticated = true;
    await render();
    mocks.userInfo = { username: 'restored-member' };
    await render();
    mocks.router.pathname = '/price';
    await render();
    await act(async () => vi.advanceTimersByTimeAsync(600000));
    expect(clientInitData).toHaveBeenCalledTimes(1);
    mocks.userInfo = { username: 'another-member' };
    mocks.authGeneration += 1;
    await render();
    expect(clientInitData).toHaveBeenCalledTimes(1);
  });

  it('reuses an anonymous page projection already fetched by an explicit success callback', async () => {
    vi.mocked(useRequest).mockImplementation(ahooksUseRequest);
    mocks.router.isReady = true;
    mocks.router.pathname = '/chat';
    await render();
    mocks.loadedPage = 'login';
    mocks.router.pathname = '/login';
    await render();
    expect(clientInitData).toHaveBeenCalledTimes(1);
  });

  it('refreshes page-specific data after an anonymous server response even when local user info remains', async () => {
    vi.mocked(useRequest).mockImplementation(ahooksUseRequest);
    mocks.router.isReady = true;
    mocks.router.pathname = '/price';
    mocks.userInfo = { username: 'expired-member' };
    await render();
    mocks.router.pathname = '/chat/share';
    await render();
    expect(clientInitData).toHaveBeenCalledTimes(2);
    expect(clientInitData).toHaveBeenLastCalledWith(3, '/chat/share');
  });
});
