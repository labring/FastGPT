// @vitest-environment jsdom

import React, { act, useMemo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkedPaginationProps } from '@fastgpt/global/openapi/api';
import { useLinkedScroll } from '../../hooks/useLinkedScroll';
import MyBox from '../../components/common/MyBox';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../../components/common/MyLoading', () => ({
  default: () => React.createElement('div', { 'data-loading-overlay': '' })
}));
vi.mock('@chakra-ui/react', () => ({
  Box: React.forwardRef<
    HTMLDivElement,
    React.PropsWithChildren<{
      id?: string;
      overflow?: string;
      onScroll?: React.UIEventHandler<HTMLDivElement>;
    }>
  >(function ScrollContainer({ children, id, overflow, onScroll }, ref) {
    return React.createElement(
      'div',
      {
        id,
        onScroll,
        'data-overflow': overflow,
        ref: (element: HTMLDivElement | null) => {
          if (element && !element.scrollTo) element.scrollTo = vi.fn();
          if (typeof ref === 'function') ref(element);
          else if (ref) ref.current = element;
        }
      },
      children
    );
  })
}));

type Response = {
  list: { id: string }[];
  hasMorePrev: boolean;
  hasMoreNext: boolean;
};
type Params = LinkedPaginationProps<{ chatId: string }>;
type HarnessProps = {
  chatId: string;
  renderInitialOverlay?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
};

describe('useLinkedScroll', () => {
  let root: Root;
  let state: ReturnType<typeof useLinkedScroll<Params, Response>>;
  let requests: { params: Params; resolve: (response: Response) => void }[];
  let container: HTMLDivElement;

  const api = vi.fn(
    (params: Params) => new Promise<Response>((resolve) => requests.push({ params, resolve }))
  );
  const Harness = ({ chatId, renderInitialOverlay = true, scrollRef, onScroll }: HarnessProps) => {
    const params = useMemo(() => ({ chatId }), [chatId]);
    state = useLinkedScroll(api, { params, showErrorToast: false });
    const scrollProps = {
      id: 'scroll-viewport',
      ScrollContainerRef: scrollRef,
      onScroll,
      children: [
        'Composer',
        React.createElement('input', { key: 'draft', defaultValue: 'draft' }),
        ...state.dataList.map(({ id }) =>
          React.createElement('div', {
            key: id,
            ref: (element: HTMLDivElement | null) => {
              state.itemRefs.current.set(id, element);
            }
          })
        )
      ]
    };
    return React.createElement(
      MyBox,
      {
        id: 'scroll-shell',
        position: 'relative',
        overflow: 'hidden',
        isLoading: renderInitialOverlay && state.isInitialLoading
      },
      React.createElement(state.ScrollData, scrollProps)
    );
  };
  const render = async (chatId: string, props: Omit<HarnessProps, 'chatId'> = {}) => {
    await act(async () => root.render(React.createElement(Harness, { chatId, ...props })));
  };
  const resolve = async (index: number, id: string) => {
    await act(async () =>
      requests[index].resolve({ list: [{ id }], hasMorePrev: false, hasMoreNext: false })
    );
  };

  beforeEach(() => {
    // web workspace 的 Vitest 使用 classic JSX；生产 Next 构建使用自动 JSX runtime。
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    requests = [];
    api.mockClear();
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps local replacement and new anchors when an older pagination request finishes', async () => {
    vi.useFakeTimers();
    await render('first');
    await act(async () =>
      requests[0].resolve({
        list: [{ id: 'old-anchor' }],
        hasMorePrev: true,
        hasMoreNext: false
      })
    );
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(requests[1].params.prevId).toBe('old-anchor');

    await act(async () =>
      state.replaceDataList({
        list: [{ id: 'retained-anchor' }],
        hasMorePrev: true,
        hasMoreNext: false
      })
    );
    await act(async () =>
      requests[1].resolve({
        list: [{ id: 'deleted-stale-record' }],
        hasMorePrev: false,
        hasMoreNext: false
      })
    );
    expect(state.dataList).toEqual([{ id: 'retained-anchor' }]);
    expect(state.itemRefs.current.get('old-anchor')).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(requests[2].params.prevId).toBe('retained-anchor');
    await act(async () =>
      requests[2].resolve({
        list: [{ id: 'previous-record' }],
        hasMorePrev: false,
        hasMoreNext: false
      })
    );
    expect(state.dataList).toEqual([{ id: 'previous-record' }, { id: 'retained-anchor' }]);
  });

  it('clears pagination anchors when the complete window is removed locally', async () => {
    vi.useFakeTimers();
    await render('first');
    await resolve(0, 'first-record');
    await act(async () =>
      state.replaceDataList({ list: [], hasMorePrev: false, hasMoreNext: false })
    );
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(state.dataList).toEqual([]);
    expect(state.itemRefs.current.get('first-record')).toBeNull();
    expect(requests).toHaveLength(1);
  });

  it('loads once on mount and ignores renders with unchanged params', async () => {
    await render('first');
    await render('first');
    expect(requests).toHaveLength(1);
    await resolve(0, 'first-record');
    expect(state.dataList).toEqual([{ id: 'first-record' }]);
  });

  it('loads the new chat before the first request settles and ignores the stale response', async () => {
    await render('first');
    await render('second');
    expect(requests.map(({ params }) => params.chatId)).toEqual(['first', 'second']);

    await resolve(1, 'second-record');
    await resolve(0, 'first-record');
    expect(state.dataList).toEqual([{ id: 'second-record' }]);
  });

  it('clears the previous records when switching after initialization', async () => {
    await render('first');
    await resolve(0, 'first-record');
    await render('second');
    expect(state.dataList).toEqual([]);
    expect(requests).toHaveLength(2);
    await resolve(1, 'second-record');
    expect(state.dataList).toEqual([{ id: 'second-record' }]);
  });

  it.each([undefined, false])(
    'leaves initial loading presentation to the outer layout: %s',
    async (renderInitialOverlay) => {
      await render('first', { renderInitialOverlay });
      expect(!!container.querySelector('[data-loading-overlay]')).toBe(
        renderInitialOverlay !== false
      );
      expect(container.textContent).toBe('Composer');
      await resolve(0, 'first-record');
      expect(container.querySelector('[data-loading-overlay]')).toBeNull();

      await render('second', { renderInitialOverlay });
      expect(!!container.querySelector('[data-loading-overlay]')).toBe(
        renderInitialOverlay !== false
      );
      await resolve(1, 'second-record');
      expect(container.querySelector('[data-loading-overlay]')).toBeNull();
    }
  );

  it('keeps the overlay outside the viewport and preserves its ref, draft and scroll position across refreshes', async () => {
    const scrollRef = React.createRef<HTMLDivElement>();
    const scrollTargets: EventTarget[] = [];
    const onScroll = vi.fn((event: React.UIEvent<HTMLDivElement>) => {
      scrollTargets.push(event.currentTarget);
    });
    await render('first', { scrollRef, onScroll });
    const component = state.ScrollData;
    const viewport = scrollRef.current!;
    const draft = container.querySelector('input')!;
    const shell = container.querySelector('#scroll-shell');
    expect(viewport.id).toBe('scroll-viewport');
    expect(viewport.parentElement).toBe(shell);
    expect(viewport.getAttribute('data-overflow')).toBe('auto');
    expect(shell?.getAttribute('data-overflow')).toBe('hidden');
    expect(container.querySelector('[data-loading-overlay]')?.parentElement).toBe(shell);
    viewport.scrollTop = 300;
    draft.value = 'unsaved draft';

    await resolve(0, 'first-record');
    expect(state.ScrollData).toBe(component);
    expect(scrollRef.current).toBe(viewport);
    expect(container.querySelector('input')).toBe(draft);
    expect(draft.value).toBe('unsaved draft');
    expect(viewport.scrollTop).toBe(300);
    expect(container.querySelector('[data-loading-overlay]')).toBeNull();

    await act(async () => {
      void state.loadInitData({ refresh: true, scrollWhenFinish: false });
    });
    const overlay = container.querySelector('[data-loading-overlay]');
    expect(overlay?.parentElement).toBe(shell);
    expect(viewport.contains(overlay)).toBe(false);
    expect(scrollRef.current).toBe(viewport);
    await resolve(1, 'refreshed-record');
    expect(scrollRef.current).toBe(viewport);
    expect(viewport.scrollTop).toBe(300);
    expect(draft.value).toBe('unsaved draft');
    await act(async () => viewport.dispatchEvent(new Event('scroll')));
    expect(onScroll).toHaveBeenCalledOnce();
    expect(scrollTargets).toEqual([viewport]);
  });

  it.each(['previous', 'next'] as const)(
    'shows only request text when loading the %s page',
    async (direction) => {
      vi.useFakeTimers();
      const scrollRef = React.createRef<HTMLDivElement>();
      await render('first', { scrollRef });
      expect(container.querySelector('[data-loading-overlay]')).not.toBeNull();
      await act(async () =>
        requests[0].resolve({
          list: [{ id: 'first-record' }],
          hasMorePrev: direction === 'previous',
          hasMoreNext: direction === 'next'
        })
      );
      const viewport = scrollRef.current!;
      const draft = container.querySelector('input')!;
      const scrollTop = direction === 'previous' ? 0 : 300;
      viewport.scrollTop = scrollTop;
      draft.value = 'unsaved';
      await act(async () => vi.advanceTimersByTimeAsync(250));
      expect(requests[1].params[direction === 'previous' ? 'prevId' : 'nextId']).toBe(
        'first-record'
      );
      expect(state.isLoading).toBe(true);
      expect(state.isInitialLoading).toBe(false);
      expect(state.isLoadingMore).toBe(true);
      expect(container.querySelector('[data-loading-overlay]')).toBeNull();
      expect(container.textContent).toContain('common:is_requesting');

      await resolve(1, 'next-record');
      expect(state.dataList).toEqual(
        (direction === 'previous'
          ? ['next-record', 'first-record']
          : ['first-record', 'next-record']
        ).map((id) => ({ id }))
      );
      expect(container.textContent).not.toContain('common:is_requesting');
      expect(scrollRef.current).toBe(viewport);
      expect(container.querySelector('input')).toBe(draft);
      expect(draft.value).toBe('unsaved');
      expect(viewport.scrollTop).toBe(scrollTop);
    }
  );
});
