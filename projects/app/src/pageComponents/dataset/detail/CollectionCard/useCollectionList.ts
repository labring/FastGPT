import { useEffect, useMemo, useRef, useState } from 'react';
import { useDebounceFn, useMemoizedFn } from 'ahooks';
import { useRouter } from 'next/router';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import type { CollectionTagFilterItem } from '@fastgpt/global/core/dataset/type';
import { getDatasetCollections } from '@/web/core/dataset/api/collection';
import type { CollectionListHeaderSelection } from './CollectionListHeaderMenu';

export const defaultCollectionListSort = { sortBy: 'updateTime', sortOrder: 'desc' } as const;
type Sort = { selection?: CollectionListHeaderSelection; pending: boolean };

/** 统一集合列表的条件、首页查询与后台刷新，复用公共分页的请求和结果管理。 */
export const useCollectionList = (datasetId: string, permissionEnabled = false) => {
  const { query } = useRouter();
  const parentId = typeof query.parentId === 'string' ? query.parentId : '';
  const [searchText, setSearchInput] = useState('');
  const [querySearch, setQuerySearch] = useState('');
  const [tagFilters, setTagFilters] = useState<CollectionTagFilterItem[]>([]);
  const [sort, setSort] = useState<Sort>({ pending: false });
  const { selection: headerSelection, pending: sortPending } = sort;
  const scope = useMemo(
    () => ({ datasetId, parentId, searchText: querySearch, tagFilters, permissionEnabled }),
    [datasetId, parentId, permissionEnabled, querySearch, tagFilters]
  );
  const [loadedScope, setLoadedScope] = useState(scope);
  const [loadedSelection, setLoadedSelection] = useState<CollectionListHeaderSelection>();
  const [retryFirstPage, setRetryFirstPage] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [settledRefresh, notifySettled] = useState(0);
  const requestedPageSize = useRef<number>();
  const loadedPageSize = useRef<number>();
  const activeRequest = useRef(false);
  const queued = useRef<PromiseWithResolvers<void> & { firstPage: boolean }>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const firstPagePending = scope !== loadedScope || sortPending || retryFirstPage;
  const settle = () => {
    activeRequest.current = false;
    setIsInitialLoading(false);
    if (queued.current) notifySettled((count) => count + 1);
  };
  const loadCollections = (params: Parameters<typeof getDatasetCollections>[0]) => {
    activeRequest.current = true;
    requestedPageSize.current = params.pageSize;
    return getDatasetCollections(params);
  };

  const pagination = usePagination(loadCollections, {
    pageSizeCacheKey: 'dataset-detail-collections',
    storeToQuery: true,
    scrollContainerRef,
    forceFirstPage: firstPagePending,
    params: {
      datasetId,
      parentId,
      searchText: querySearch,
      tagFilters,
      ...defaultCollectionListSort,
      ...headerSelection?.params
    },
    onChange: () => {
      loadedPageSize.current = requestedPageSize.current;
      setLoadedScope(scope);
      setLoadedSelection(headerSelection);
      if (sortPending)
        setSort((current) => (current === sort ? { ...sort, pending: false } : current));
      setRetryFirstPage(false);
      settle();
    },
    onError: () => {
      settle();
      if (!sortPending) return;
      // 回退排序后，尚未加载的搜索范围或每页条数仍需完成首页请求。
      setSort((current) =>
        current === sort ? { selection: loadedSelection, pending: false } : current
      );
      if (loadedPageSize.current !== requestedPageSize.current) setRetryFirstPage(true);
    }
  });

  const { getData, pageNum, isLoading } = pagination;
  const { run: scheduleSearch, flush: flushSearch } = useDebounceFn(setQuerySearch, { wait: 100 });
  const setSearchText = useMemoizedFn((text: string) => {
    setSearchInput(text);
    scheduleSearch(text);
  });
  const setHeaderSelection = useMemoizedFn((selection?: CollectionListHeaderSelection) => {
    flushSearch();
    if (selection?.value !== headerSelection?.value) setSort({ selection, pending: true });
  });

  useEffect(() => {
    if (firstPagePending) void getData(1);
  }, [firstPagePending, getData, headerSelection, scope]);

  const refreshCollections = useMemoizedFn(({ firstPage = false } = {}) => {
    if (!isLoading && !activeRequest.current && !queued.current) {
      return getData(firstPage ? 1 : pageNum);
    }
    const pending = (queued.current ??= { ...Promise.withResolvers<void>(), firstPage });
    pending.firstPage ||= firstPage;
    return pending.promise;
  });

  useEffect(() => {
    // 写操作后的刷新等当前查询提交或回退，再用当时的条件与页码执行。
    const pending = queued.current;
    if (!pending || isLoading || activeRequest.current) return;
    queued.current = undefined;
    pending.resolve(getData(pending.firstPage ? 1 : pageNum));
  }, [getData, isLoading, pageNum, settledRefresh]);

  useEffect(() => () => queued.current?.resolve(), []);
  const pollCollections = useMemoizedFn(async () => {
    if (!isLoading && !activeRequest.current && !queued.current) await getData(pageNum);
  });

  return {
    collections: pagination.data,
    Pagination: pagination.Pagination,
    total: pagination.total,
    isInitialLoading,
    pageNum,
    pageSize: pagination.pageSize,
    scrollContainerRef,
    searchText,
    setSearchText,
    tagFilters,
    setTagFilters,
    headerSelection,
    setHeaderSelection,
    refreshCollections,
    pollCollections
  };
};
