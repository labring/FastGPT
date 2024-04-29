import { useRef, useState, useMemo, useEffect } from 'react';
import { Box, BoxProps } from '@chakra-ui/react';
import { useMutation } from '@tanstack/react-query';
import { useToast } from './useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { PaginationProps, PaginationResponse } from '../common/fetch/type';
import { useMemoizedFn, useMount, useScroll, useVirtualList } from 'ahooks';
import MyBox from '../components/common/MyBox';
import { useTranslation } from 'next-i18next';

export function useScrollPagination<
  TParams extends PaginationProps,
  TData extends PaginationResponse
>(
  api: (data: TParams) => Promise<TData>,
  {
    itemHeight = 50,
    overscan = 10,

    pageSize = 10,
    defaultParams = {}
  }: {
    itemHeight: number;
    overscan?: number;

    pageSize?: number;
    defaultParams?: Record<string, any>;
  }
) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef(null);

  const requesting = useRef(false);

  const { toast } = useToast();
  const [current, setCurrent] = useState(1);
  const [total, setTotal] = useState(0);
  const [data, setData] = useState<TData['list']>([]);

  const hasMore = useMemo(() => data.length === 0 || data.length < total, [data.length, total]);

  const [list] = useVirtualList(data, {
    containerTarget: containerRef,
    wrapperTarget: wrapperRef,
    itemHeight,
    overscan
  });

  const { mutate, isLoading } = useMutation({
    mutationFn: async (num: number = current) => {
      if (requesting.current || !hasMore) return;

      requesting.current = true;

      try {
        const res = await api({
          current: num,
          pageSize,
          ...defaultParams
        } as TParams);

        setCurrent(num);
        setTotal(res.total);

        if (num === 1) {
          setData(res.list);
        } else {
          setData((prev) => [...prev, ...res.list]);
        }
      } catch (error: any) {
        toast({
          title: getErrText(error, '获取数据异常'),
          status: 'error'
        });
        console.log(error);
      }

      requesting.current = false;
    }
  });

  const ScrollList = useMemoizedFn(
    ({
      children,
      isLoading,
      ...props
    }: { children: React.ReactNode; isLoading?: boolean } & BoxProps) => {
      return (
        <MyBox isLoading={isLoading} ref={containerRef} overflow={'overlay'} {...props}>
          <Box ref={wrapperRef}>{children}</Box>
          {!hasMore && (
            <Box pb={2} textAlign={'center'} color={'myGray.600'} fontSize={'sm'}>
              {t('common.No more data')}
            </Box>
          )}
        </MyBox>
      );
    }
  );

  useMount(() => {
    mutate(1);
  });

  const scroll = useScroll(containerRef);
  useEffect(() => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;

    if (scrollTop + clientHeight >= scrollHeight - 100) {
      mutate(current + 1);
    }
  }, [scroll]);

  return {
    containerRef,
    list,
    isLoading,
    ScrollList,
    fetchData: mutate as (num: number) => Promise<null>
  };
}
