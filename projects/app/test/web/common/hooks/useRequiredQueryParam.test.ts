import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRequiredQueryParam } from '@/web/common/hooks/useRequiredQueryParam';
import ClientRouteReadyGate from '@/web/context/ClientRouteReadyGate';

const mocks = vi.hoisted(() => ({
  router: {
    query: {} as Record<string, string | string[]>,
    isReady: false,
    replace: vi.fn()
  }
}));

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));

describe('useRequiredQueryParam inside the CSR route gate', () => {
  let container: HTMLDivElement;
  let root: Root;
  let result: ReturnType<typeof useRequiredQueryParam> | undefined;

  const Harness = ({ paramKey, fallbackRoute }: { paramKey: string; fallbackRoute: string }) => {
    result = useRequiredQueryParam(paramKey, { fallbackRoute });
    return result ? React.createElement('span', null, result) : null;
  };
  const render = async (paramKey = 'appId', fallbackRoute = '/dashboard/agent') => {
    await act(async () =>
      root.render(
        React.createElement(
          ClientRouteReadyGate,
          { enabled: true },
          React.createElement(Harness, { paramKey, fallbackRoute })
        )
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
    result = undefined;
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

  it('does not redirect before hydration and reads the restored query on first mount', async () => {
    await render('appId', '/dashboard/agent');
    expect(result).toBeUndefined();
    expect(mocks.router.replace).not.toHaveBeenCalled();

    mocks.router.query = { appId: 'app-1', currentTab: 'logs' };
    mocks.router.isReady = true;
    await render('appId', '/dashboard/agent');

    expect(result).toBe('app-1');
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it.each([
    { paramKey: 'appId', fallbackRoute: '/dashboard/agent' },
    { paramKey: 'datasetId', fallbackRoute: '/dataset/list' },
    { paramKey: 'skillId', fallbackRoute: '/dashboard/skill' }
  ])(
    'redirects a missing $paramKey after the route gate opens',
    async ({ paramKey, fallbackRoute }) => {
      mocks.router.isReady = true;
      await render(paramKey, fallbackRoute);

      expect(result).toBeUndefined();
      expect(container.textContent).toBe('');
      expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith(fallbackRoute);
    }
  );

  it('takes the first element of an array parameter', async () => {
    mocks.router.isReady = true;
    mocks.router.query = { appId: ['app-1', 'app-2'] };
    await render('appId', '/dashboard/agent');

    expect(result).toBe('app-1');
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it.each([{ appId: '' }, { appId: [] as string[] }])(
    'rejects an empty parameter %j',
    async (query) => {
      mocks.router.isReady = true;
      mocks.router.query = query;
      await render('appId', '/dashboard/agent');

      expect(result).toBeUndefined();
      expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith('/dashboard/agent');
    }
  );

  it('falls back when a later query update removes the required parameter', async () => {
    mocks.router.isReady = true;
    mocks.router.query = { appId: 'app-1' };
    await render();

    mocks.router.query = {};
    await render();

    expect(result).toBeUndefined();
    expect(container.textContent).toBe('');
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith('/dashboard/agent');
  });

  it('reads later query updates without adding another router readiness condition', async () => {
    mocks.router.isReady = true;
    mocks.router.query = { appId: 'app-1' };
    await render('appId', '/dashboard/agent');

    mocks.router.isReady = false;
    mocks.router.query = { appId: 'app-2' };
    await render('appId', '/dashboard/agent');

    expect(container.textContent).toBe('app-2');
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });
});
