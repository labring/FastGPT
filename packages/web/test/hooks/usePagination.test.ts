// @vitest-environment jsdom

import React, { useEffect, useLayoutEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaginationProps, PaginationResponse } from '@fastgpt/global/openapi/api';
import { scrollPaginationContentToTop, usePagination } from '../../hooks/usePagination';

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
    function MockBox({ children, as = 'div', ...props }, ref) {
      const domProps = Object.fromEntries(
        Object.entries(props).filter(
          ([key]) =>
            ['id', 'type', 'disabled', 'onClick', 'onScroll', 'title'].includes(key) ||
            key.startsWith('aria-')
        )
      );
      return React.createElement(as as React.ElementType, { ...domProps, ref }, children);
    }
  ),
  Flex: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    function MockFlex({ children, as = 'div', ...props }, ref) {
      const domProps = Object.fromEntries(
        Object.entries(props).filter(
          ([key]) =>
            ['id', 'type', 'disabled', 'onClick', 'title'].includes(key) || key.startsWith('aria-')
        )
      );
      return React.createElement(as as React.ElementType, { ...domProps, ref }, children);
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

describe('scrollPaginationContentToTop', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('returns the desktop table body to the top without moving an outer scroller', () => {
    const outer = document.createElement('div');
    const body = document.createElement('div');
    outer.append(body);
    document.body.append(outer);
    for (const element of [outer, body]) {
      element.style.overflowY = 'auto';
      Object.defineProperties(element, {
        scrollHeight: { configurable: true, value: 1000 },
        clientHeight: { configurable: true, value: 100 }
      });
      element.scrollTop = 500;
    }
    scrollPaginationContentToTop(body);
    expect(body.scrollTop).toBe(0);
    expect(outer.scrollTop).toBe(500);
  });

  it('returns the mobile page ancestor to the top when the table has no vertical overflow', () => {
    const outer = document.createElement('div');
    const body = document.createElement('div');
    outer.append(body);
    document.body.append(outer);
    outer.style.overflowY = 'auto';
    Object.defineProperties(outer, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 100 }
    });
    outer.scrollTop = 500;
    scrollPaginationContentToTop(body);
    expect(outer.scrollTop).toBe(0);
  });

  it('falls back to the document scroller and ignores a missing content target', () => {
    const body = document.createElement('div');
    document.body.append(body);
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true,
      value: document.documentElement
    });
    try {
      document.documentElement.scrollTop = 500;
      scrollPaginationContentToTop(undefined);
      expect(document.documentElement.scrollTop).toBe(500);
      scrollPaginationContentToTop(body);
      expect(document.documentElement.scrollTop).toBe(0);
    } finally {
      Reflect.deleteProperty(document, 'scrollingElement');
    }
  });
});

type TestItem = string;
type TestResponse = PaginationResponse<TestItem>;
type TestRequest = {
  params: PaginationProps;
  resolve: (response: TestResponse) => void;
  reject: (error: unknown) => void;
};

const createDeferredApi = () => {
  const requests: TestRequest[] = [];
  const api = vi.fn((params: PaginationProps) => {
    return new Promise<TestResponse>((resolve, reject) => {
      requests.push({ params, resolve, reject });
    });
  });

  return { api, requests };
};

type HarnessProps = {
  api: (params: PaginationProps) => Promise<TestResponse>;
  onState: (state: ReturnType<typeof usePagination<unknown, TestItem>>) => void;
  type?: 'button' | 'scroll';
};

const Harness = ({ api, onState, type = 'scroll' }: HarnessProps) => {
  const state = usePagination(api, {
    type,
    defaultPageSize: 1
  });

  useLayoutEffect(() => {
    const container = document.querySelector('#scroll-data');
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
    React.Fragment,
    null,
    React.createElement(
      state.ScrollData,
      // children 由第三个参数传入，补齐 createElement 对必需 props 的类型约束。
      { id: 'scroll-data' } as React.ComponentProps<typeof state.ScrollData>,
      React.createElement('span', null, state.data.join(','))
    ),
    type === 'button' ? React.createElement(state.Pagination) : null
  );
};

const renderHarness = async (root: Root, props: HarnessProps) => {
  await act(async () => {
    root.render(React.createElement(Harness, props));
    await Promise.resolve();
  });
};

describe('usePagination', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal('React', React);
    vi.useFakeTimers();
    mocks.router.query = {};
    mocks.toast.mockReset();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stops automatic retries after a failed scroll page and allows manual retry', async () => {
    const { api, requests } = createDeferredApi();
    const onState = vi.fn();

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
  });

  it('routes shared pagination clicks through the hook and scrolls after a successful page change', async () => {
    const { api, requests } = createDeferredApi();
    const onState = vi.fn();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    container.style.overflowY = 'auto';
    Object.defineProperties(container, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 100 }
    });
    await renderHarness(root, { api, onState, type: 'button' });
    await act(async () => requests[0].resolve({ list: ['first'], total: 3 }));
    container.scrollTop = 500;

    const next = () =>
      container.querySelector<HTMLButtonElement>('[aria-label="common:next_page"]')!;
    await act(async () => next().click());
    expect(requests[1]?.params.pageNum).toBe(2);
    expect(next().disabled).toBe(true);
    await act(async () => next().click());
    expect(requests).toHaveLength(2);
    await act(async () => requests[1].resolve({ list: ['second'], total: 3 }));

    expect(onState.mock.lastCall?.[0]).toMatchObject({ data: ['second'], pageNum: 2 });
    expect(container.scrollTop).toBe(0);
    expect(next().disabled).toBe(false);
  });

  it.each([
    { label: 'missing response', response: undefined },
    { label: 'null response', response: null },
    { label: 'missing list', response: { total: 10 } },
    { label: 'null list', response: { total: 10, list: null } },
    { label: 'non-array list', response: { total: 10, list: {} } }
  ])('preserves the current page on $label and allows retry', async ({ response }) => {
    const { api, requests } = createDeferredApi();
    const onState = vi.fn<HarnessProps['onState']>();
    await renderHarness(root, { api, onState, type: 'button' });

    await act(async () => requests[0].resolve({ list: ['first'], total: 2 }));
    await act(async () => {
      void onState.mock.lastCall?.[0].getData(2);
    });
    await act(async () => {
      // 模拟接口违反 TypeScript 合约的实际响应，校验状态不会被污染。
      requests[1].resolve(response as TestResponse);
    });

    expect(onState.mock.lastCall?.[0]).toMatchObject({
      data: ['first'],
      total: 2,
      pageNum: 1,
      isLoading: false,
      error: expect.any(Error)
    });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));

    await act(async () => {
      void onState.mock.lastCall?.[0].getData(2);
    });
    await act(async () => requests[2].resolve({ list: ['second'], total: 2 }));
    expect(onState.mock.lastCall?.[0]).toMatchObject({
      data: ['second'],
      pageNum: 2,
      isLoading: false,
      error: null
    });
  });

  it('preserves scroll items on an invalid next page and accepts a valid empty refresh', async () => {
    const { api, requests } = createDeferredApi();
    const onState = vi.fn<HarnessProps['onState']>();
    await renderHarness(root, { api, onState });
    await act(async () => requests[0].resolve({ list: ['first'], total: 2 }));

    await act(async () => {
      void onState.mock.lastCall?.[0].getData(2);
    });
    await act(async () => requests[1].resolve({ total: 10 } as TestResponse));
    expect(onState.mock.lastCall?.[0]).toMatchObject({
      data: ['first'],
      total: 2,
      pageNum: 1,
      isLoading: false,
      error: expect.any(Error)
    });

    await act(async () => {
      void onState.mock.lastCall?.[0].getData(1);
    });
    await act(async () => requests[2].resolve({ list: [], total: 0 }));
    expect(onState.mock.lastCall?.[0]).toMatchObject({
      data: [],
      total: 0,
      isLoading: false,
      error: null
    });
  });

  it.each([
    { reason: null, toastCount: 1 },
    { reason: { code: 'ERR_CANCELED' }, toastCount: 0 }
  ])('settles loading after rejection with $reason', async ({ reason, toastCount }) => {
    const { api, requests } = createDeferredApi();
    const onState = vi.fn<HarnessProps['onState']>();
    await renderHarness(root, { api, onState, type: 'button' });
    await act(async () => requests[0].reject(reason));
    expect(onState.mock.lastCall?.[0]).toMatchObject({ data: [], isLoading: false });
    expect(mocks.toast).toHaveBeenCalledTimes(toastCount);
  });
});
