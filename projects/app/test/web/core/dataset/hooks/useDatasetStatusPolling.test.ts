import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

// 仓库 setup 先初始化服务端依赖；随后创建 DOM 再加载 ahooks，让可见性插件使用真实浏览器事件。
const dom = new JSDOM('<!doctype html><html><body></body></html>');
vi.stubGlobal('window', dom.window);
vi.stubGlobal('document', dom.window.document);
const { createDatasetStatusRequest, DATASET_STATUS_POLLING_INTERVAL, useDatasetStatusPolling } =
  await import('@/web/core/dataset/hooks/useDatasetStatusPolling');
afterAll(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

describe('createDatasetStatusRequest', () => {
  it('shares the in-flight request between polling and manual refresh, then permits a new query', async () => {
    let resolve!: (value: boolean) => void;
    const request = vi.fn(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        })
    );
    const onSuccess = vi.fn();
    const { refresh, activate } = createDatasetStatusRequest(request, onSuccess);
    activate();
    const polling = refresh();
    const manual = refresh();
    expect(manual).toBe(polling);
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    resolve(true);
    await expect(Promise.allSettled([polling, manual])).resolves.toEqual([
      { status: 'fulfilled', value: true },
      { status: 'fulfilled', value: true }
    ]);
    const next = refresh();
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
    resolve(false);
    await expect(next).resolves.toBe(false);
    expect(onSuccess.mock.calls).toEqual([[true], [false]]);
  });

  it('settles every caller on failure and allows recovery', async () => {
    const error = new Error('offline');
    const request = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(false);
    const { refresh } = createDatasetStatusRequest(request);
    await expect(Promise.allSettled([refresh(), refresh()])).resolves.toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error }
    ]);
    await expect(refresh()).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('settles an old scope after deactivation without publishing its stale result', async () => {
    let resolve!: (value: boolean) => void;
    const onSuccess = vi.fn();
    const old = createDatasetStatusRequest(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
      onSuccess
    );
    old.activate();
    const pending = old.refresh();
    await Promise.resolve();
    old.deactivate();
    const current = createDatasetStatusRequest(async () => false, onSuccess);
    current.activate();
    await current.refresh();
    resolve(true);
    await expect(pending).resolves.toBe(true);
    expect(onSuccess.mock.calls).toEqual([[false]]);
    current.deactivate();
    await current.refresh();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});

describe('useDatasetStatusPolling', () => {
  let root: Root;
  let request: ReturnType<typeof vi.fn<() => Promise<number>>>;
  const Harness = ({ ready = true, id = 'dataset' }) => {
    useDatasetStatusPolling(() => request(), { ready, refreshDeps: [id], errorToast: '' });
    return null;
  };
  const render = async (props = {}) => {
    await act(async () => root.render(React.createElement(Harness, props)));
  };
  const tick = async (ms = DATASET_STATUS_POLLING_INTERVAL) => {
    await act(async () => vi.advanceTimersByTimeAsync(ms));
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    request = vi.fn().mockResolvedValue(1);
    root = createRoot(document.createElement('div'));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('waits for the whole slow request and then a full interval before the next round', async () => {
    let resolve!: (value: number) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    await render();
    await tick(DATASET_STATUS_POLLING_INTERVAL * 3);
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => resolve(1));
    await tick(DATASET_STATUS_POLLING_INTERVAL - 1);
    expect(request).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not request until ready and queries again when the dataset changes', async () => {
    await render({ ready: false });
    await tick();
    expect(request).not.toHaveBeenCalled();
    await render({ ready: true });
    expect(request).toHaveBeenCalledTimes(1);
    await render({ id: 'other' });
    expect(request).toHaveBeenCalledTimes(2);
    await tick();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('pauses hidden-page polling, resumes when visible, and stops after unmount', async () => {
    await render();
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    await tick(DATASET_STATUS_POLLING_INTERVAL * 3);
    expect(request).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue('visible');
    await act(async () => window.dispatchEvent(new window.Event('visibilitychange')));
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => root.render(null));
    await tick(DATASET_STATUS_POLLING_INTERVAL * 3);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('recovers from a failed round without speeding up the polling interval', async () => {
    request.mockRejectedValueOnce(new Error('offline'));
    await render();
    await tick(DATASET_STATUS_POLLING_INTERVAL - 1);
    expect(request).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
