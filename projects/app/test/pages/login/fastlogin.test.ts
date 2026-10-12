import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FastLogin from '@/pages/login/fastlogin';
import ClientRouteReadyGate from '@/web/context/ClientRouteReadyGate';

const mocks = vi.hoisted(() => ({
  router: {
    isReady: false,
    query: {} as Record<string, string>,
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn()
  },
  postFastLogin: vi.fn(),
  clearToken: vi.fn(),
  setUserInfo: vi.fn(),
  toast: vi.fn(),
  t: (key: string) => key,
  resolveLoginRedirect: vi.fn(),
  resetModelCatalog: vi.fn()
}));

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ setUserInfo: mocks.setUserInfo })
}));
vi.mock('@/web/support/user/auth', () => ({ clearToken: mocks.clearToken }));
vi.mock('@/web/support/user/api', () => ({ postFastLogin: mocks.postFastLogin }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: mocks.t, i18n: { language: 'en' } })
}));
vi.mock('@fastgpt/web/components/common/MyLoading', () => ({ default: () => null }));
vi.mock('@/web/support/user/loginRedirect', () => ({
  useLoginRedirectAfterLogin: () => mocks.resolveLoginRedirect
}));
vi.mock('@/web/core/ai/model/useUserModelStore', () => ({
  resetUserModelCatalogAfterLogin: mocks.resetModelCatalog
}));
vi.mock('@/web/support/marketing/utils', () => ({
  getFastGPTSem: () => ({ sourceDomain: 'https://campaign.example.com' }),
  onFastGPTLoginSuccess: async (
    callback: (response: unknown) => Promise<void>,
    response: unknown
  ) => callback(response)
}));

describe('FastLogin inside the CSR route gate', () => {
  let container: HTMLDivElement;
  let root: Root;
  const user = { _id: 'user-1' };
  const render = async () => {
    await act(async () =>
      root.render(
        React.createElement(ClientRouteReadyGate, { enabled: true }, React.createElement(FastLogin))
      )
    );
  };

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    vi.resetAllMocks();
    mocks.router.isReady = false;
    mocks.router.query = {};
    mocks.postFastLogin.mockResolvedValue({ user });
    mocks.resolveLoginRedirect.mockResolvedValue('/dashboard/agent');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for hydrated credentials before clearing the session and authenticating', async () => {
    await render();
    expect(mocks.clearToken).not.toHaveBeenCalled();
    expect(mocks.postFastLogin).not.toHaveBeenCalled();
    expect(mocks.router.prefetch).not.toHaveBeenCalled();

    mocks.router.query = {
      code: 'code-1',
      token: 'token-1',
      callbackUrl: '/app/detail?appId=app-1',
      lastTmbId: 'member-1'
    };
    mocks.router.isReady = true;
    await render();

    expect(mocks.clearToken).toHaveBeenCalledOnce();
    expect(mocks.postFastLogin).toHaveBeenCalledExactlyOnceWith({
      code: 'code-1',
      token: 'token-1',
      fastgpt_sem: { sourceDomain: 'https://campaign.example.com' },
      language: 'en'
    });
    expect(mocks.router.prefetch).toHaveBeenCalledWith('/app/detail?appId=app-1');
    expect(mocks.resolveLoginRedirect).toHaveBeenCalledWith({
      user,
      fallbackRoute: '/app/detail?appId=app-1',
      lastTmbId: 'member-1'
    });
    expect(mocks.setUserInfo).toHaveBeenCalledWith(user);
    expect(mocks.resetModelCatalog).toHaveBeenCalledOnce();
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith('/dashboard/agent');
  });

  it('does not re-authenticate when navigation replaces the router context with the same credentials', async () => {
    mocks.router.isReady = true;
    mocks.router.query = { code: 'code-1', token: 'token-1' };
    await render();

    mocks.router = { ...mocks.router, isReady: false };
    await render();
    mocks.router = { ...mocks.router, isReady: true };
    await render();

    expect(mocks.postFastLogin).toHaveBeenCalledOnce();
    expect(mocks.clearToken).toHaveBeenCalledOnce();
  });

  it('authenticates newly supplied credentials on a later visit to the same page', async () => {
    mocks.router.isReady = true;
    mocks.router.query = { code: 'code-1', token: 'token-1' };
    await render();

    mocks.router = { ...mocks.router, query: { code: 'code-2', token: 'token-2' } };
    await render();

    expect(mocks.postFastLogin).toHaveBeenCalledTimes(2);
    expect(mocks.postFastLogin).toHaveBeenLastCalledWith(
      expect.objectContaining({ code: 'code-2', token: 'token-2' })
    );
  });

  it('keeps the login fallback when authentication returns no user data', async () => {
    mocks.router.isReady = true;
    mocks.postFastLogin.mockResolvedValue(undefined);
    await render();

    expect(mocks.toast).toHaveBeenCalledWith({
      status: 'warning',
      title: 'common:support.user.login.error'
    });
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith('/login');
  });

  it('keeps the login fallback when authentication fails', async () => {
    mocks.router.isReady = true;
    mocks.postFastLogin.mockRejectedValue(new Error('invalid credentials'));
    await render();

    expect(mocks.toast).toHaveBeenCalledWith({ status: 'warning', title: 'invalid credentials' });
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith('/login');
  });

  it('does not navigate when the login redirect resolver returns no route', async () => {
    mocks.router.isReady = true;
    mocks.resolveLoginRedirect.mockResolvedValue(undefined);
    await render();

    expect(mocks.resolveLoginRedirect).toHaveBeenCalledWith({
      user,
      fallbackRoute: '/dashboard/agent',
      lastTmbId: ''
    });
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(mocks.router.push).not.toHaveBeenCalled();
  });
});
