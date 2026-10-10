import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useContextSelector } from 'use-context-selector';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import type { AppDetailType } from '@fastgpt/global/core/app/type';
import type { PostPublishAppProps } from '@/global/core/app/api';
import AppContextProvider, {
  AppContext,
  type AppSaveHandler
} from '@/pageComponents/app/detail/context';

const mocks = vi.hoisted(() => ({
  getAppDetailById: vi.fn(),
  putAppById: vi.fn(),
  delAppById: vi.fn(),
  getAppLatestVersion: vi.fn(),
  postPublishApp: vi.fn(),
  toast: vi.fn(),
  router: {
    query: { appId: 'app-1', currentTab: 'appEdit' },
    push: vi.fn(),
    replace: vi.fn()
  }
}));

vi.mock('@/web/core/app/api', () => ({
  delAppById: mocks.delAppById,
  getAppDetailById: mocks.getAppDetailById,
  putAppById: mocks.putAppById
}));
vi.mock('@/web/core/app/api/version', () => ({
  getAppLatestVersion: mocks.getAppLatestVersion,
  postPublishApp: mocks.postPublishApp
}));
vi.mock('next/router', () => ({
  useRouter: () => mocks.router
}));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({
    openConfirm: vi.fn(),
    ConfirmModal: () => null
  })
}));
vi.mock('next/dynamic', () => ({
  default: () => () => null
}));

const saveData = {
  nodes: [{ nodeId: 'node-1' }],
  edges: [],
  chatConfig: {}
} as unknown as PostPublishAppProps;

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const renderProvider = async ({ hasWritePer }: { hasWritePer: boolean }) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  let onSaveApp: AppSaveHandler;
  let appDetail: AppDetailType;

  const Capture = () => {
    onSaveApp = useContextSelector(AppContext, (value) => value.onSaveApp);
    appDetail = useContextSelector(AppContext, (value) => value.appDetail);
    return null;
  };

  mocks.getAppDetailById.mockResolvedValue({
    _id: 'app-1',
    type: 'workflow',
    permission: { hasWritePer }
  });
  mocks.getAppLatestVersion.mockImplementation(() => new Promise(() => {}));

  const render = () =>
    root.render(React.createElement(AppContextProvider, null, React.createElement(Capture)));

  await act(async () => {
    render();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => undefined);

  return {
    root,
    render,
    getSaveApp: () => onSaveApp!,
    getAppDetail: () => appDetail!
  };
};

describe('AppContext save result', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    mocks.router.query = { appId: 'app-1', currentTab: 'appEdit' };
    mocks.getAppDetailById.mockResolvedValue({
      _id: 'app-1',
      type: 'workflow',
      permission: { hasWritePer: true }
    });
    mocks.getAppLatestVersion.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns failure when the current user cannot write', async () => {
    const { root, getSaveApp } = await renderProvider({ hasWritePer: false });
    let result: boolean | undefined;

    await act(async () => {
      result = await getSaveApp()(saveData);
    });
    expect(result).toBe(false);
    expect(mocks.postPublishApp).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it('routes the current 404 save response to the app list and returns failure', async () => {
    mocks.postPublishApp.mockRejectedValueOnce({ statusText: AppErrEnum.unExist });
    const { root, getSaveApp } = await renderProvider({ hasWritePer: true });
    let result: boolean | undefined;

    await act(async () => {
      result = await getSaveApp()(saveData);
    });
    expect(result).toBe(false);
    expect(mocks.router.replace).toHaveBeenCalledWith('/dashboard/agent');

    act(() => root.unmount());
  });

  it('propagates network failure as a rejected save', async () => {
    mocks.postPublishApp.mockRejectedValueOnce(new Error('network error'));
    const { root, getSaveApp } = await renderProvider({ hasWritePer: true });

    await act(async () => {
      await expect(getSaveApp()(saveData)).rejects.toThrow('network error');
    });

    act(() => root.unmount());
  });

  it('serializes saves and runs only the latest pending payload', async () => {
    const firstRequest = createDeferred<void>();
    mocks.postPublishApp.mockImplementationOnce(() => firstRequest.promise);
    mocks.postPublishApp.mockResolvedValue(undefined);
    const { root, getSaveApp, getAppDetail } = await renderProvider({ hasWritePer: true });

    const firstSave = getSaveApp()({
      ...saveData,
      nodes: [{ nodeId: 'first' }]
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.postPublishApp).toHaveBeenCalledTimes(1);

    const latestSave = getSaveApp()({
      ...saveData,
      nodes: [{ nodeId: 'latest' }]
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.postPublishApp).toHaveBeenCalledTimes(1);

    let firstResult: boolean | undefined;
    let latestResult: boolean | undefined;
    await act(async () => {
      firstRequest.resolve();
      firstResult = await firstSave;
      latestResult = await latestSave;
    });

    expect(firstResult).toBe(false);
    expect(latestResult).toBe(true);
    expect(mocks.postPublishApp).toHaveBeenCalledTimes(2);
    expect(mocks.postPublishApp.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ nodes: [{ nodeId: 'latest' }] })
    );
    expect(getAppDetail().nodes).toEqual([{ nodeId: 'latest' }]);

    act(() => root.unmount());
  });

  it('does not apply the latest payload when that save fails', async () => {
    const firstRequest = createDeferred<void>();
    mocks.postPublishApp.mockImplementationOnce(() => firstRequest.promise);
    mocks.postPublishApp.mockRejectedValueOnce(new Error('latest save failed'));
    const { root, getSaveApp, getAppDetail } = await renderProvider({ hasWritePer: true });

    const firstSave = getSaveApp()({
      ...saveData,
      nodes: [{ nodeId: 'first' }]
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const latestSave = getSaveApp()({
      ...saveData,
      nodes: [{ nodeId: 'latest' }]
    });

    await act(async () => {
      firstRequest.resolve();
      await expect(firstSave).resolves.toBe(false);
      await expect(latestSave).rejects.toThrow('latest save failed');
    });

    expect(getAppDetail().nodes).toBeUndefined();
    act(() => root.unmount());
  });

  it('ignores a previous app 404 after the route changes', async () => {
    const firstRequest = createDeferred<never>();
    mocks.postPublishApp.mockImplementationOnce(() => firstRequest.promise);
    const { root, render, getSaveApp } = await renderProvider({ hasWritePer: true });

    const previousAppSave = getSaveApp()(saveData);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    mocks.getAppDetailById.mockImplementation((requestedAppId: string) => {
      if (requestedAppId === 'app-2') return new Promise(() => {});
      return Promise.resolve({
        _id: requestedAppId,
        type: 'workflow',
        permission: { hasWritePer: true }
      });
    });
    mocks.router.query = { appId: 'app-2', currentTab: 'appEdit' };
    act(() => {
      flushSync(() => {
        render();
      });
    });
    await act(async () => {
      firstRequest.reject({ statusText: AppErrEnum.unExist });
      await previousAppSave;
    });

    await expect(previousAppSave).resolves.toBe(false);
    expect(mocks.router.replace).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it('ignores a previous app success after the route changes', async () => {
    const firstRequest = createDeferred<void>();
    mocks.postPublishApp.mockImplementationOnce(() => firstRequest.promise);
    const { root, render, getSaveApp, getAppDetail } = await renderProvider({ hasWritePer: true });

    const previousAppSave = getSaveApp()({
      ...saveData,
      nodes: [{ nodeId: 'previous-app' }]
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    mocks.getAppDetailById.mockResolvedValue({
      _id: 'app-2',
      type: 'workflow',
      permission: { hasWritePer: true }
    });
    mocks.router.query = { appId: 'app-2', currentTab: 'appEdit' };
    act(() => {
      flushSync(() => {
        render();
      });
    });

    await act(async () => {
      firstRequest.resolve();
      await previousAppSave;
    });

    expect(getAppDetail().nodes).not.toEqual([{ nodeId: 'previous-app' }]);

    act(() => root.unmount());
  });
});
