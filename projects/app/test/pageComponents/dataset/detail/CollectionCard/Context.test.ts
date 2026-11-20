import { JSDOM } from 'jsdom';
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useContextSelector } from 'use-context-selector';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CollectionPageContextProvider, {
  CollectionPageContext
} from '@/pageComponents/dataset/detail/CollectionCard/Context';
import type { GetDatasetCollectionsProps } from '@/global/core/api/datasetReq';

const mocks = vi.hoisted(() => ({
  router: {
    pathname: '/dataset/detail',
    query: { page: '2' },
    replace: vi.fn().mockResolvedValue(true)
  },
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
  useConfirm: () => {
    const [, setConfirmPrepared] = React.useState(false);
    return {
      openConfirm: () => {
        setConfirmPrepared(true);
        return () => {};
      },
      ConfirmModal: () => null
    };
  }
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ runAsync: vi.fn() })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@chakra-ui/react', () => {
  const Box = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(function MockBox(
    { children, onClick },
    ref
  ) {
    return React.createElement('div', { onClick, ref }, children);
  });
  return {
    Box,
    Flex: Box,
    useDisclosure: () => ({ isOpen: false, onOpen: vi.fn(), onClose: vi.fn() })
  };
});
vi.mock('@fastgpt/web/hooks/useSystem', () => ({ useSystem: () => ({ isPc: true }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyMenu', () => ({
  default: ({ menuList }: { menuList: { children: { label: string; onClick: () => void }[] }[] }) =>
    menuList.flatMap(({ children }) =>
      children.map(({ label, onClick }) =>
        React.createElement('button', { key: label, onClick }, label)
      )
    )
}));
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
const capture = vi.fn<(state: ReturnType<typeof useCollectionState>) => void>();
const Capture = () => {
  const state = useCollectionState();
  useEffect(() => capture(state), [state]);
  return React.createElement(state.Pagination);
};
const state = () => {
  const current = capture.mock.lastCall?.[0];
  if (!current) throw new Error('Collection context is not ready');
  return current;
};

type TestResponse = { list: { _id: string }[]; total: number };
const previousPage: TestResponse = { list: [{ _id: 'previous-page' }], total: 45 };
const nameAsc = {
  column: 'name',
  value: 'asc',
  params: { sortBy: 'name', sortOrder: 'asc' }
} as const;
const timeAsc = {
  column: 'time',
  value: 'createTimeAsc',
  params: { sortBy: 'createTime', sortOrder: 'asc' }
} as const;

let dom: JSDOM;
let root: Root;
let container: HTMLDivElement;
let requests: (PromiseWithResolvers<TestResponse> & { params: GetDatasetCollectionsProps })[];

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.router.query = { page: '2' };
  dom = new JSDOM('', { url: 'https://fastgpt.example', pretendToBeVisual: true });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  container = document.createElement('div');
  root = createRoot(container);
  requests = [];
  mocks.list.mockImplementation((params: GetDatasetCollectionsProps) => {
    const request = Promise.withResolvers<TestResponse>();
    requests.push({ params, ...request });
    return request.promise;
  });

  await act(async () => {
    root.render(
      React.createElement(CollectionPageContextProvider, null, React.createElement(Capture))
    );
  });
  expect(requests[0].params.pageNum).toBe(2);
  await act(async () => requests[0].resolve(previousPage));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  dom.window.close();
  vi.unstubAllGlobals();
});

it('preserves the new search and loads page one with the previous sort after a sort fails', async () => {
  await act(async () => state().setSearchText('report'));
  await act(async () => vi.advanceTimersByTimeAsync(100));
  expect(requests[1].params).toMatchObject({
    pageNum: 1,
    searchText: 'report',
    sortBy: 'updateTime'
  });

  await act(async () => state().setHeaderSelection(nameAsc));
  expect(requests[2].params).toMatchObject({ pageNum: 1, searchText: 'report', sortBy: 'name' });
  await act(async () => requests[2].reject(new Error('sort failed')));
  expect(requests[3].params).toMatchObject({
    pageNum: 1,
    searchText: 'report',
    sortBy: 'updateTime',
    sortOrder: 'desc'
  });
  expect(mocks.toast).toHaveBeenCalledTimes(1);

  await act(async () => requests[1].resolve({ list: [{ _id: 'stale-search' }], total: 1 }));
  expect(state()).toMatchObject({ pageNum: 2, collections: previousPage.list });

  const found = { list: [{ _id: 'report' }], total: 1 };
  await act(async () => requests[3].resolve(found));
  expect(state()).toMatchObject({
    pageNum: 1,
    searchText: 'report',
    headerSelection: undefined,
    collections: found.list,
    total: 1
  });
  expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith({
    pathname: '/dataset/detail',
    query: { page: 1 }
  });

  await act(async () => {
    void state().pollCollections();
  });
  expect(requests[4].params).toMatchObject({
    pageNum: 1,
    searchText: 'report',
    sortBy: 'updateTime'
  });
  await act(async () => requests[4].resolve(found));
});

it('coalesces mutation refreshes and keeps page two when only the sort fails', async () => {
  await act(async () => state().setHeaderSelection(nameAsc));
  expect(requests[1].params).toMatchObject({ pageNum: 1, sortBy: 'name' });
  await act(async () => {
    mocks.registerRefresh.mock.lastCall?.[0]();
    void state().refreshCollections();
  });
  expect(requests).toHaveLength(2);

  await act(async () => state().setHeaderSelection(timeAsc));
  await act(async () => state().pollCollections());
  expect(requests).toHaveLength(3);
  await act(async () => requests[2].reject(new Error('sort failed')));
  expect(state()).toMatchObject({
    pageNum: 2,
    headerSelection: undefined,
    collections: previousPage.list
  });
  expect(requests[3].params).toMatchObject({ pageNum: 2, sortBy: 'updateTime' });

  const refreshed = { list: [{ _id: 'refreshed-page-two' }], total: 45 };
  await act(async () => requests[3].resolve(refreshed));
  await act(async () => requests[1].resolve({ list: [{ _id: 'stale-sort' }], total: 45 }));
  await act(async () => vi.advanceTimersByTimeAsync(150));
  expect(requests).toHaveLength(4);
  expect(state()).toMatchObject({ pageNum: 2, collections: refreshed.list });
  expect(mocks.router.replace).not.toHaveBeenCalled();
});

it('uses the requested search, sort and first page when changing page size quickly', async () => {
  await act(async () => state().setSearchText('report'));
  await act(async () => state().setHeaderSelection(nameAsc));
  const size = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === '50'
  );
  if (!size) throw new Error('Missing page size option');
  await act(async () => size.click());
  expect(requests[2].params).toMatchObject({
    pageNum: 1,
    pageSize: 50,
    searchText: 'report',
    sortBy: 'name',
    sortOrder: 'asc'
  });
  await act(async () => vi.advanceTimersByTimeAsync(150));
  expect(requests).toHaveLength(3);
  const found = { list: [{ _id: 'report' }], total: 51 };
  await act(async () => requests[2].resolve(found));
  await act(async () => requests[1].reject(new Error('superseded')));
  expect(state()).toMatchObject({
    pageNum: 1,
    pageSize: 50,
    headerSelection: nameAsc,
    collections: found.list
  });
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(
    window.localStorage.getItem('fastgpt:pagination:page-size:dataset-detail-collections')
  ).toBe('50');
});

it('honors an explicit first-page refresh queued during a failed sort', async () => {
  await act(async () => state().setHeaderSelection(nameAsc));
  await act(async () => {
    void state().refreshCollections({ firstPage: true });
  });
  expect(requests).toHaveLength(2);
  await act(async () => requests[1].reject(new Error('sort failed')));
  expect(requests[2].params).toMatchObject({ pageNum: 1, sortBy: 'updateTime' });
  await act(async () => requests[2].resolve(previousPage));
  expect(state().pageNum).toBe(1);
});

it('replaces a pending sort when the user selects the previously loaded sort', async () => {
  await act(async () => state().setHeaderSelection(nameAsc));
  await act(async () => state().setHeaderSelection(undefined));
  expect(requests[2].params).toMatchObject({ pageNum: 1, sortBy: 'updateTime' });
  await act(async () => requests[1].resolve({ list: [{ _id: 'stale-sort' }], total: 45 }));
  expect(state()).toMatchObject({ pageNum: 2, collections: previousPage.list });
  await act(async () => requests[2].resolve(previousPage));
  expect(state()).toMatchObject({ pageNum: 1, headerSelection: undefined });
});
