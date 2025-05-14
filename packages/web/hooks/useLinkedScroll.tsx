import { useEffect, useRef, useState, type ReactNode } from 'react';
import { type LinkedListResponse, type LinkedPaginationProps } from '../common/fetch/type';
import { Box, type BoxProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useScroll, useMemoizedFn, useDebounceEffect } from 'ahooks';
import MyBox from '../components/common/MyBox';
import { useRequest2 } from './useRequest';
import { delay } from '../../global/common/system/utils';

const threshold = 100;

export function useLinkedScroll<
  TParams extends LinkedPaginationProps & { isInitialLoad?: boolean },
  TData extends LinkedListResponse
>(
  api: (data: TParams) => Promise<TData>,
  {
    pageSize = 15,
    params = {},
    currentData
  }: {
    pageSize?: number;
    params?: Record<string, any>;
    currentData?: { id: string; index: number };
  }
) {
  const { t } = useTranslation();
  const [dataList, setDataList] = useState<TData['list']>([]);
  const [hasMorePrev, setHasMorePrev] = useState(true);
  const [hasMoreNext, setHasMoreNext] = useState(true);

  const anchorRef = useRef({
    top: null as { _id: string; index: number } | null,
    bottom: null as { _id: string; index: number } | null
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLElement | null>>(new Map());

  const scrollToItem = async (id: string, retry = 3) => {
    const itemIndex = dataList.findIndex((item) => item._id === id);
    if (itemIndex === -1) return;

    const element = itemRefs.current.get(id);

    if (!element || !containerRef.current) {
      if (retry > 0) {
        await delay(500);
        return scrollToItem(id, retry - 1);
      }
      return;
    }

    const elementRect = element.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    const scrollTop = containerRef.current.scrollTop + elementRect.top - containerRect.top;

    containerRef.current.scrollTo({
      top: scrollTop
    });
  };

  const { runAsync: callApi, loading: isLoading } = useRequest2(api);

  let scroolSign = useRef(false);
  const { runAsync: loadInitData } = useRequest2(
    async ({ scrollWhenFinish, refresh } = { scrollWhenFinish: true, refresh: false }) => {
      if (!currentData || isLoading) return;

      const item = dataList.find((item) => item._id === currentData.id);
      if (item && !refresh) {
        scrollToItem(item._id);
        return;
      }

      const response = await callApi({
        initialId: currentData.id,
        initialIndex: currentData.index,
        pageSize,
        ...params
      } as TParams);

      setHasMorePrev(response.hasMorePrev);
      setHasMoreNext(response.hasMoreNext);

      scroolSign.current = scrollWhenFinish;
      setDataList(response.list);

      if (response.list.length > 0) {
        anchorRef.current.top = response.list[0];
        anchorRef.current.bottom = response.list[response.list.length - 1];
      }
    },
    {
      refreshDeps: [currentData],
      manual: false
    }
  );
  useEffect(() => {
    if (scroolSign.current && currentData) {
      scroolSign.current = false;
      scrollToItem(currentData.id);
    }
  }, [dataList]);

  const { runAsync: loadPrevData, loading: prevLoading } = useRequest2(
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
    {
      refreshDeps: [hasMorePrev, isLoading, params, pageSize]
    }
  );

  const { runAsync: loadNextData, loading: nextLoading } = useRequest2(
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
    {
      refreshDeps: [hasMoreNext, isLoading, params, pageSize]
    }
  );

  const ScrollData = useMemoizedFn(
    ({
      children,
      ScrollContainerRef,
      ...props
    }: {
      children: ReactNode;
      ScrollContainerRef?: React.RefObject<HTMLDivElement>;
    } & BoxProps) => {
      const ref = ScrollContainerRef || containerRef;
      const scroll = useScroll(ref);

      useDebounceEffect(
        () => {
          if (!ref?.current || isLoading) return;

          const { scrollTop, scrollHeight, clientHeight } = ref.current;

          // 滚动到底部附近，加载更多下方数据
          if (scrollTop + clientHeight >= scrollHeight - threshold) {
            loadNextData(ref);
          }

          // 滚动到顶部附近，加载更多上方数据
          if (scrollTop <= threshold) {
            loadPrevData(ref);
          }
        },
        [scroll],
        { wait: 200 }
      );

      return (
        <MyBox ref={ref} h={'100%'} overflow={'auto'} isLoading={isLoading} {...props}>
          {hasMorePrev && prevLoading && (
            <Box mt={2} fontSize={'xs'} color={'blackAlpha.500'} textAlign={'center'}>
              {t('common:is_requesting')}
            </Box>
          )}
          {children}
          {hasMoreNext && nextLoading && (
            <Box mt={2} fontSize={'xs'} color={'blackAlpha.500'} textAlign={'center'}>
              {t('common:is_requesting')}
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
    loadInitData,
    ScrollData,
    itemRefs,
    scrollToItem
  };
}
