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
  currentData?: { id: string };
  renderInitialOverlay?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  getScrollTarget?: (element: HTMLElement) => HTMLElement;
  renderScrollAnchor?: boolean;
};

describe('useLinkedScroll', () => {
  let root: Root;
  let state: ReturnType<typeof useLinkedScroll<Params, Response>>;
  let requests: { params: Params; resolve: (response: Response) => void }[];
  let container: HTMLDivElement;

  const api = vi.fn(
    (params: Params) => new Promise<Response>((resolve) => requests.push({ params, resolve }))
  );
  const Harness = ({
    chatId,
    currentData,
    renderInitialOverlay = true,
    scrollRef,
    onScroll,
    getScrollTarget,
    renderScrollAnchor = false
  }: HarnessProps) => {
    const params = useMemo(() => ({ chatId }), [chatId]);
    state = useLinkedScroll(api, { params, currentData, showErrorToast: false, getScrollTarget });
    const scrollProps = {
      id: 'scroll-viewport',
      ScrollContainerRef: scrollRef,
      onScroll,
      children: [
        'Composer',
        React.createElement('input', { key: 'draft', defaultValue: 'draft' }),
        ...state.dataList.map(({ id }) =>
          React.createElement(
            'div',
            {
              key: id,
              ref: (element: HTMLDivElement | null) => {
                state.itemRefs.current.set(id, element);
              }
            },
            renderScrollAnchor
              ? React.createElement('div', { 'data-chat-scroll-anchor': 'preview-' + id })
              : null
          )
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

  /** 调用方选择记录内部的方案节点，普通记录仍以自身作为定位目标。 */
  const getInnerScrollTarget = (element: HTMLElement) =>
    element.querySelector<HTMLElement>('[data-chat-scroll-anchor]') ?? element;

  /** 方案比消息开头低 771px，并保留容器偏移和当前滚动量，验证实际定位坐标。 */
  const mockScrollPositions = (viewport: HTMLDivElement) => {
    viewport.scrollTop = 300;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      const top = (() => {
        if (this === viewport) return 20;
        if (this.hasAttribute('data-chat-scroll-anchor')) return 891;
        return 120;
      })();
      return new DOMRect(0, top, 500, 400);
    });
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

  it.each(['prev', 'next'] as const)(
    'ignores an older %s page after a complete refresh replaces the window',
    async (direction) => {
      vi.useFakeTimers();
      await render('first');
      await act(async () =>
        requests[0].resolve({
          list: [{ id: 'old-anchor' }],
          hasMorePrev: direction === 'prev',
          hasMoreNext: direction === 'next'
        })
      );
      await act(async () => vi.advanceTimersByTimeAsync(250));
      expect(requests[1].params[direction === 'prev' ? 'prevId' : 'nextId']).toBe('old-anchor');

      await act(async () => {
        void state.loadInitData({ refresh: true, scrollWhenFinish: false });
      });
      await resolve(2, 'fresh-record');
      await act(async () =>
        requests[1].resolve({
          list: [{ id: 'stale-page' }],
          hasMorePrev: true,
          hasMoreNext: true
        })
      );
      expect(state.dataList).toEqual([{ id: 'fresh-record' }]);
      expect(state.hasMorePrev).toBe(false);
      expect(state.hasMoreNext).toBe(false);
      await act(async () => vi.advanceTimersByTimeAsync(250));
      expect(requests).toHaveLength(3);
    }
  );

  it('keeps the latest complete refresh when responses finish in reverse order', async () => {
    await render('first');
    await resolve(0, 'first-record');
    await act(async () => {
      void state.loadInitData({ refresh: true, scrollWhenFinish: false });
      void state.loadInitData({ refresh: true, scrollWhenFinish: false });
    });
    expect(requests).toHaveLength(3);

    await resolve(2, 'fresh-record');
    await act(async () =>
      requests[1].resolve({
        list: [{ id: 'stale-refresh' }],
        hasMorePrev: true,
        hasMoreNext: true
      })
    );
    expect(state.dataList).toEqual([{ id: 'fresh-record' }]);
    expect(state.hasMorePrev).toBe(false);
    expect(state.hasMoreNext).toBe(false);
    expect(container.querySelector('[data-loading-overlay]')).toBeNull();
  });

  it('keeps an in-flight page when focusing an already loaded record', async () => {
    vi.useFakeTimers();
    const scrollRef = React.createRef<HTMLDivElement>();
    await render('first', { currentData: { id: 'first-record' }, scrollRef });
    await act(async () =>
      requests[0].resolve({
        list: [{ id: 'first-record' }],
        hasMorePrev: true,
        hasMoreNext: false
      })
    );
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(requests[1].params.prevId).toBe('first-record');

    vi.mocked(scrollRef.current!.scrollTo).mockClear();
    await act(async () => {
      await state.loadInitData();
    });
    expect(requests).toHaveLength(2);
    expect(scrollRef.current!.scrollTo).toHaveBeenCalledOnce();

    await resolve(1, 'previous-record');
    expect(state.dataList).toEqual([{ id: 'previous-record' }, { id: 'first-record' }]);
  });

  describe('getScrollTarget', () => {
    it.each([
      {
        target: 'the inner preview',
        customTarget: true,
        renderScrollAnchor: true,
        expectedTop: 1171
      },
      {
        target: 'the record when no resolver is supplied',
        customTarget: false,
        renderScrollAnchor: true,
        expectedTop: 400
      },
      {
        target: 'the record when no preview exists',
        customTarget: true,
        renderScrollAnchor: false,
        expectedTop: 400
      }
    ])(
      'uses $target for initial restoration and scrollToItem',
      async ({ customTarget, renderScrollAnchor, expectedTop }) => {
        const scrollRef = React.createRef<HTMLDivElement>();
        const getScrollTarget = vi.fn(getInnerScrollTarget);
        await render('first', {
          currentData: { id: 'first-record' },
          scrollRef,
          renderScrollAnchor,
          getScrollTarget: customTarget ? getScrollTarget : undefined
        });
        const viewport = scrollRef.current!;
        mockScrollPositions(viewport);

        await resolve(0, 'first-record');
        expect(viewport.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: expectedTop });
        const record = state.itemRefs.current.get('first-record')!;
        expect(record.parentElement).toBe(viewport);
        if (customTarget) expect(getScrollTarget).toHaveBeenLastCalledWith(record);
        else expect(getScrollTarget).not.toHaveBeenCalled();

        vi.mocked(viewport.scrollTo).mockClear();
        await act(async () => state.scrollToItem('first-record'));
        expect(viewport.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: expectedTop });
        expect(state.itemRefs.current.get('first-record')).toBe(record);
        expect(requests).toHaveLength(1);
      }
    );

    it('uses the latest resolver without reloading records when the callback changes', async () => {
      const scrollRef = React.createRef<HTMLDivElement>();
      const props = { scrollRef, renderScrollAnchor: true };
      await render('first', props);
      const viewport = scrollRef.current!;
      mockScrollPositions(viewport);
      await resolve(0, 'first-record');
      expect(viewport.scrollTo).toHaveBeenLastCalledWith({ top: 400 });

      const getScrollTarget = vi.fn(getInnerScrollTarget);
      await render('first', { ...props, getScrollTarget });
      vi.mocked(viewport.scrollTo).mockClear();
      await act(async () => state.scrollToItem('first-record'));
      expect(viewport.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 1171 });
      expect(getScrollTarget).toHaveBeenCalledExactlyOnceWith(
        state.itemRefs.current.get('first-record')
      );

      await render('first', props);
      vi.mocked(viewport.scrollTo).mockClear();
      await act(async () => state.scrollToItem('first-record'));
      expect(viewport.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 400 });
      expect(requests).toHaveLength(1);
    });

    it.each(['prev', 'next'] as const)(
      'keeps the %s pagination cursor and scroll compensation when focusing an inner preview',
      async (direction) => {
        vi.useFakeTimers();
        const scrollRef = React.createRef<HTMLDivElement>();
        const getScrollTarget = vi.fn(getInnerScrollTarget);
        await render('first', {
          currentData: { id: 'first-record' },
          scrollRef,
          getScrollTarget,
          renderScrollAnchor: true
        });
        const viewport = scrollRef.current!;
        let scrollHeight = 1400;
        Object.defineProperties(viewport, {
          scrollHeight: { get: () => scrollHeight },
          clientHeight: { value: 400 }
        });
        viewport.scrollTop = direction === 'prev' ? 100 : 900;
        await act(async () =>
          requests[0].resolve({
            list: [{ id: 'first-record' }],
            hasMorePrev: direction === 'prev',
            hasMoreNext: direction === 'next'
          })
        );
        await act(async () => vi.advanceTimersByTimeAsync(250));
        expect(requests[1].params[direction === 'prev' ? 'prevId' : 'nextId']).toBe('first-record');

        getScrollTarget.mockClear();
        await act(async () => {
          await state.loadInitData();
        });
        expect(requests).toHaveLength(2);
        expect(getScrollTarget).toHaveBeenCalledExactlyOnceWith(
          state.itemRefs.current.get('first-record')
        );
        getScrollTarget.mockClear();

        scrollHeight = 1900;
        await resolve(1, 'page-record');
        await act(async () => vi.advanceTimersByTimeAsync(250));
        const expectedIds =
          direction === 'prev' ? ['page-record', 'first-record'] : ['first-record', 'page-record'];
        expect(state.dataList.map(({ id }) => id)).toEqual(expectedIds);
        expect(viewport.scrollTop).toBe(direction === 'prev' ? 600 : 900);
        expect(getScrollTarget).not.toHaveBeenCalled();
        expect(requests).toHaveLength(2);
      }
    );
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

  it('exposes append loading separately from initialization and clears the request text', async () => {
    vi.useFakeTimers();
    const scrollRef = React.createRef<HTMLDivElement>();
    await render('first', { scrollRef });
    expect(container.querySelector('[data-loading-overlay]')).not.toBeNull();
    await act(async () =>
      requests[0].resolve({
        list: [{ id: 'first-record' }],
        hasMorePrev: false,
        hasMoreNext: true
      })
    );
    const viewport = scrollRef.current!;
    viewport.scrollTop = 300;
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(requests[1].params.nextId).toBe('first-record');
    expect(state.isLoading).toBe(true);
    expect(state.isInitialLoading).toBe(false);
    expect(state.isLoadingMore).toBe(true);
    expect(container.querySelector('[data-loading-overlay]')).toBeNull();
    expect(container.textContent).toContain('common:is_requesting');

    await resolve(1, 'next-record');
    expect(state.dataList).toEqual([{ id: 'first-record' }, { id: 'next-record' }]);
    expect(container.textContent).not.toContain('common:is_requesting');
    expect(state.isLoadingMore).toBe(false);
  });
});
