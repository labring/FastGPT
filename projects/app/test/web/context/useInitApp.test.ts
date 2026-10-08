import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInitApp } from '@/web/context/useInitApp';
import ClientRouteReadyGate from '@/web/context/ClientRouteReadyGate';

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
  setCouponCode: vi.fn()
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
  useUserStore: () => ({ userInfo: null })
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
});
