// @vitest-environment jsdom

import React, { act, useMemo } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkedPaginationProps } from '@fastgpt/global/openapi/api';
import { useLinkedScroll } from '../../hooks/useLinkedScroll';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../../components/common/MyBox', () => ({ default: () => null }));
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

  const api = vi.fn(
    (params: Params) => new Promise<Response>((resolve) => requests.push({ params, resolve }))
  );
  const Harness = ({ chatId }: { chatId: string }) => {
    const params = useMemo(() => ({ chatId }), [chatId]);
    state = useLinkedScroll(api, { params, showErrorToast: false });
    return null;
  };
  const render = async (chatId: string) => {
    await act(async () => root.render(React.createElement(Harness, { chatId })));
  };
  const resolve = async (index: number, id: string) => {
    await act(async () =>
      requests[index].resolve({ list: [{ id }], hasMorePrev: false, hasMoreNext: false })
    );
  };

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    requests = [];
    api.mockClear();
    root = createRoot(document.createElement('div'));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
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
});
