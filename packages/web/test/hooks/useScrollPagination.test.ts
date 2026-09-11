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
};

const Harness = ({ query, api, onState, showPaginationTip = true }: HarnessProps) => {
  const state = useScrollPagination(api, {
    pageSize: 10,
    params: { query },
    refreshDeps: [query],
    showErrorToast: false,
    showPaginationTip
  });

  useEffect(() => onState(state), [onState, state]);

  return React.createElement(
    state.ScrollData,
    { 'data-testid': 'scroll-data' },
    React.createElement('span', { 'data-testid': 'scroll-content' })
  );
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

  it('hides both pagination footer states when disabled', async () => {
    const { api, requests } = createDeferredApi();
    const onState = vi.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(Harness, {
          query: 'without-footer',
          api,
          onState,
          showPaginationTip: false
        })
      );
      await Promise.resolve();
    });

    await act(async () => {
      requests[0].resolve({ list: ['one'], total: 1 });
      await Promise.resolve();
    });

    const scrollData = document.querySelector('[data-testid="scroll-data"]');
    expect(scrollData?.textContent).not.toContain('common:request_end');
    expect(scrollData?.textContent).not.toContain('common:request_more');
    root.unmount();
    host.remove();
  });
});
