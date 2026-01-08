import React, { type ReactNode, type RefObject, useMemo, useRef, useState } from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';
import { useToast } from './useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { type PaginationProps, type PaginationResponse } from '../common/fetch/type';
import {
  useBoolean,
  useLockFn,
  useMemoizedFn,
  useScroll,
  useVirtualList,
  useRequest,
  useThrottleEffect
} from 'ahooks';
import MyBox from '../components/common/MyBox';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from './useRequest';

type ItemHeight<T> = (index: number, data: T) => number;
const thresholdVal = 100;

export type ScrollListType = ({
  children,
  EmptyChildren,
  isLoading,
  ...props
}: {
  children: React.ReactNode;
  EmptyChildren?: React.ReactNode;
  isLoading?: boolean;
} & BoxProps) => React.JSX.Element;

export function useVirtualScrollPagination<
  TParams extends PaginationProps,
  TData extends PaginationResponse
>(
  api: (data: TParams) => Promise<TData>,
  {
    refreshDeps,
    itemHeight = 50,
    overscan = 10,

    pageSize = 10,
    defaultParams = {}
  }: {
    refreshDeps?: any[];

    itemHeight: number | ItemHeight<TData['list'][0]>;
    overscan?: number;

    pageSize?: number;
    defaultParams?: Record<string, any>;
  }
) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef(null);
  const { toast } = useToast();

  const [data, setData] = useState<TData['list']>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, { setTrue, setFalse }] = useBoolean(false);

  const noMore = data.length >= total;

  const [list] = useVirtualList<TData['list'][0]>(data, {
    containerTarget: containerRef,
    wrapperTarget: wrapperRef,
    itemHeight,
    overscan
  });

  const loadData = useLockFn(async ({ init = false }: { init?: boolean } = {}) => {
    if (noMore && !init) return;

    const offset = init ? 0 : data.length;

    setTrue();

    try {
      const res = await api({
        offset,
        pageSize,
        ...defaultParams
      } as TParams);

      setTotal(res.total);

      if (offset === 0) {
        // init or reload
        setData(res.list);
      } else {
        setData((prev) => [...prev, ...res.list]);
      }
    } catch (error: any) {
      toast({
        title: getErrText(error, t('common:core.chat.error.data_error')),
        status: 'error'
      });
      console.log(error);
    }

    setFalse();
  });

  const scroll2Top = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  };

  const ScrollList = useMemoizedFn(
    ({
      children,
      EmptyChildren,
      isLoading,
      ...props
    }: {
      children: React.ReactNode;
      EmptyChildren?: React.ReactNode;
      isLoading?: boolean;
    } & BoxProps) => {
      return (
        <MyBox isLoading={isLoading} ref={containerRef} overflow={'overlay'} {...props}>
          <Box ref={wrapperRef}>
            {children}
            {noMore && list.length > 0 && (
              <Box py={4} textAlign={'center'} color={'myGray.600'} fontSize={'xs'}>
                {t('common:no_more_data')}
              </Box>
            )}
          </Box>

          {list.length === 0 && !isLoading && EmptyChildren && <>{EmptyChildren}</>}
        </MyBox>
      );
    }
  );

  // Reload data
  useRequest(
    async () => {
      loadData({ init: true });
    },
    {
      manual: false,
      refreshDeps
    }
  );

  // Check if scroll to bottom
  const scroll = useScroll(containerRef);
  useThrottleEffect(
    () => {
      if (!containerRef.current || list.length === 0) return;
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;

      if (scrollTop + clientHeight >= scrollHeight - thresholdVal) {
        loadData({ init: false });
      }
    },
    [scroll],
    {
      wait: 50
    }
  );

  return {
    containerRef,
    scrollDataList: list,
    total,
    totalData: data,
    setData,
    isLoading,
    ScrollList,
    fetchData: loadData,
    scroll2Top
  };
}

export function useScrollPagination<
  TParams extends PaginationProps,
  TData extends PaginationResponse
>(
  api: (data: TParams) => Promise<TData>,
  {
    scrollLoadType = 'bottom',

    pageSize = 10,
    params,
    EmptyTip,
    showErrorToast = true,
    disabled = false,

    ...props
  }: {
    scrollLoadType?: 'top' | 'bottom';

    pageSize?: number;
    params?: Omit<TParams, 'offset' | 'pageSize'>;
    EmptyTip?: React.JSX.Element;
    showErrorToast?: boolean;
    disabled?: boolean;
  } & Parameters<typeof useRequest2>[1]
) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [data, setData] = useState<TData['list']>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, { setTrue, setFalse }] = useBoolean(false);
  const isEmpty = total === 0 && !isLoading;

  const noMore = data.length >= total;

  const loadData = useLockFn(
    async ({
      init = false,
      ScrollContainerRef
    }: {
      init?: boolean;
      ScrollContainerRef?: RefObject<HTMLDivElement>;
    } = {}) => {
      if (noMore && !init) return;

      setTrue();

      if (init) {
        setData([]);
        setTotal(0);
      }

      const offset = init ? 0 : data.length;

      try {
        const res = await api({
          offset,
          pageSize,
          ...params
        } as TParams);

        setTotal(res.total);

        if (scrollLoadType === 'top') {
          const prevHeight = ScrollContainerRef?.current?.scrollHeight || 0;
          const prevScrollTop = ScrollContainerRef?.current?.scrollTop || 0;

          function adjustScrollPosition() {
            requestAnimationFrame(
              ScrollContainerRef?.current
                ? () => {
                    if (ScrollContainerRef?.current) {
                      const newHeight = ScrollContainerRef.current.scrollHeight;
                      const heightDiff = newHeight - prevHeight;
                      ScrollContainerRef.current.scrollTop = prevScrollTop + heightDiff;
                    }
                  }
                : adjustScrollPosition
            );
          }

          const newData = offset === 0 ? res.list : [...res.list, ...data];
          setData(newData);
          adjustScrollPosition();
        } else {
          const newData = offset === 0 ? res.list : [...data, ...res.list];
          setData(newData);
        }
      } catch (error: any) {
        if (showErrorToast) {
          toast({
            title: t(getErrText(error, t('common:core.chat.error.data_error'))),
            status: 'error'
          });
        }
        console.log(error);
      }

      setFalse();
    }
  );

  let ScrollRef = useRef<HTMLDivElement>(null);
  const ScrollData = useMemoizedFn(
    ({
      children,
      ScrollContainerRef,
      isLoading: isLoadingProp,
      ...props
    }: {
      isLoading?: boolean;
      children: ReactNode;
      ScrollContainerRef?: RefObject<HTMLDivElement>;
    } & BoxProps) => {
      const ref = ScrollContainerRef || ScrollRef;
      const loadText = useMemo(() => {
        if (isLoading || isLoadingProp) return t('common:is_requesting');
        if (noMore) return t('common:request_end');
        return t('common:request_more');
      }, [isLoading, noMore]);

      const scroll = useScroll(ref);

      // Watch scroll position
      useThrottleEffect(
        () => {
          if (!ref?.current || noMore || isLoading || data.length === 0) return;
          const { scrollTop, scrollHeight, clientHeight } = ref.current;

          if (
            (scrollLoadType === 'bottom' &&
              scrollTop + clientHeight >= scrollHeight - thresholdVal) ||
            (scrollLoadType === 'top' && scrollTop < thresholdVal)
          ) {
            loadData({ init: false, ScrollContainerRef: ref });
          }
        },
        [scroll],
        { wait: 50 }
      );

      return (
        <MyBox
          ref={ref}
          h={'100%'}
          overflow={'auto'}
          isLoading={isLoading || isLoadingProp}
          {...props}
        >
          {scrollLoadType === 'top' && total > 0 && isLoading && (
            <Box mt={2} fontSize={'xs'} color={'blackAlpha.500'} textAlign={'center'}>
              {t('common:is_requesting')}
            </Box>
          )}
          {children}
          {scrollLoadType === 'bottom' && !isEmpty && (
            <Box
              mt={2}
              fontSize={'xs'}
              color={'blackAlpha.500'}
              textAlign={'center'}
              cursor={loadText === t('common:request_more') ? 'pointer' : 'default'}
              onClick={() => {
                if (loadText !== t('common:request_more')) return;
                loadData({ init: false });
              }}
            >
              {loadText}
            </Box>
          )}
          {isEmpty && EmptyTip}
        </MyBox>
      );
    }
  );

  // Reload data
  useRequest2(
    async () => {
      if (disabled) return;
      loadData({ init: true });
    },
    {
      manual: false,
      ...props
    }
  );

  const refreshList = useMemoizedFn(() => {
    loadData({ init: true });
  });

  return {
    ScrollData,
    isLoading,
    total: Math.max(total, data.length),
    data,
    setData,
    fetchData: loadData,
    refreshList
  };
}
