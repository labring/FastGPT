// @vitest-environment jsdom

import React, { useLayoutEffect, useRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVirtualGridList } from '../../hooks/useVirtualGridList';

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@chakra-ui/react', () => ({
  Box: React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    function MockBox({ children, ...props }, ref) {
      return React.createElement('div', { ...props, ref }, children);
    }
  )
}));

type TestItem = {
  id: number;
};

type ObserverInstance = {
  root: Element | null;
};

class MockIntersectionObserver {
  static instances: ObserverInstance[] = [];

  root: Element | null;

  constructor(_callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.root = options?.root instanceof Element ? options.root : null;
    MockIntersectionObserver.instances.push(this);
  }

  observe() {}

  disconnect() {}
}

const animationFrameCallbacks = new Map<number, FrameRequestCallback>();
let nextAnimationFrameId = 0;

const flushAnimationFrames = () => {
  const callbacks = [...animationFrameCallbacks.values()];
  animationFrameCallbacks.clear();
  callbacks.forEach((callback) => callback(0));
};

const createItems = (count: number): TestItem[] =>
  Array.from({ length: count }, (_, id) => ({ id }));

type HarnessProps = {
  list: TestItem[];
  itemHeight?: number;
  selectedId?: number;
};

type DelayedScrollContainerHarnessProps = {
  list: TestItem[];
  mountScrollContainer: boolean;
  scrollContainerKey: string;
};

const Harness = ({ list, itemHeight = 40, selectedId }: HarnessProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { gridRef, renderVirtualGridItems } = useVirtualGridList({
    list,
    listKey: 'test-list',
    scrollContainerRef,
    batchRows: 2,
    defaultColumnCount: 2,
    estimatedRowHeight: 40,
    estimatedRowGap: 10,
    overscanRows: 0
  });

  useLayoutEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const grid = gridRef.current;
    if (!scrollContainer || !grid) return;

    Object.defineProperty(scrollContainer, 'clientHeight', {
      configurable: true,
      value: 100
    });
    Object.defineProperty(grid, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        bottom: -scrollContainer.scrollTop,
        height: 0,
        left: 0,
        right: 0,
        top: -scrollContainer.scrollTop,
        width: 0,
        x: 0,
        y: -scrollContainer.scrollTop,
        toJSON: () => ({})
      })
    });

    const virtualItem = grid.querySelector('[data-virtual-item]');
    if (virtualItem) {
      Object.defineProperty(virtualItem, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          bottom: itemHeight,
          height: itemHeight,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({})
        })
      });
    }
  }, [gridRef, itemHeight]);

  return React.createElement(
    'div',
    { ref: scrollContainerRef, 'data-testid': 'scroll-container' },
    React.createElement(
      'div',
      { ref: gridRef },
      renderVirtualGridItems((item) =>
        React.createElement(
          'div',
          {
            key: item.id,
            'data-item-id': item.id,
            'data-selected': item.id === selectedId ? 'true' : 'false',
            'data-virtual-item': ''
          },
          React.createElement('button', { 'data-item-action': item.id }, item.id)
        )
      )
    )
  );
};

const DelayedScrollContainerHarness = ({
  list,
  mountScrollContainer,
  scrollContainerKey
}: DelayedScrollContainerHarnessProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { gridRef, renderVirtualGridItems } = useVirtualGridList({
    list,
    listKey: 'delayed-list',
    scrollContainerRef,
    batchRows: 2,
    defaultColumnCount: 2,
    estimatedRowHeight: 40,
    estimatedRowGap: 10,
    overscanRows: 0
  });

  if (!mountScrollContainer) return null;

  return React.createElement(
    'div',
    {
      key: scrollContainerKey,
      ref: scrollContainerRef,
      'data-testid': 'scroll-container',
      style: { overflowAnchor: 'auto' }
    },
    React.createElement(
      'div',
      { ref: gridRef },
      renderVirtualGridItems((item) =>
        React.createElement(
          'div',
          { key: item.id, 'data-item-id': item.id, 'data-virtual-item': '' },
          item.id
        )
      )
    )
  );
};

const renderHarness = async (root: Root) => {
  await act(async () => {
    root.render(React.createElement(Harness, { list: createItems(100) }));
    await Promise.resolve();
  });
};

const createTestRoot = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return { host, root: createRoot(host) };
};

describe('useVirtualGridList', () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    animationFrameCallbacks.clear();
    nextAnimationFrameId = 0;
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      const id = ++nextAnimationFrameId;
      animationFrameCallbacks.set(id, callback);
      return id;
    }) as typeof window.requestAnimationFrame;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the scroll container viewport and renders the last row at the bottom', async () => {
    const { host, root } = createTestRoot();
    await renderHarness(root);
    await act(async () => {
      flushAnimationFrames();
      await Promise.resolve();
    });

    const scrollContainer = host.querySelector('[data-testid="scroll-container"]');
    expect(scrollContainer).toBeInstanceOf(HTMLDivElement);
    if (!(scrollContainer instanceof HTMLDivElement)) return;

    await act(async () => {
      scrollContainer.scrollTop = 2390;
      scrollContainer.dispatchEvent(new Event('scroll'));
      flushAnimationFrames();
      await Promise.resolve();
    });

    expect(scrollContainer.querySelector('[data-item-id="99"]')).not.toBeNull();
    root.unmount();
    host.remove();
  });

  it('uses the actual scroll container as the intersection observer root', async () => {
    const { host, root } = createTestRoot();
    await renderHarness(root);

    const scrollContainer = host.querySelector('[data-testid="scroll-container"]');
    expect(scrollContainer).toBeInstanceOf(HTMLDivElement);
    expect(MockIntersectionObserver.instances).not.toHaveLength(0);
    expect((MockIntersectionObserver.instances[0]?.root as HTMLElement)?.dataset.testid).toBe(
      'scroll-container'
    );
    root.unmount();
    host.remove();
  });

  it('keeps the scroll anchor when the measured row height changes', async () => {
    const { host, root } = createTestRoot();
    await renderHarness(root);
    await act(async () => {
      flushAnimationFrames();
      await Promise.resolve();
    });

    const scrollContainer = host.querySelector('[data-testid="scroll-container"]');
    expect(scrollContainer).toBeInstanceOf(HTMLDivElement);
    if (!(scrollContainer instanceof HTMLDivElement)) return;

    await act(async () => {
      scrollContainer.scrollTop = 500;
      scrollContainer.dispatchEvent(new Event('scroll'));
      flushAnimationFrames();
      await Promise.resolve();
    });

    await act(async () => {
      root.render(
        React.createElement(Harness, {
          itemHeight: 60,
          list: createItems(100)
        })
      );
      await Promise.resolve();
    });
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      await Promise.resolve();
    });

    expect(scrollContainer.scrollTop).toBe(700);
    root.unmount();
    host.remove();
  });

  it('does not reset scroll position when an item re-renders', async () => {
    const { host, root } = createTestRoot();
    await renderHarness(root);
    await act(async () => {
      flushAnimationFrames();
      await Promise.resolve();
    });

    const scrollContainer = host.querySelector('[data-testid="scroll-container"]');
    expect(scrollContainer).toBeInstanceOf(HTMLDivElement);
    if (!(scrollContainer instanceof HTMLDivElement)) return;

    await act(async () => {
      scrollContainer.scrollTop = 500;
      scrollContainer.dispatchEvent(new Event('scroll'));
      flushAnimationFrames();
      await Promise.resolve();
    });

    const itemAction = scrollContainer.querySelector('[data-item-action="20"]');
    expect(itemAction).toBeInstanceOf(HTMLButtonElement);
    if (!(itemAction instanceof HTMLButtonElement)) return;
    itemAction.focus();

    await act(async () => {
      root.render(
        React.createElement(Harness, {
          list: createItems(100),
          selectedId: 20
        })
      );
      await Promise.resolve();
    });

    expect(scrollContainer.scrollTop).toBe(500);
    expect(scrollContainer.querySelector('[data-selected="true"]')).not.toBeNull();
    expect(document.activeElement).toBe(itemAction);
    expect(scrollContainer.style.overflowAnchor).toBe('none');
    root.unmount();
    host.remove();
  });

  it('blurs a focused grid action before changing the virtual window', async () => {
    const { host, root } = createTestRoot();
    await renderHarness(root);
    await act(async () => {
      flushAnimationFrames();
      await Promise.resolve();
    });

    const scrollContainer = host.querySelector('[data-testid="scroll-container"]');
    const itemAction = scrollContainer?.querySelector('[data-item-action="0"]');
    expect(scrollContainer).toBeInstanceOf(HTMLDivElement);
    expect(itemAction).toBeInstanceOf(HTMLButtonElement);
    if (
      !(scrollContainer instanceof HTMLDivElement) ||
      !(itemAction instanceof HTMLButtonElement)
    ) {
      return;
    }
    itemAction.focus();

    await act(async () => {
      scrollContainer.scrollTop = 500;
      scrollContainer.dispatchEvent(new Event('scroll'));
      flushAnimationFrames();
      await Promise.resolve();
    });

    expect(document.activeElement).not.toBe(itemAction);
    expect(scrollContainer.scrollTop).toBe(500);
    root.unmount();
    host.remove();
  });

  it('keeps focus outside the grid when changing the virtual window', async () => {
    const { host, root } = createTestRoot();
    await renderHarness(root);
    await act(async () => {
      flushAnimationFrames();
      await Promise.resolve();
    });

    const scrollContainer = host.querySelector('[data-testid="scroll-container"]');
    expect(scrollContainer).toBeInstanceOf(HTMLDivElement);
    if (!(scrollContainer instanceof HTMLDivElement)) return;

    const externalAction = document.createElement('button');
    document.body.appendChild(externalAction);
    externalAction.focus();

    await act(async () => {
      scrollContainer.scrollTop = 500;
      scrollContainer.dispatchEvent(new Event('scroll'));
      flushAnimationFrames();
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(externalAction);
    externalAction.remove();
    root.unmount();
    host.remove();
  });

  it('binds overflow anchoring when the scroll container mounts later', async () => {
    const { host, root } = createTestRoot();
    await act(async () => {
      root.render(
        React.createElement(DelayedScrollContainerHarness, {
          list: createItems(100),
          mountScrollContainer: false,
          scrollContainerKey: 'first'
        })
      );
      await Promise.resolve();
    });

    await act(async () => {
      root.render(
        React.createElement(DelayedScrollContainerHarness, {
          list: createItems(100),
          mountScrollContainer: true,
          scrollContainerKey: 'first'
        })
      );
      await Promise.resolve();
    });

    const scrollContainer = host.querySelector('[data-testid="scroll-container"]');
    expect(scrollContainer).toBeInstanceOf(HTMLDivElement);
    if (!(scrollContainer instanceof HTMLDivElement)) return;
    expect(scrollContainer.style.overflowAnchor).toBe('none');

    root.unmount();
    host.remove();
  });

  it('restores the old node when the scroll container is replaced and unmounts', async () => {
    const { host, root } = createTestRoot();
    await act(async () => {
      root.render(
        React.createElement(DelayedScrollContainerHarness, {
          list: createItems(100),
          mountScrollContainer: true,
          scrollContainerKey: 'first'
        })
      );
      await Promise.resolve();
    });

    const oldScrollContainer = host.querySelector('[data-testid="scroll-container"]');
    expect(oldScrollContainer).toBeInstanceOf(HTMLDivElement);
    if (!(oldScrollContainer instanceof HTMLDivElement)) return;

    await act(async () => {
      root.render(
        React.createElement(DelayedScrollContainerHarness, {
          list: createItems(100),
          mountScrollContainer: true,
          scrollContainerKey: 'second'
        })
      );
      await Promise.resolve();
    });

    const newScrollContainer = host.querySelector('[data-testid="scroll-container"]');
    expect(newScrollContainer).toBeInstanceOf(HTMLDivElement);
    if (!(newScrollContainer instanceof HTMLDivElement)) return;
    expect(oldScrollContainer.style.overflowAnchor).toBe('auto');
    expect(newScrollContainer.style.overflowAnchor).toBe('none');

    root.unmount();
    expect(newScrollContainer.style.overflowAnchor).toBe('auto');
    host.remove();
  });
});
