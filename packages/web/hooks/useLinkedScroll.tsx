import { useCallback, useEffect, useRef, useState, ReactNode } from 'react';
import { LinkedListResponse, LinkedPaginationProps } from '../common/fetch/type';
import { Box, BoxProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useScroll, useMemoizedFn, useDebounceEffect } from 'ahooks';
import MyBox from '../components/common/MyBox';
import { useRequest2 } from './useRequest';

const threshold = 100;

export function useLinkedScroll<
  TParams extends LinkedPaginationProps & { isInitialLoad?: boolean },
  TData extends LinkedListResponse
>(
  api: (data: TParams) => Promise<TData>,
  {
    refreshDeps = [],
    pageSize = 15,
    params = {},
    initialId,
    initialIndex,
    canLoadData = false
  }: {
    refreshDeps?: any[];
    pageSize?: number;
    params?: Record<string, any>;
    initialId?: string;
    initialIndex?: number;
    canLoadData?: boolean;
  }
) {
  const { t } = useTranslation();
  const [dataList, setDataList] = useState<TData['list']>([]);
  const [hasMorePrev, setHasMorePrev] = useState(true);
  const [hasMoreNext, setHasMoreNext] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const hasScrolledToInitial = useRef(false);

  const anchorRef = useRef({
    top: null as { _id: string; index: number } | null,
    bottom: null as { _id: string; index: number } | null
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const { runAsync: callApi, loading: isLoading } = useRequest2(
    async (apiParams: TParams) => await api(apiParams),
    {
      onError: (error) => {
        return Promise.reject(error);
      }
    }
  );

  const loadData = useCallback(
    async ({
      id,
      index,
      isInitialLoad = false
    }: {
      id: string;
      index: number;
      isInitialLoad?: boolean;
    }) => {
      if (isLoading) return null;

      const response = await callApi({
        initialId: id,
        initialIndex: index,
        pageSize,
        isInitialLoad,
        ...params
      } as TParams);

      if (!response) return null;

      setHasMorePrev(response.hasMorePrev);
      setHasMoreNext(response.hasMoreNext);
      setDataList(response.list);

      if (response.list.length > 0) {
        anchorRef.current.top = response.list[0];
        anchorRef.current.bottom = response.list[response.list.length - 1];
      }

      setInitialLoadDone(true);

      const scrollIndex = response.list.findIndex((item) => item._id === id);

      if (scrollIndex !== -1 && itemRefs.current?.[scrollIndex]) {
        setTimeout(() => {
          scrollToItem(scrollIndex);
        }, 100);
      }

      return response;
    },
    [callApi, params, dataList, hasMorePrev, hasMoreNext, isLoading]
  );

  const loadPrevData = useCallback(
    async (scrollRef = containerRef) => {
      if (!anchorRef.current.top || !hasMorePrev || isLoading) return;

      const prevScrollTop = scrollRef?.current?.scrollTop || 0;
      const prevScrollHeight = scrollRef?.current?.scrollHeight || 0;

      const response = await callApi({
        prevId: anchorRef.current.top._id,
        prevIndex: anchorRef.current.top.index,
        pageSize,
        ...params
      } as TParams);

      if (!response) return;

      setHasMorePrev(response.hasMorePrev);

      if (response.list.length > 0) {
        setDataList((prev) => [...response.list, ...prev]);
        anchorRef.current.top = response.list[0];

        setTimeout(() => {
          if (scrollRef?.current) {
            const newHeight = scrollRef.current.scrollHeight;
            const heightDiff = newHeight - prevScrollHeight;
            scrollRef.current.scrollTop = prevScrollTop + heightDiff;
          }
        }, 0);
      }

      return response;
    },
    [callApi, hasMorePrev, isLoading, params, pageSize]
  );

  const loadNextData = useCallback(
    async (scrollRef = containerRef) => {
      if (!anchorRef.current.bottom || !hasMoreNext || isLoading) return;

      const prevScrollTop = scrollRef?.current?.scrollTop || 0;

      const response = await callApi({
        nextId: anchorRef.current.bottom._id,
        nextIndex: anchorRef.current.bottom.index,
        pageSize,
        ...params
      } as TParams);

      if (!response) return;

      setHasMoreNext(response.hasMoreNext);

      if (response.list.length > 0) {
        setDataList((prev) => [...prev, ...response.list]);
        anchorRef.current.bottom = response.list[response.list.length - 1];

        setTimeout(() => {
          if (scrollRef?.current) {
            scrollRef.current.scrollTop = prevScrollTop;
          }
        }, 0);
      }

      return response;
    },
    [callApi, hasMoreNext, isLoading, params, pageSize]
  );

  const scrollToItem = useCallback(
    (itemIndex: number) => {
      if (itemIndex >= 0 && itemIndex < dataList.length && itemRefs.current?.[itemIndex]) {
        try {
          const element = itemRefs.current[itemIndex];
          if (!element) {
            return false;
          }

          setTimeout(() => {
            if (element && containerRef.current) {
              const elementRect = element.getBoundingClientRect();
              const containerRect = containerRef.current.getBoundingClientRect();

              const relativeTop = elementRect.top - containerRect.top;

              const scrollTop =
                containerRef.current.scrollTop +
                relativeTop -
                containerRect.height / 2 +
                elementRect.height / 2;

              containerRef.current.scrollTo({
                top: scrollTop,
                behavior: 'smooth'
              });
            }
          }, 50);

          return true;
        } catch (error) {
          console.error('Error scrolling to item:', error);
          return false;
        }
      }
      return false;
    },
    [dataList.length]
  );

  // 初始加载
  useEffect(() => {
    if (canLoadData) {
      setInitialLoadDone(false);
      hasScrolledToInitial.current = false;

      loadData({
        id: initialId || '',
        index: initialIndex || 0,
        isInitialLoad: true
      });
    }
  }, [canLoadData, ...refreshDeps]);

  // 监听初始加载完成，执行初始滚动
  useEffect(() => {
    if (initialLoadDone && dataList.length > 0 && !hasScrolledToInitial.current) {
      const foundIndex = dataList.findIndex((item) => item._id === initialId);

      if (foundIndex >= 0) {
        hasScrolledToInitial.current = true;
        setTimeout(() => {
          scrollToItem(foundIndex);
        }, 200);
      }
    }
  }, [initialLoadDone, ...refreshDeps]);

  const ScrollData = useMemoizedFn(
    ({
      children,
      ScrollContainerRef,
      isLoading: externalLoading,
      ...props
    }: {
      isLoading?: boolean;
      children: ReactNode;
      ScrollContainerRef?: React.RefObject<HTMLDivElement>;
    } & BoxProps) => {
      const ref = ScrollContainerRef || containerRef;
      const scroll = useScroll(ref);

      useDebounceEffect(
        () => {
          if (!ref?.current || isLoading || !initialLoadDone) return;

          const { scrollTop, scrollHeight, clientHeight } = ref.current;

          // 滚动到底部附近，加载更多下方数据
          if (scrollTop + clientHeight >= scrollHeight - threshold && hasMoreNext) {
            loadNextData(ref);
          }

          // 滚动到顶部附近，加载更多上方数据
          if (scrollTop <= threshold && hasMorePrev) {
            loadPrevData(ref);
          }
        },
        [scroll],
        { wait: 200 }
      );

      return (
        <MyBox
          ref={ref}
          h={'100%'}
          overflow={'auto'}
          isLoading={externalLoading || isLoading}
          {...props}
        >
          {hasMorePrev && isLoading && initialLoadDone && (
            <Box mt={2} fontSize={'xs'} color={'blackAlpha.500'} textAlign={'center'}>
              {t('common:common.is_requesting')}
            </Box>
          )}
          {children}
          {hasMoreNext && isLoading && initialLoadDone && (
            <Box mt={2} fontSize={'xs'} color={'blackAlpha.500'} textAlign={'center'}>
              {t('common:common.is_requesting')}
            </Box>
          )}
        </MyBox>
      );
    }
  );

  return {
    dataList,
    setDataList,
    isLoading,
    loadData,
    ScrollData,
    itemRefs,
    scrollToItem
  };
}
