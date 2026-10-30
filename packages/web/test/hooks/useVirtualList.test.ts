// @vitest-environment jsdom

import React, { useLayoutEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStaticVirtualList, useVirtualList } from '../../hooks/useVirtualList';

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

vi.mock('ahooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ahooks')>()),
  useSize: () => ({ height: 60, width: 100 })
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

const StaticHarness = ({ data, visible = true }: { data: number[]; visible?: boolean }) => {
  const { containerRef, virtualDataList, topPlaceholderHeight, bottomPlaceholderHeight } =
    useStaticVirtualList({ data, itemHeight: 20, overscan: 2 });

  if (!visible) return null;

  return React.createElement(
    'div',
    { ref: containerRef, 'data-testid': 'static-list' },
    React.createElement('div', {
      'data-testid': 'top-placeholder',
      'data-height': topPlaceholderHeight
    }),
    ...virtualDataList.map(({ data: item, index }) =>
      React.createElement('div', { key: index, 'data-index': index, 'data-value': item }, item)
    ),
    React.createElement('div', {
      'data-testid': 'bottom-placeholder',
      'data-height': bottomPlaceholderHeight
    })
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

  it('keeps virtual indices and spacers in sync when scrolling and remounting the container', async () => {
    const { host, root } = createTestRoot();
    const originalClientHeight = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientHeight'
    );
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const frameCallbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 0;

    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() {
        return this.dataset.testid === 'static-list' ? 60 : 0;
      }
    });
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      const id = ++nextFrameId;
      frameCallbacks.set(id, callback);
      return id;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => {
      frameCallbacks.delete(id);
    }) as typeof window.cancelAnimationFrame;

    const flushFrames = () => {
      const callbacks = [...frameCallbacks.values()];
      frameCallbacks.clear();
      callbacks.forEach((callback) => callback(0));
    };

    try {
      await act(async () => {
        root.render(
          React.createElement(StaticHarness, {
            data: Array.from({ length: 100 }, (_, index) => index)
          })
        );
        await Promise.resolve();
      });

      const container = host.querySelector<HTMLElement>('[data-testid="static-list"]');
      expect(container).not.toBeNull();
      expect(host.querySelectorAll('[data-index]')).toHaveLength(5);
      expect(
        host.querySelector('[data-testid="top-placeholder"]')?.getAttribute('data-height')
      ).toBe('0');
      expect(
        host.querySelector('[data-testid="bottom-placeholder"]')?.getAttribute('data-height')
      ).toBe('1900');
      if (!container) return;

      await act(async () => {
        container.scrollTop = 500;
        container.dispatchEvent(new Event('scroll'));
        flushFrames();
        await Promise.resolve();
      });

      expect(host.querySelector('[data-index="23"]')?.getAttribute('data-value')).toBe('23');
      expect(host.querySelector('[data-index="29"]')?.getAttribute('data-value')).toBe('29');
      expect(host.querySelectorAll('[data-index]')).toHaveLength(7);
      expect(
        host.querySelector('[data-testid="top-placeholder"]')?.getAttribute('data-height')
      ).toBe('460');
      expect(
        host.querySelector('[data-testid="bottom-placeholder"]')?.getAttribute('data-height')
      ).toBe('1400');

      // 模式切换只卸载滚动容器，hook 和同尺寸的完整数据仍保留在父组件中。
      const data = Array.from({ length: 100 }, (_, index) => index);
      const previousContainer = container;
      await act(async () => {
        root.render(React.createElement(StaticHarness, { data, visible: false }));
      });
      expect(host.querySelector('[data-testid="static-list"]')).toBeNull();

      await act(async () => {
        root.render(React.createElement(StaticHarness, { data }));
      });
      const remountedContainer = host.querySelector<HTMLElement>('[data-testid="static-list"]');
      expect(remountedContainer).not.toBeNull();
      expect(remountedContainer).not.toBe(previousContainer);
      expect(remountedContainer?.scrollTop).toBe(0);
      expect(host.querySelector('[data-index]')?.getAttribute('data-index')).toBe('0');
      expect(host.querySelectorAll('[data-index]')).toHaveLength(5);
      expect(
        host.querySelector('[data-testid="top-placeholder"]')?.getAttribute('data-height')
      ).toBe('0');
      expect(
        host.querySelector('[data-testid="bottom-placeholder"]')?.getAttribute('data-height')
      ).toBe('1900');
      if (!remountedContainer) return;

      // 新容器仍应绑定滚动监听，后续重排和滚动继续使用真实窗口。
      await act(async () => {
        remountedContainer.scrollTop = 500;
        remountedContainer.dispatchEvent(new Event('scroll'));
        flushFrames();
      });
      expect(host.querySelector('[data-index]')?.getAttribute('data-index')).toBe('23');

      await act(async () => {
        root.render(
          React.createElement(StaticHarness, {
            data: Array.from({ length: 100 }, (_, index) => 99 - index)
          })
        );
        await Promise.resolve();
      });
      expect(host.querySelector('[data-index="23"]')?.getAttribute('data-value')).toBe('76');

      await act(async () => {
        remountedContainer.scrollTop = 1980;
        remountedContainer.dispatchEvent(new Event('scroll'));
        flushFrames();
        await Promise.resolve();
      });
      expect(host.querySelector('[data-index="97"]')?.getAttribute('data-value')).toBe('2');
      expect(host.querySelector('[data-index="99"]')?.getAttribute('data-value')).toBe('0');
      expect(host.querySelectorAll('[data-index]')).toHaveLength(3);
      expect(
        host.querySelector('[data-testid="top-placeholder"]')?.getAttribute('data-height')
      ).toBe('1940');
      expect(
        host.querySelector('[data-testid="bottom-placeholder"]')?.getAttribute('data-height')
      ).toBe('0');
    } finally {
      await act(async () => root.unmount());
      host.remove();
      frameCallbacks.clear();
      window.requestAnimationFrame = originalRequestAnimationFrame;
      window.cancelAnimationFrame = originalCancelAnimationFrame;
      if (originalClientHeight) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).clientHeight;
      }
    }
  });
});
