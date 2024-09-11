import React, { useRef, useState } from 'react';
import { Box, BoxProps } from '@chakra-ui/react';
import { useToast } from './useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { PaginationProps, PaginationResponse } from '../common/fetch/type';
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

type ItemHeight<T> = (index: number, data: T) => number;

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

export function useScrollPagination<
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

  const noMore = useRef(false);

  const { toast } = useToast();
  const [current, setCurrent] = useState(1);
  const [data, setData] = useState<TData['list']>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, { setTrue, setFalse }] = useBoolean(false);

  const [list] = useVirtualList<TData['list'][0]>(data, {
    containerTarget: containerRef,
    wrapperTarget: wrapperRef,
    itemHeight,
    overscan
  });

  const loadData = useLockFn(async (num: number = current) => {
    if (noMore.current && num !== 1) return;

    setTrue();

    try {
      const res = await api({
        current: num,
        pageSize,
        ...defaultParams
      } as TParams);

      setTotal(res.total);
      setCurrent(num);

      if (num === 1) {
        // init or reload
        setData(res.list);
        noMore.current = res.list.length >= res.total;
      } else {
        const totalLength = data.length + res.list.length;
        noMore.current = totalLength >= res.total;
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
            {noMore.current && list.length > 0 && (
              <Box py={4} textAlign={'center'} color={'myGray.600'} fontSize={'xs'}>
                {t('common:common.No more data')}
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
      console.log('reload', 11111);
      loadData(1);
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
      console.log('=======', 111111);
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        loadData(current + 1);
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
