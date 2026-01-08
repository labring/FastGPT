import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { type LinkedListResponse, type LinkedPaginationProps } from '../common/fetch/type';
import { Box, type BoxProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useScroll, useMemoizedFn, useDebounceEffect } from 'ahooks';
import MyBox from '../components/common/MyBox';
import { useRequest2 } from './useRequest';

const threshold = 200;

export function useLinkedScroll<
  TParams extends LinkedPaginationProps,
  TData extends LinkedListResponse
>(
  api: (data: TParams) => Promise<TData>,
  {
    pageSize = 10,
    params = {},
    currentData,
    defaultScroll = 'top',
    showErrorToast = true
  }: {
    pageSize?: number;
    params?: Record<string, any>;
    currentData?: { id: string; anchor?: any };
    defaultScroll?: 'top' | 'bottom';
    showErrorToast?: boolean;
  }
) {
  const { t } = useTranslation();
  const [dataList, setDataList] = useState<TData['list']>([]);
  const [hasMorePrev, setHasMorePrev] = useState(true);
  const [hasMoreNext, setHasMoreNext] = useState(true);

  // 锚点，用于记录顶部和底部的数据
  const anchorRef = useRef({
    top: null as TData['list'][number] | null,
    bottom: null as TData['list'][number] | null
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  const isInit = useRef(false);

  const scrollToItem = useCallback(
    async (id?: string) => {
      if (!id) {
        id = defaultScroll === 'top' ? dataList[0]?.id : dataList[dataList.length - 1]?.id;
      }

      const itemIndex = dataList.findIndex((item) => item.id === id);
      if (itemIndex === -1) {
        return;
      }

      const element = itemRefs.current.get(id);
      if (!element || !containerRef.current) {
        requestAnimationFrame(() => scrollToItem(id));
        return;
      }

      const elementRect = element.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();

      const scrollTop = containerRef.current.scrollTop + elementRect.top - containerRect.top;

      containerRef.current.scrollTo({
        top: scrollTop
      });
    },
    [dataList, defaultScroll]
  );

  const { runAsync: callApi, loading: isLoading } = useRequest2(api);

  let scrollSign = useRef(false);
  const { runAsync: loadInitData } = useRequest2(
    async ({ scrollWhenFinish, refresh } = { scrollWhenFinish: true, refresh: false }) => {
      if (isLoading) return;

      // 已经被加载的数据，直接滚动到该位置
      const item = dataList.find((item) => item.id === currentData?.id);
      if (item && !refresh) {
        scrollToItem(item.id);
        return;
      }

      const response = await callApi({
        initialId: currentData?.id,
        anchor: currentData?.anchor,
        pageSize,
        ...params
      } as TParams);

      setHasMorePrev(response.hasMorePrev);
      setHasMoreNext(response.hasMoreNext);

      scrollSign.current = scrollWhenFinish;
      setDataList(response.list);

      if (response.list.length > 0) {
        anchorRef.current.top = response.list[0];
        anchorRef.current.bottom = response.list[response.list.length - 1];
      }
    },
    {
      refreshDeps: [currentData],
      onFinally() {
        isInit.current = true;
      },
      manual: false,
      errorToast: showErrorToast ? undefined : ''
    }
  );
  useEffect(() => {
    if (!isInit.current) return;
    loadInitData({ refresh: true, scrollWhenFinish: true });
  }, [params]);
  useEffect(() => {
    if (scrollSign.current) {
      scrollSign.current = false;
      scrollToItem(currentData?.id);
    }
  }, [dataList]);

  const { runAsync: loadPrevData, loading: prevLoading } = useRequest2(
    async (scrollRef = containerRef) => {
      if (!anchorRef.current.top || !hasMorePrev || isLoading) return;

      const prevScrollTop = scrollRef?.current?.scrollTop || 0;
      const prevScrollHeight = scrollRef?.current?.scrollHeight || 0;

      const response = await callApi({
        prevId: anchorRef.current.top.id,
        anchor: anchorRef.current.top.anchor,
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
      refreshDeps: [hasMorePrev, isLoading, params, pageSize],
      errorToast: showErrorToast ? undefined : ''
    }
  );

  const { runAsync: loadNextData, loading: nextLoading } = useRequest2(
    async (scrollRef = containerRef) => {
      if (!anchorRef.current.bottom || !hasMoreNext || isLoading) return;

      const prevScrollTop = scrollRef?.current?.scrollTop || 0;

      const response = await callApi({
        nextId: anchorRef.current.bottom.id,
        anchor: anchorRef.current.bottom.anchor,
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
      refreshDeps: [hasMoreNext, isLoading, params, pageSize],
      errorToast: showErrorToast ? undefined : ''
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
      // If external ref is provided, use it; otherwise use internal ref
      const actualContainerRef = ScrollContainerRef || containerRef;
      const scroll = useScroll(actualContainerRef);

      // Merge refs: set both internal and external refs when element mounts
      const setRefs = useCallback(
        (el: HTMLDivElement | null) => {
          // @ts-ignore - RefObject.current is readonly, but we need to set it
          containerRef.current = el;
          if (ScrollContainerRef) {
            // @ts-ignore - RefObject.current is readonly, but we need to set it
            ScrollContainerRef.current = el;
          }
        },
        [ScrollContainerRef]
      );

      useDebounceEffect(
        () => {
          if (!actualContainerRef?.current || isLoading) return;

          const { scrollTop, scrollHeight, clientHeight } = actualContainerRef.current;

          // 滚动到底部附近，加载更多下方数据
          if (scrollTop + clientHeight >= scrollHeight - threshold) {
            loadNextData(actualContainerRef);
          }

          // 滚动到顶部附近，加载更多上方数据
          if (scrollTop <= threshold) {
            loadPrevData(actualContainerRef);
          }
        },
        [scroll],
        { wait: 200 }
      );

      return (
        <MyBox ref={setRefs} h={'100%'} overflow={'auto'} isLoading={isLoading} {...props}>
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
