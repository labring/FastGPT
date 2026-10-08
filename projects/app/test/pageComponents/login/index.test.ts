import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginContainer from '@/pageComponents/login';
import ClientRouteReadyGate from '@/web/context/ClientRouteReadyGate';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';

const mocks = vi.hoisted(() => ({
  router: { isReady: false, query: {} as Record<string, string> },
  system: {
    initd: true,
    feConfigs: { sso: { url: 'https://sso.example.com', autoLogin: true } }
  },
  startLogin: vi.fn().mockResolvedValue(undefined),
  resetChatCache: vi.fn()
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
  default: ({ pageType }: { pageType?: string }) =>
    React.createElement('span', null, pageType ?? 'pending')
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
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    mocks.startLogin.mockResolvedValue(undefined);
    mocks.router.isReady = false;
    mocks.router.query = {};
    mocks.system.initd = true;
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
});
