import { JSDOM } from 'jsdom';
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppProps } from 'next/app';
import AppShell from '@/web/context/AppShell';

const mocks = vi.hoisted(() => ({
  router: {
    isReady: false,
    pathname: '/dashboard/agent',
    query: {} as Record<string, string>
  },
  initializeApp: vi.fn(),
  initializeLayout: vi.fn(),
  languageReady: true
}));

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('next/script', () => ({ default: () => null }));
vi.mock('@/web/context/useInitApp', () => ({
  useInitApp: () => {
    useEffect(() => {
      mocks.initializeApp(mocks.router.query);
    }, []);
    return { feConfigs: {}, scripts: [], title: 'FastGPT' };
  }
}));
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => {
    useEffect(() => {
      mocks.initializeLayout(mocks.router.query);
    }, []);
    return children;
  }
}));
vi.mock('@/web/context/QueryClient', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/web/context/ChakraUI', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/context/useSystem', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/i18n/ClientI18nGate', () => ({
  default: ({ children }: { children: React.ReactNode }) => (mocks.languageReady ? children : null)
}));
vi.mock('@fastgpt/web/i18n/ClientI18nBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}));
vi.mock('@/components/common/NextHead', () => ({ default: () => null }));
vi.mock('@fastgpt/web/common/system/utils', () => ({ getWebReqUrl: (url: string) => url }));
vi.mock('@/web/common/utils/errorLogger', () => ({ errorLogger: { init: vi.fn() } }));
vi.mock('@/web/common/system/env', () => ({ appClientEnv: {} }));

describe('AppShell startup boundaries', () => {
  let container: HTMLDivElement;
  let root: Root;
  const Page = () => React.createElement('div', null, 'business-page');
  const render = async (clientOnly: boolean) => {
    await act(async () =>
      root.render(
        React.createElement(AppShell, {
          Component: Page,
          pageProps: {},
          router: mocks.router as unknown as AppProps['router'],
          clientOnly
        })
      )
    );
  };

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    mocks.router.isReady = false;
    mocks.router.query = {};
    mocks.router.pathname = '/dashboard/agent';
    mocks.languageReady = true;
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

  it('also gates application and Layout initialization until CSR query is ready', async () => {
    await render(true);
    expect(mocks.initializeApp).not.toHaveBeenCalled();
    expect(mocks.initializeLayout).not.toHaveBeenCalled();
    expect(container.textContent).toBe('');

    mocks.router.isReady = true;
    mocks.router.query = { parentId: 'folder-1', couponCode: 'SAVE20' };
    await render(true);

    expect(mocks.initializeApp).toHaveBeenCalledExactlyOnceWith(mocks.router.query);
    expect(mocks.initializeLayout).toHaveBeenCalledExactlyOnceWith(mocks.router.query);
    expect(container.textContent).toBe('business-page');
  });

  it('waits for both language resources and route readiness', async () => {
    mocks.languageReady = false;
    mocks.router.isReady = true;
    await render(true);
    expect(mocks.initializeApp).not.toHaveBeenCalled();

    mocks.languageReady = true;
    await render(true);
    expect(mocks.initializeApp).toHaveBeenCalledOnce();
  });

  it.each(['/chat', '/chat/share'])(
    'keeps %s server content outside CSR startup gates',
    (pathname) => {
      mocks.router.pathname = pathname;
      mocks.languageReady = false;

      expect(
        renderToString(
          React.createElement(AppShell, {
            Component: Page,
            pageProps: {},
            router: mocks.router as unknown as AppProps['router'],
            clientOnly: false
          })
        )
      ).toContain('business-page');
    }
  );
});
