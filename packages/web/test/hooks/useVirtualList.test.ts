// @vitest-environment jsdom

import React, { useLayoutEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVirtualList } from '../../hooks/useVirtualList';

const mocks = vi.hoisted(() => ({
  paginationState: {
    data: ['item'],
    total: 2,
    isLoading: false,
    error: null as Error | null,
    setData: vi.fn(),
    setTotal: vi.fn(),
    fetchData: vi.fn(),
    refreshList: vi.fn()
  }
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('../../hooks/useScrollPagination', () => ({
  useScrollPagination: () => mocks.paginationState
}));

vi.mock('@chakra-ui/react', () => ({
  Box: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    function MockBox({ children, ...props }, ref) {
      return React.createElement('div', { ...props, ref }, children);
    }
  )
}));

type HarnessProps = {
  version: number;
};

const Harness = ({ version }: HarnessProps) => {
  const state = useVirtualList(vi.fn(), {
    itemHeight: 40,
    pageSize: 10
  });

  useLayoutEffect(() => {
    const container = state.containerRef.current;
    if (!container) return;

    Object.defineProperty(container, 'clientHeight', {
      configurable: true,
      value: 100
    });
    Object.defineProperty(container, 'scrollHeight', {
      configurable: true,
      value: 100
    });
  }, [state.containerRef, version]);

  return React.createElement(
    state.ScrollList,
    { 'data-testid': 'scroll-list' },
    React.createElement('div', { key: version }, mocks.paginationState.data.join(','))
  );
};

const createTestRoot = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return { host, root: createRoot(host) };
};

const renderHarness = async (root: Root, version: number) => {
  await act(async () => {
    root.render(React.createElement(Harness, { version }));
    await Promise.resolve();
  });
};

describe('useVirtualList', () => {
  beforeEach(() => {
    mocks.paginationState.data = ['item'];
    mocks.paginationState.total = 2;
    mocks.paginationState.isLoading = false;
    mocks.paginationState.error = null;
    mocks.paginationState.fetchData.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('stops automatic pagination after a failed request', async () => {
    const { host, root } = createTestRoot();
    await renderHarness(root, 0);

    mocks.paginationState.fetchData.mockClear();
    mocks.paginationState.isLoading = true;
    await renderHarness(root, 1);

    mocks.paginationState.fetchData.mockClear();
    mocks.paginationState.isLoading = false;
    mocks.paginationState.error = new Error('request failed');
    await renderHarness(root, 2);

    expect(mocks.paginationState.fetchData).not.toHaveBeenCalled();

    mocks.paginationState.error = null;
    // 错误恢复后由 useVirtualList 自动触发分页；不要再手动触发，避免与 effect 竞态导致重复请求。
    await renderHarness(root, 3);
    expect(mocks.paginationState.fetchData).toHaveBeenCalledTimes(1);

    root.unmount();
    host.remove();
  });

  it('continues automatic pagination when a successful response changes the data', async () => {
    const { host, root } = createTestRoot();
    await renderHarness(root, 0);
    mocks.paginationState.fetchData.mockClear();

    mocks.paginationState.data = ['updated'];
    await renderHarness(root, 1);

    expect(mocks.paginationState.fetchData).toHaveBeenCalled();
    root.unmount();
    host.remove();
  });
});
