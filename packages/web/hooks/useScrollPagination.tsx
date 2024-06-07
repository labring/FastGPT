import React, { useRef, useState, useEffect } from 'react';
import { Box, BoxProps } from '@chakra-ui/react';
import { useToast } from './useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { PaginationProps, PaginationResponse } from '../common/fetch/type';
import {
  useBoolean,
  useLockFn,
  useMemoizedFn,
  useMount,
  useScroll,
  useVirtualList,
  useRequest
} from 'ahooks';
import MyBox from '../components/common/MyBox';
import { useTranslation } from 'next-i18next';

export function useScrollPagination<
  TParams extends PaginationProps,
  TData extends PaginationResponse
>(
  api: (data: TParams) => Promise<TData>,
  {
    debounceWait,
    throttleWait,
    refreshDeps,
    itemHeight = 50,
    overscan = 10,

    pageSize = 10,
    defaultParams = {}
  }: {
    debounceWait?: number;
    throttleWait?: number;
    refreshDeps?: any[];

    itemHeight: number;
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
        title: getErrText(error, '获取数据异常'),
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
        <>
          <MyBox isLoading={isLoading} ref={containerRef} overflow={'overlay'} {...props}>
            <Box ref={wrapperRef}>{children}</Box>
            {noMore.current && list.length > 0 && (
              <Box py={4} textAlign={'center'} color={'myGray.600'} fontSize={'xs'}>
                {t('common.No more data')}
              </Box>
            )}
            {list.length === 0 && !isLoading && EmptyChildren && <>{EmptyChildren}</>}
          </MyBox>
        </>
      );
    }
  );

  useRequest(() => loadData(1), {
    refreshDeps,
    debounceWait: data.length === 0 ? 0 : debounceWait,
    throttleWait
  });

  const scroll = useScroll(containerRef);
  useEffect(() => {
    if (!containerRef.current || list.length === 0) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;

    if (scrollTop + clientHeight >= scrollHeight - 100) {
      loadData(current + 1);
    }
  }, [scroll]);

  return {
    containerRef,
    list,
    data,
    setData,
    isLoading,
    ScrollList,
    fetchData: loadData,
    scroll2Top
  };
}
