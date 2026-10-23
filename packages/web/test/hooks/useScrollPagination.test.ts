// @vitest-environment jsdom

import React, { useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { PaginationType, PaginationResponseType } from '@fastgpt/global/openapi/api';
import { useScrollPagination } from '../../hooks/useScrollPagination';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn() })
}));

vi.mock('../../components/common/MyBox', () => ({
  default: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    function MockMyBox({ children, ...props }, ref) {
      return React.createElement('div', { ...props, ref }, children);
    }
  )
}));

vi.mock('@chakra-ui/react', () => ({
  Box: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    function MockBox({ children, ...props }, ref) {
      return React.createElement('div', { ...props, ref }, children);
    }
  )
}));

vi.mock('../../hooks/useRequest', async () => {
  const { useEffect } = await vi.importActual<typeof import('react')>('react');

  return {
    useRequest: (
      service: () => Promise<unknown>,
      options: { manual?: boolean; refreshDeps?: unknown[] } = {}
    ) => {
      const refreshDepsKey = JSON.stringify(options.refreshDeps ?? []);

      useEffect(() => {
        if (options.manual === false) {
          void service();
        }
        // The mock intentionally models dependency refresh without service identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [options.manual, refreshDepsKey]);

      return {};
    }
  };
});

type ListParams = PaginationType & { query: string };
type ListResponse = PaginationResponseType<string>;
type RequestRecord = {
  params: ListParams;
  controller?: AbortController;
  resolve: (response: ListResponse) => void;
  reject: (error: unknown) => void;
};

type HarnessProps = {
  query: string;
  api: (params: ListParams, controller?: AbortController) => Promise<ListResponse>;
  onState: (state: ReturnType<typeof useScrollPagination<ListParams, ListResponse>>) => void;
  showPaginationTip?: boolean;
  showNoMoreTip?: boolean;
  scrollDataShowNoMoreTip?: boolean;
  refreshApi?: (ids: string[], controller?: AbortController) => Promise<string[]>;
  pageSize?: number;
};

const Harness = ({
  query,
  api,
  onState,
  showPaginationTip = true,
  showNoMoreTip = true,
  scrollDataShowNoMoreTip,
  refreshApi,
  pageSize = 10
}: HarnessProps) => {
  const state = useScrollPagination(api, {
    pageSize,
    params: { query },
    refreshDeps: [query],
    showErrorToast: false,
    showPaginationTip,
    showNoMoreTip,
    refreshByIds: refreshApi ? { getId: (item) => item.split(':')[0], api: refreshApi } : undefined
  });

  useEffect(() => onState(state), [onState, state]);

  const scrollDataProps = {
    'data-testid': 'scroll-data',
    ...(scrollDataShowNoMoreTip !== undefined ? { showNoMoreTip: scrollDataShowNoMoreTip } : {}),
    children: React.createElement('span', { 'data-testid': 'scroll-content' })
  };
  return React.createElement(state.ScrollData, scrollDataProps);
};

const createDeferredApi = () => {
  const requests: RequestRecord[] = [];
  const api = vi.fn((params: ListParams, controller?: AbortController) => {
    return new Promise<ListResponse>((resolve, reject) => {
      requests.push({ params, controller, resolve, reject });
    });
  });

  return { api, requests };
};

const createDeferredRefreshApi = () => {
  const requests: {
    ids: string[];
    controller?: AbortController;
    resolve: (list: string[]) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const refreshApi = vi.fn(
    (ids: string[], controller?: AbortController) =>
      new Promise<string[]>((resolve, reject) => {
        requests.push({ ids, controller, resolve, reject });
      })
  );
  return { refreshApi, requests };
};

const renderHarness = async (root: Root, props: HarnessProps) => {
  await act(async () => {
    root.render(React.createElement(Harness, props));
    await Promise.resolve();
  });
};

describe('useScrollPagination', () => {
  it('marks an empty result only after the current request succeeds', async () => {
    const { api, requests } = createDeferredApi();
    const onState = vi.fn();
    const root = createRoot(document.createElement('div'));

    await renderHarness(root, { query: 'empty', api, onState });

    expect(onState.mock.lastCall?.[0].isEmpty).toBe(false);

    await act(async () => {
      requests[0].resolve({ list: [], total: 0 });
      await Promise.resolve();
    });

    expect(onState.mock.lastCall?.[0].isEmpty).toBe(true);
    root.unmount();
  });

  it('cancels the previous init request and keeps the latest response', async () => {
    const { api, requests } = createDeferredApi();
    const onState = vi.fn();
    const root = createRoot(document.createElement('div'));

    await renderHarness(root, { query: 'first', api, onState });
    await renderHarness(root, { query: 'second', api, onState });

    expect(requests).toHaveLength(2);
    expect(requests[0].params.query).toBe('first');
    expect(requests[1].params.query).toBe('second');
    expect(requests[0].controller?.signal.aborted).toBe(true);

    await act(async () => {
      requests[1].resolve({ list: ['second'], total: 1 });
      await Promise.resolve();
    });

    const latestState = onState.mock.lastCall?.[0];
    expect(latestState?.data).toEqual(['second']);

    await act(async () => {
      requests[0].resolve({ list: ['first'], total: 1 });
      await Promise.resolve();
    });

    expect(onState.mock.lastCall?.[0].data).toEqual(['second']);
    root.unmount();
  });

  it('exposes request errors and allows an explicit refresh retry', async () => {
    const { api, requests } = createDeferredApi();
    const onState = vi.fn();
    const root = createRoot(document.createElement('div'));

    await renderHarness(root, { query: 'retry', api, onState });

    await act(async () => {
      requests[0].reject(new Error('request failed'));
      await Promise.resolve();
    });

    expect(onState.mock.lastCall?.[0].error).toBeInstanceOf(Error);

    await act(async () => {
      onState.mock.lastCall?.[0].refreshList();
      await Promise.resolve();
    });

    expect(requests).toHaveLength(2);
    root.unmount();
  });

  it('keeps cached pages and the scroll container while a silent first-page refresh fails', async () => {
    const { api, requests } = createDeferredApi();
    const onState = vi.fn();
    const host = document.createElement('div');
    const root = createRoot(host);

    await renderHarness(root, { query: 'silent', api, onState });
    await act(async () => requests[0].resolve({ list: ['one', 'two'], total: 4 }));
    await act(async () => {
      void onState.mock.lastCall?.[0].fetchData();
    });
    await act(async () => requests[1].resolve({ list: ['three', 'four'], total: 4 }));
    const scrollContainer = host.querySelector('[data-testid="scroll-data"]');

    await act(async () => {
      void onState.mock.lastCall?.[0].fetchData({ init: true, silent: true });
    });
    expect(requests[2].params).toEqual({ query: 'silent', offset: 0, pageSize: 10 });
    expect(onState.mock.lastCall?.[0].isLoading).toBe(false);
    expect(onState.mock.lastCall?.[0].data).toEqual(['one', 'two', 'three', 'four']);
    expect(host.querySelector('[data-testid="scroll-data"]')).toBe(scrollContainer);

    await act(async () => requests[2].reject(new Error('offline')));
    expect(onState.mock.lastCall?.[0].data).toEqual(['one', 'two', 'three', 'four']);
    expect(onState.mock.lastCall?.[0].total).toBe(4);
    expect(onState.mock.lastCall?.[0].error?.message).toBe('offline');
    await act(async () => root.unmount());
  });

  it.each([
    { name: 'all footer tips', options: { showPaginationTip: false } },
    { name: 'hook no-more tip', options: { showNoMoreTip: false } },
    { name: 'ScrollData no-more tip', options: { scrollDataShowNoMoreTip: false } }
  ])('hides $name', async ({ options }) => {
    const { api, requests } = createDeferredApi();
    const onState = vi.fn();
    const host = document.createElement('div');
    const root = createRoot(host);

    await renderHarness(root, { query: 'footer', api, onState, ...options });
    await act(async () => requests[0].resolve({ list: ['one'], total: 1 }));

    expect(host.textContent).not.toContain('common:request_end');
    expect(host.textContent).not.toContain('common:request_more');
    await act(async () => root.unmount());
  });
});

describe('useScrollPagination.refreshItems', () => {
  it('updates one ID in place while preserving all loaded pages, total and scroll position', async () => {
    const { api, requests } = createDeferredApi();
    const { refreshApi, requests: refreshRequests } = createDeferredRefreshApi();
    const onState = vi.fn();
    const host = document.createElement('div');
    const root = createRoot(host);

    await renderHarness(root, { query: 'ids', api, refreshApi, onState });
    await act(async () => requests[0].resolve({ list: ['one', 'two'], total: 8 }));
    await act(async () => {
      void onState.mock.lastCall?.[0].fetchData();
    });
    await act(async () => requests[1].resolve({ list: ['three', 'four'], total: 8 }));
    await act(async () => {
      void onState.mock.lastCall?.[0].fetchData();
    });
    await act(async () => requests[2].resolve({ list: ['five', 'six'], total: 8 }));
    const scrollData = host.querySelector<HTMLDivElement>('[data-testid="scroll-data"]')!;
    scrollData.scrollTop = 320;

    await act(async () => {
      void onState.mock.lastCall?.[0].refreshItems(['four']);
    });
    expect(refreshRequests[0].ids).toEqual(['four']);
    expect(requests).toHaveLength(3);
    expect(onState.mock.lastCall?.[0].isLoading).toBe(false);
    expect(onState.mock.lastCall?.[0].data).toEqual(['one', 'two', 'three', 'four', 'five', 'six']);

    await act(async () => refreshRequests[0].resolve(['four:updated']));
    expect(onState.mock.lastCall?.[0].data).toEqual([
      'one',
      'two',
      'three',
      'four:updated',
      'five',
      'six'
    ]);
    expect(onState.mock.lastCall?.[0].total).toBe(8);
    expect(host.querySelector('[data-testid="scroll-data"]')).toBe(scrollData);
    expect(scrollData.scrollTop).toBe(320);

    await act(async () => {
      void onState.mock.lastCall?.[0].refreshItems([]);
    });
    expect(refreshRequests).toHaveLength(1);
    await act(async () => {
      void onState.mock.lastCall?.[0].fetchData();
    });
    expect(requests[3].params.offset).toBe(6);
    await act(async () => requests[3].resolve({ list: ['seven', 'eight'], total: 8 }));
    expect(onState.mock.lastCall?.[0].data).toContain('four:updated');
    await act(async () => root.unmount());
  });

  it('retains missing IDs and preserves cached order, total and the next offset', async () => {
    const { api, requests } = createDeferredApi();
    const { refreshApi, requests: refreshRequests } = createDeferredRefreshApi();
    const onState = vi.fn();
    const root = createRoot(document.createElement('div'));

    await renderHarness(root, { query: 'missing', api, refreshApi, onState });
    await act(async () => requests[0].resolve({ list: ['one', 'two'], total: 5 }));
    await act(async () => {
      void onState.mock.lastCall?.[0].fetchData();
    });
    await act(async () => requests[1].resolve({ list: ['three', 'four'], total: 5 }));
    await act(async () => {
      void onState.mock.lastCall?.[0].refreshItems(['one', 'two', 'four']);
    });
    await act(async () => refreshRequests[0].resolve(['four:updated', 'one:updated', 'unknown']));

    expect(onState.mock.lastCall?.[0].data).toEqual([
      'one:updated',
      'two',
      'three',
      'four:updated'
    ]);
    expect(onState.mock.lastCall?.[0].total).toBe(5);
    await act(async () => {
      void onState.mock.lastCall?.[0].fetchData();
    });
    expect(requests[2].params.offset).toBe(4);
    await act(async () => requests[2].resolve({ list: ['five'], total: 5 }));

    const previousData = onState.mock.lastCall?.[0].data;
    await act(async () => {
      void onState.mock.lastCall?.[0].refreshItems();
    });
    await act(async () => refreshRequests[1].resolve([]));
    expect(onState.mock.lastCall?.[0].data).toBe(previousData);
    expect(onState.mock.lastCall?.[0].total).toBe(5);
    expect(onState.mock.lastCall?.[0].isEmpty).toBe(false);
    await act(async () => {
      void onState.mock.lastCall?.[0].refreshItems(['outside-cache']);
    });
    await act(async () => refreshRequests[2].resolve(['outside-cache:updated']));
    expect(onState.mock.lastCall?.[0].data).toBe(previousData);
    await act(async () => root.unmount());
  });

  it('waits for an in-flight page and keeps its result when the ID refresh fails', async () => {
    const { api, requests } = createDeferredApi();
    const { refreshApi, requests: refreshRequests } = createDeferredRefreshApi();
    const onState = vi.fn();
    const root = createRoot(document.createElement('div'));

    await renderHarness(root, { query: 'failed', api, refreshApi, onState });
    await act(async () => requests[0].resolve({ list: ['one', 'two'], total: 6 }));
    await act(async () => {
      void onState.mock.lastCall?.[0].fetchData();
    });
    await act(async () => {
      void onState.mock.lastCall?.[0].refreshItems(['two']);
    });
    expect(requests[1].controller?.signal.aborted).toBe(false);
    expect(refreshRequests).toHaveLength(0);
    await act(async () => requests[1].resolve({ list: ['three', 'four'], total: 6 }));
    expect(refreshRequests[0].ids).toEqual(['two']);
    await act(async () => refreshRequests[0].reject(new Error('offline')));

    expect(onState.mock.lastCall?.[0].data).toEqual(['one', 'two', 'three', 'four']);
    expect(onState.mock.lastCall?.[0].total).toBe(6);
    expect(onState.mock.lastCall?.[0].error).toBe(null);
    expect(onState.mock.lastCall?.[0].refreshError?.message).toBe('offline');
    expect(onState.mock.lastCall?.[0].isLoading).toBe(false);
    await act(async () => {
      void onState.mock.lastCall?.[0].refreshItems(['two']);
    });
    await act(async () => refreshRequests[1].resolve(['two:updated']));
    expect(onState.mock.lastCall?.[0].error).toBe(null);
    expect(onState.mock.lastCall?.[0].refreshError).toBe(null);
    await act(async () => {
      void onState.mock.lastCall?.[0].fetchData();
    });
    expect(requests[2].params.offset).toBe(4);
    await act(async () => root.unmount());
  });

  it('keeps the new directory first page when old saves finish late and merges queued IDs', async () => {
    const { api, requests } = createDeferredApi();
    const { refreshApi, requests: refreshRequests } = createDeferredRefreshApi();
    const onState = vi.fn();
    const root = createRoot(document.createElement('div'));

    await renderHarness(root, { query: 'old-directory', api, refreshApi, onState });
    await act(async () => requests[0].resolve({ list: ['one', 'old-only'], total: 2 }));
    const refreshAfterSave = onState.mock.lastCall?.[0].refreshItems;
    await renderHarness(root, { query: 'new-directory', api, refreshApi, onState });
    await act(async () => {
      void refreshAfterSave(['one', 'old-only']);
      void refreshAfterSave(['one', 'two']);
    });

    expect(requests[1].controller?.signal.aborted).toBe(false);
    expect(refreshRequests).toHaveLength(0);
    expect(onState.mock.lastCall?.[0].isLoading).toBe(true);
    await act(async () => requests[1].resolve({ list: ['one', 'two'], total: 3 }));
    expect(refreshRequests[0].ids).toEqual(['one', 'old-only', 'two']);
    expect(onState.mock.lastCall?.[0].data).toEqual(['one', 'two']);
    await act(async () => refreshRequests[0].resolve(['old-only:updated', 'two:updated']));

    expect(onState.mock.lastCall?.[0].data).toEqual(['one', 'two:updated']);
    expect(onState.mock.lastCall?.[0].total).toBe(3);
    expect(onState.mock.lastCall?.[0].isLoading).toBe(false);
    await act(async () => {
      void onState.mock.lastCall?.[0].fetchData();
    });
    expect(requests[2].params.offset).toBe(2);
    await act(async () => root.unmount());
  });

  it('continues loading on scroll after an ID refresh fails without a pagination footer', async () => {
    const { api, requests } = createDeferredApi();
    const { refreshApi, requests: refreshRequests } = createDeferredRefreshApi();
    const onState = vi.fn();
    const host = document.createElement('div');
    const root = createRoot(host);

    await renderHarness(root, {
      query: 'scroll-after-refresh-error',
      api,
      refreshApi,
      onState,
      showPaginationTip: false
    });
    const scroller = host.querySelector<HTMLDivElement>('[data-testid="scroll-data"]')!;
    Object.defineProperties(scroller, {
      scrollHeight: { value: 1000 },
      clientHeight: { value: 200 }
    });
    await act(async () => requests[0].resolve({ list: ['one', 'two'], total: 4 }));
    await act(async () => {
      void onState.mock.lastCall?.[0].refreshItems(['two']);
    });
    const refreshError = new Error('offline');
    await act(async () => refreshRequests[0].reject(refreshError));

    await act(async () => {
      scroller.scrollTop = 900;
      scroller.dispatchEvent(new Event('scroll'));
      // useScroll 在下一帧更新位置，再由节流 effect 检查是否触底。
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(requests).toHaveLength(2);
    expect(requests[1].params.offset).toBe(2);
    await act(async () => requests[1].resolve({ list: ['three', 'four'], total: 4 }));
    expect(onState.mock.lastCall?.[0].data).toEqual(['one', 'two', 'three', 'four']);
    expect(onState.mock.lastCall?.[0].error).toBe(null);
    expect(onState.mock.lastCall?.[0].refreshError).toBe(refreshError);
    expect(host.querySelector('[data-testid="scroll-data"]')).toBe(scroller);

    await act(async () => onState.mock.lastCall?.[0].refreshList());
    expect(onState.mock.lastCall?.[0].refreshError).toBe(null);
    await act(async () => requests[2].resolve({ list: ['one', 'two'], total: 2 }));
    await act(async () => root.unmount());
  });

  it('keeps pagination errors while an ID refresh fails or succeeds', async () => {
    const { api, requests } = createDeferredApi();
    const { refreshApi, requests: refreshRequests } = createDeferredRefreshApi();
    const onState = vi.fn();
    const root = createRoot(document.createElement('div'));

    await renderHarness(root, { query: 'separate-errors', api, refreshApi, onState });
    await act(async () => requests[0].resolve({ list: ['one', 'two'], total: 4 }));
    await act(async () => {
      void onState.mock.lastCall?.[0].fetchData();
    });
    const paginationError = new Error('page failed');
    await act(async () => requests[1].reject(paginationError));
    await act(async () => {
      void onState.mock.lastCall?.[0].refreshItems(['two']);
    });
    expect(onState.mock.lastCall?.[0].error).toBe(paginationError);

    const refreshError = new Error('refresh failed');
    await act(async () => refreshRequests[0].reject(refreshError));
    expect(onState.mock.lastCall?.[0].error).toBe(paginationError);
    expect(onState.mock.lastCall?.[0].refreshError).toBe(refreshError);

    await act(async () => {
      void onState.mock.lastCall?.[0].refreshItems(['two']);
    });
    expect(onState.mock.lastCall?.[0].refreshError).toBe(null);
    await act(async () => refreshRequests[1].resolve(['two:updated']));
    expect(onState.mock.lastCall?.[0].error).toBe(paginationError);
    await act(async () => {
      void onState.mock.lastCall?.[0].fetchData();
    });
    expect(onState.mock.lastCall?.[0].error).toBe(null);
    expect(requests[2].params.offset).toBe(2);
    await act(async () => requests[2].resolve({ list: ['three', 'four'], total: 4 }));
    expect(onState.mock.lastCall?.[0].data).toEqual(['one', 'two:updated', 'three', 'four']);
    await act(async () => root.unmount());
  });

  it('discards ID responses after switching filters or unmounting', async () => {
    const { api, requests } = createDeferredApi();
    const { refreshApi, requests: refreshRequests } = createDeferredRefreshApi();
    const onState = vi.fn();
    const root = createRoot(document.createElement('div'));

    await renderHarness(root, { query: 'first', api, refreshApi, onState });
    await act(async () => requests[0].resolve({ list: ['one'], total: 1 }));
    await act(async () => {
      void onState.mock.lastCall?.[0].refreshItems(['one']);
    });
    await renderHarness(root, { query: 'second', api, refreshApi, onState });
    expect(refreshRequests[0].controller?.signal.aborted).toBe(true);
    await act(async () => requests[1].resolve({ list: ['two'], total: 1 }));
    await act(async () => refreshRequests[0].resolve(['one:stale']));
    expect(onState.mock.lastCall?.[0].data).toEqual(['two']);

    await act(async () => {
      void onState.mock.lastCall?.[0].refreshItems(['two']);
    });
    expect(refreshRequests[1].ids).toEqual(['two']);
    await act(async () => root.unmount());
    expect(refreshRequests[1].controller?.signal.aborted).toBe(true);
    await act(async () => refreshRequests[1].reject(new Error('cancelled')));
  });

  it('serializes overlapping edits and lets the later save update the same ID last', async () => {
    const { api, requests } = createDeferredApi();
    const { refreshApi, requests: refreshRequests } = createDeferredRefreshApi();
    const onState = vi.fn();
    const root = createRoot(document.createElement('div'));

    await renderHarness(root, { query: 'overlap', api, refreshApi, onState });
    await act(async () => requests[0].resolve({ list: ['one', 'two'], total: 4 }));
    await act(async () => {
      void onState.mock.lastCall?.[0].refreshItems(['one']);
    });
    await act(async () => {
      void onState.mock.lastCall?.[0].refreshItems(['one', 'two', 'two']);
    });
    expect(refreshRequests[0].controller?.signal.aborted).toBe(false);
    expect(refreshRequests).toHaveLength(1);
    await act(async () => {
      void onState.mock.lastCall?.[0].fetchData();
    });
    expect(requests).toHaveLength(1);
    await act(async () => refreshRequests[0].resolve(['one:earlier']));
    expect(refreshRequests[1].ids).toEqual(['one', 'two']);
    await act(async () => refreshRequests[1].resolve(['two:updated', 'one:updated']));
    expect(onState.mock.lastCall?.[0].data).toEqual(['one:updated', 'two:updated']);
    expect(requests).toHaveLength(2);
    expect(requests[1].params.offset).toBe(2);
    await act(async () => requests[1].resolve({ list: ['three', 'four'], total: 4 }));
    expect(onState.mock.lastCall?.[0].data).toEqual([
      'one:updated',
      'two:updated',
      'three',
      'four'
    ]);
    await act(async () => root.unmount());
  });

  it('keeps successive updates that finish before React commits the new cache', async () => {
    const { api, requests } = createDeferredApi();
    const { refreshApi, requests: refreshRequests } = createDeferredRefreshApi();
    const onState = vi.fn();
    const root = createRoot(document.createElement('div'));

    await renderHarness(root, { query: 'batched-render', api, refreshApi, onState });
    await act(async () => requests[0].resolve({ list: ['one', 'two'], total: 2 }));
    await act(async () => {
      const first = onState.mock.lastCall?.[0].refreshItems(['one']);
      refreshRequests[0].resolve(['one:updated']);
      await first;
      const second = onState.mock.lastCall?.[0].refreshItems(['two']);
      refreshRequests[1].resolve(['two:updated']);
      await second;
    });

    expect(onState.mock.lastCall?.[0].data).toEqual(['one:updated', 'two:updated']);
    await act(async () => root.unmount());
  });

  it('batches all cached IDs at the API limit and commits only after every batch succeeds', async () => {
    const { api, requests } = createDeferredApi();
    const { refreshApi, requests: refreshRequests } = createDeferredRefreshApi();
    const onState = vi.fn();
    const root = createRoot(document.createElement('div'));
    const firstPage = Array.from({ length: 500 }, (_, index) => String(index));
    const cache = [...firstPage, '500', '501'];

    await renderHarness(root, { query: 'batch', api, refreshApi, onState, pageSize: 500 });
    await act(async () => requests[0].resolve({ list: firstPage, total: 600 }));
    await act(async () => {
      void onState.mock.lastCall?.[0].fetchData();
    });
    await act(async () => requests[1].resolve({ list: ['500', '501'], total: 600 }));
    await act(async () => {
      void onState.mock.lastCall?.[0].refreshItems();
    });
    expect(refreshRequests[0].ids).toEqual(firstPage);
    await act(async () => refreshRequests[0].resolve(firstPage.map((id) => `${id}:updated`)));
    expect(refreshRequests[1].ids).toEqual(['500', '501']);
    expect(onState.mock.lastCall?.[0].data).toEqual(cache);
    await act(async () => refreshRequests[1].reject(new Error('second batch failed')));
    expect(onState.mock.lastCall?.[0].data).toEqual(cache);

    await act(async () => {
      void onState.mock.lastCall?.[0].refreshItems();
    });
    await act(async () => refreshRequests[2].resolve(firstPage.map((id) => `${id}:updated`)));
    await act(async () => refreshRequests[3].resolve(['500:updated', '501:updated']));
    expect(onState.mock.lastCall?.[0].data).toEqual(cache.map((id) => `${id}:updated`));
    expect(onState.mock.lastCall?.[0].total).toBe(600);
    await act(async () => root.unmount());
  });
});
