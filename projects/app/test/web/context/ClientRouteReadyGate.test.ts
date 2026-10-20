import { JSDOM } from 'jsdom';
import React, { act, useEffect, useState } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ClientRouteReadyGate from '@/web/context/ClientRouteReadyGate';

const mocks = vi.hoisted(() => ({
  router: {
    isReady: false,
    query: {} as Record<string, string>
  }
}));

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));

describe('ClientRouteReadyGate', () => {
  let container: HTMLDivElement;
  let root: Root | undefined;
  const requests = vi.fn();
  const mounts = vi.fn();
  const unmounts = vi.fn();

  const BusinessPage = () => {
    const [count, setCount] = useState(0);
    const { parentId } = mocks.router.query;

    useEffect(() => {
      mounts();
      return () => unmounts();
    }, []);
    useEffect(() => {
      requests(parentId);
    }, [parentId]);

    return React.createElement('button', { onClick: () => setCount(count + 1) }, count);
  };

  const page = (enabled = true) =>
    React.createElement(ClientRouteReadyGate, { enabled }, React.createElement(BusinessPage));

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    mocks.router.isReady = false;
    mocks.router.query = {};
    container = document.createElement('div');
    document.body.appendChild(container);
    root = undefined;
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    container.remove();
    window.close();
    vi.unstubAllGlobals();
  });

  it('waits for query hydration before mounting and requesting business data', async () => {
    root = createRoot(container);
    await act(async () => root!.render(page()));
    expect(container.innerHTML).toBe('');
    expect(mounts).not.toHaveBeenCalled();
    expect(requests).not.toHaveBeenCalled();

    mocks.router.query = { parentId: 'folder-1' };
    mocks.router.isReady = true;
    await act(async () => root!.render(page()));

    expect(mounts).toHaveBeenCalledOnce();
    expect(requests).toHaveBeenCalledExactlyOnceWith('folder-1');
  });

  it('allows SSR pages to render and mount without waiting for isReady', async () => {
    expect(renderToString(page(false))).toContain('<button>0</button>');
    root = createRoot(container);
    await act(async () => root!.render(page(false)));

    expect(mounts).toHaveBeenCalledOnce();
    expect(container.querySelector('button')).not.toBeNull();
  });

  it('keeps the initial CSR markup consistent when the client router is already ready', async () => {
    const serverMarkup = renderToString(page());
    expect(serverMarkup).toBe('');
    container.innerHTML = serverMarkup;
    mocks.router.isReady = true;
    mocks.router.query = { parentId: 'folder-hydrated' };
    const onRecoverableError = vi.fn();

    await act(async () => {
      root = hydrateRoot(container, page(), { onRecoverableError });
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(requests).toHaveBeenCalledExactlyOnceWith('folder-hydrated');
  });

  it('preserves page state and refreshes only business dependencies during navigation', async () => {
    mocks.router.isReady = true;
    mocks.router.query = { parentId: 'folder-1' };
    root = createRoot(container);
    await act(async () => root!.render(page()));
    await act(async () => container.querySelector('button')!.click());

    // 首次初始化完成后，路由状态变化不能关闭门禁或丢失用户编辑状态。
    mocks.router.isReady = false;
    await act(async () => root!.render(page()));
    expect(container.textContent).toBe('1');
    expect(unmounts).not.toHaveBeenCalled();

    mocks.router.isReady = true;
    mocks.router.query = { parentId: 'folder-2' };
    await act(async () => root!.render(page()));

    expect(container.textContent).toBe('1');
    expect(mounts).toHaveBeenCalledOnce();
    expect(requests.mock.calls).toEqual([['folder-1'], ['folder-2']]);
  });

  it('does not close an initialized gate when switching between SSR and CSR routes', async () => {
    mocks.router.isReady = true;
    root = createRoot(container);
    await act(async () => root!.render(page(false)));
    await act(async () => container.querySelector('button')!.click());

    await act(async () => root!.render(page(true)));
    expect(container.textContent).toBe('1');
    await act(async () => root!.render(page(false)));
    expect(container.textContent).toBe('1');
    expect(mounts).toHaveBeenCalledOnce();
    expect(unmounts).not.toHaveBeenCalled();
  });
});
