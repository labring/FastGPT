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
  default: () => null
}));

vi.mock('@chakra-ui/react', () => ({
  Box: () => null
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
};

type HarnessProps = {
  query: string;
  api: (params: ListParams, controller?: AbortController) => Promise<ListResponse>;
  onState: (state: ReturnType<typeof useScrollPagination<ListParams, ListResponse>>) => void;
};

const Harness = ({ query, api, onState }: HarnessProps) => {
  const state = useScrollPagination(api, {
    pageSize: 10,
    params: { query },
    refreshDeps: [query],
    showErrorToast: false
  });

  useEffect(() => onState(state), [onState, state]);

  return null;
};

const createDeferredApi = () => {
  const requests: RequestRecord[] = [];
  const api = vi.fn((params: ListParams, controller?: AbortController) => {
    return new Promise<ListResponse>((resolve) => {
      requests.push({ params, controller, resolve });
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
});
