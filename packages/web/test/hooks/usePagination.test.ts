// @vitest-environment jsdom

import React, { useEffect, useLayoutEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaginationProps, PaginationResponse } from '@fastgpt/global/openapi/api';
import { usePagination } from '../../hooks/usePagination';

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  router: {
    query: {},
    pathname: '/test'
  },
  toast: vi.fn()
}));

vi.mock('next/router', () => ({
  useRouter: () => mocks.router
}));

vi.mock('../../hooks/useSystem', () => ({
  useSystem: () => ({ isPc: false })
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ toast: mocks.toast })
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('../../components/common/Icon', () => ({
  default: () => null
}));

vi.mock('../../components/common/MyMenu', () => ({
  default: () => null
}));

vi.mock('@chakra-ui/react', () => ({
  Box: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    function MockBox({ children, ...props }, ref) {
      return React.createElement('div', { ...props, ref }, children);
    }
  ),
  Flex: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    function MockFlex({ children, ...props }, ref) {
      return React.createElement('div', { ...props, ref }, children);
    }
  )
}));

vi.mock('ahooks', async () => {
  const actual = await vi.importActual<typeof import('ahooks')>('ahooks');
  const { useEffect: useReactEffect } = await vi.importActual<typeof import('react')>('react');

  return {
    ...actual,
    useRequest: (
      service: () => Promise<unknown>,
      options: { manual?: boolean; refreshDeps?: unknown[] } = {}
    ) => {
      const refreshDepsKey = JSON.stringify(options.refreshDeps ?? []);

      useReactEffect(() => {
        if (options.manual === false) {
          void service();
        }
      }, [options.manual, refreshDepsKey]);

      return { runAsync: service };
    }
  };
});

type TestItem = string;
type TestResponse = PaginationResponse<TestItem>;
type TestRequest = {
  params: PaginationProps<undefined>;
  resolve: (response: TestResponse) => void;
  reject: (error: unknown) => void;
};

const createDeferredApi = () => {
  const requests: TestRequest[] = [];
  const api = vi.fn((params: PaginationProps<undefined>) => {
    return new Promise<TestResponse>((resolve, reject) => {
      requests.push({ params, resolve, reject });
    });
  });

  return { api, requests };
};

type HarnessProps = {
  api: (params: PaginationProps<undefined>) => Promise<TestResponse>;
  onState: (state: ReturnType<typeof usePagination<TestItem, TestItem>>) => void;
};

const Harness = ({ api, onState }: HarnessProps) => {
  const state = usePagination(api, {
    type: 'scroll',
    defaultPageSize: 1
  });

  useLayoutEffect(() => {
    const container = document.querySelector('[data-testid="scroll-data"]');
    if (!(container instanceof HTMLDivElement)) return;

    Object.defineProperty(container, 'clientHeight', {
      configurable: true,
      value: 100
    });
    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 100
    });
  });

  useEffect(() => onState(state), [onState, state]);

  return React.createElement(
    state.ScrollData,
    { 'data-testid': 'scroll-data' },
    React.createElement('span', null, state.data.join(','))
  );
};

const renderHarness = async (root: Root, props: HarnessProps) => {
  await act(async () => {
    root.render(React.createElement(Harness, props));
    await Promise.resolve();
  });
};

describe('usePagination', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
    vi.useFakeTimers();
    mocks.router.query = {};
    mocks.toast.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stops automatic retries after a failed scroll page and allows manual retry', async () => {
    const { api, requests } = createDeferredApi();
    const onState = vi.fn();
    const root = createRoot(document.createElement('div'));

    await renderHarness(root, { api, onState });
    expect(requests[0]?.params.pageNum).toBe(1);

    await act(async () => {
      requests[0].resolve({ list: ['first'], total: 2 });
      await Promise.resolve();
      vi.advanceTimersByTime(60);
      await Promise.resolve();
    });

    expect(requests[1]?.params.pageNum).toBe(2);

    await act(async () => {
      requests[1].reject(new Error('request failed'));
      await Promise.resolve();
      vi.advanceTimersByTime(60);
      await Promise.resolve();
    });

    expect(requests).toHaveLength(2);
    expect(onState.mock.lastCall?.[0].error).toBeInstanceOf(Error);

    await act(async () => {
      onState.mock.lastCall?.[0].getData(2);
      await Promise.resolve();
    });

    expect(requests).toHaveLength(3);
    expect(requests[2]?.params.pageNum).toBe(2);
    root.unmount();
  });
});
