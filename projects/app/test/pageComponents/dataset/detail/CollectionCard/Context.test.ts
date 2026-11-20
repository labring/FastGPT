import { JSDOM } from 'jsdom';
import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useContextSelector } from 'use-context-selector';
import { expect, it, vi } from 'vitest';
import CollectionPageContextProvider, {
  CollectionPageContext
} from '@/pageComponents/dataset/detail/CollectionCard/Context';
import type { GetDatasetCollectionsProps } from '@/global/core/api/datasetReq';

const mocks = vi.hoisted(() => ({
  router: { pathname: '/dataset/detail', query: { page: '2' }, replace: vi.fn() },
  registerRefresh: vi.fn<(refresh: () => void) => () => void>(() => () => {}),
  list: vi.fn(),
  toast: vi.fn()
}));

vi.mock('next/router', () => ({ useRouter: () => mocks.router }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next-i18next', () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({ openConfirm: () => () => {}, ConfirmModal: () => null })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ runAsync: vi.fn() })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: false }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyMenu', () => ({ default: () => null }));
vi.mock('@/web/support/user/team/api', () => ({ checkTeamWebSyncLimit: vi.fn() }));
vi.mock('@/web/core/dataset/api', () => ({ postDatasetSync: vi.fn() }));
vi.mock('@/web/core/dataset/api/collection', () => ({ getDatasetCollections: mocks.list }));
vi.mock('@/web/core/dataset/context/datasetPageContext', async () => {
  const { createContext } = await import('use-context-selector');
  return {
    DatasetPageContext: createContext({
      datasetId: 'dataset',
      datasetDetail: { type: 'dataset', collectionPermissionEnabled: false },
      registerCollectionListRefresh: mocks.registerRefresh
    })
  };
});

const useCollectionState = () => useContextSelector(CollectionPageContext, (value) => value);

it('keeps page two when a newer sort fails before its queued refresh, then refreshes on search', async () => {
  const dom = new JSDOM('', { url: 'https://fastgpt.example', pretendToBeVisual: true });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const root = createRoot(document.createElement('div'));
  const previousPage = { list: [{ _id: 'second-page-result' }], total: 40 };
  const requests: {
    params: GetDatasetCollectionsProps;
    resolve: (response: typeof previousPage) => void;
    reject: (error: Error) => void;
  }[] = [];
  mocks.list.mockImplementation((params: GetDatasetCollectionsProps) => {
    return new Promise<typeof previousPage>((resolve, reject) => {
      requests.push({ params, resolve, reject });
    });
  });

  const capture = vi.fn<(state: ReturnType<typeof useCollectionState>) => void>();
  const Capture = () => {
    const state = useCollectionState();
    useEffect(() => capture(state), [state]);
    return null;
  };
  const state = () => {
    const current = capture.mock.lastCall?.[0];
    if (!current) throw new Error('Collection context is not ready');
    return current;
  };

  try {
    await act(async () => {
      root.render(
        React.createElement(CollectionPageContextProvider, null, React.createElement(Capture))
      );
    });
    expect(requests[0].params.pageNum).toBe(2);
    await act(async () => requests[0].resolve(previousPage));
    await act(async () => vi.advanceTimersByTimeAsync(150));

    await act(async () =>
      state().setHeaderSelection({
        column: 'name',
        value: 'asc',
        params: { sortBy: 'name', sortOrder: 'asc' }
      })
    );
    expect(requests[1].params).toMatchObject({ pageNum: 1, sortBy: 'name', sortOrder: 'asc' });
    await act(async () =>
      state().setHeaderSelection({
        column: 'time',
        value: 'createTimeAsc',
        params: { sortBy: 'createTime', sortOrder: 'asc' }
      })
    );
    await act(async () => {
      mocks.registerRefresh.mock.lastCall?.[0]();
    });
    const failed = requests[requests.length - 1];
    expect(failed.params).toMatchObject({ pageNum: 1, sortBy: 'createTime', sortOrder: 'asc' });
    await act(async () => failed.reject(new Error('sort failed')));
    expect(mocks.toast).toHaveBeenCalledTimes(1);

    const requestCount = requests.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
      requests
        .slice(requestCount)
        .forEach(({ resolve }) =>
          resolve({ list: [{ _id: 'unexpected-first-page-result' }], total: 40 })
        );
    });

    expect(state()).toMatchObject({
      pageNum: 2,
      headerSelection: undefined,
      collections: previousPage.list
    });
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(requests).toHaveLength(requestCount);

    await act(async () => state().setSearchText('report'));
    await act(async () => vi.advanceTimersByTimeAsync(150));
    const search = requests[requests.length - 1];
    expect(search.params).toMatchObject({ pageNum: 1, searchText: 'report', sortBy: 'updateTime' });
    await act(async () => search.resolve({ list: [{ _id: 'search-result' }], total: 1 }));
    expect(state().pageNum).toBe(1);
  } finally {
    await act(async () => root.unmount());
    vi.useRealTimers();
    dom.window.close();
    vi.unstubAllGlobals();
  }
});
