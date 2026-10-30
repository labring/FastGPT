// @vitest-environment jsdom

import React, { act, useMemo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkedPaginationProps } from '@fastgpt/global/openapi/api';
import { useLinkedScroll } from '../../hooks/useLinkedScroll';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../../components/common/MyBox', () => ({
  default: React.forwardRef<HTMLDivElement, { isLoading: boolean; children: React.ReactNode }>(
    function ScrollContainer({ isLoading, children }, ref) {
      return React.createElement(
        'div',
        {
          ref: (element: HTMLDivElement | null) => {
            if (element) element.scrollTo = vi.fn();
            if (typeof ref === 'function') ref(element);
            else if (ref) ref.current = element;
          },
          'data-loading': String(isLoading)
        },
        children
      );
    }
  )
}));
vi.mock('@chakra-ui/react', () => ({ Box: () => null }));

type Response = {
  list: { id: string }[];
  hasMorePrev: boolean;
  hasMoreNext: boolean;
};
type Params = LinkedPaginationProps<{ chatId: string }>;

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
    showInitialLoading
  }: {
    chatId: string;
    showInitialLoading?: boolean;
  }) => {
    const params = useMemo(() => ({ chatId }), [chatId]);
    state = useLinkedScroll(api, { params, showErrorToast: false, showInitialLoading });
    const scrollProps = {
      children: [
        'Composer',
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
    return React.createElement(state.ScrollData, scrollProps);
  };
  const render = async (chatId: string, showInitialLoading?: boolean) => {
    await act(async () =>
      root.render(React.createElement(Harness, { chatId, showInitialLoading }))
    );
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
    'preserves default initial loading and allows callers to disable only the first overlay: %s',
    async (showInitialLoading) => {
      await render('first', showInitialLoading);
      expect(container.querySelector('[data-loading]')?.getAttribute('data-loading')).toBe(
        String(showInitialLoading !== false)
      );
      expect(container.textContent).toBe('Composer');
      await resolve(0, 'first-record');
      expect(container.querySelector('[data-loading]')?.getAttribute('data-loading')).toBe('false');

      await render('second', showInitialLoading);
      expect(container.querySelector('[data-loading]')?.getAttribute('data-loading')).toBe('true');
      await resolve(1, 'second-record');
      expect(container.querySelector('[data-loading]')?.getAttribute('data-loading')).toBe('false');
    }
  );
});
