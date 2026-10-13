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

const waitForPaginationEffects = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
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
    await waitForPaginationEffects();
    mocks.paginationState.isLoading = true;
    await renderHarness(root, 1);

    mocks.paginationState.fetchData.mockClear();
    mocks.paginationState.isLoading = false;
    mocks.paginationState.error = new Error('request failed');
    await renderHarness(root, 2);

    expect(mocks.paginationState.fetchData).not.toHaveBeenCalled();

    mocks.paginationState.error = null;
    // 错误恢复后由 useVirtualList 自动触发分页，不要再手动触发。
    // 这里只断言"恢复了自动分页"：容器未撑满的 effect 和滚动节流 effect 都可能在同一次
    // passive effect flush 中触发，去重由 useScrollPagination 负责，而本用例把它整体 mock 掉了，
    // 因此调用次数取决于两个 effect 的调度时序，断言精确次数会产生 flaky。
    await renderHarness(root, 3);
    expect(mocks.paginationState.fetchData).toHaveBeenCalled();

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
