import { useRef, useState, useEffect } from 'react';
import { Box, BoxProps } from '@chakra-ui/react';
import { useToast } from './useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { PaginationProps, PaginationResponse } from '../common/fetch/type';
import { useBoolean, useLockFn, useMemoizedFn, useMount, useScroll, useVirtualList } from 'ahooks';
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
    if (noMore.current) return;

    setTrue();

    try {
      const res = await api({
        current: num,
        pageSize,
        ...defaultParams
      } as TParams);

      setCurrent(num);

      if (num === 1) {
        // reload
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

  const ScrollList = useMemoizedFn(
    ({
      children,
      isLoading,
      ...props
    }: { children: React.ReactNode; isLoading?: boolean } & BoxProps) => {
      return (
        <MyBox isLoading={isLoading} ref={containerRef} overflow={'overlay'} {...props}>
          <Box ref={wrapperRef}>{children}</Box>
          {noMore.current && (
            <Box pb={2} textAlign={'center'} color={'myGray.600'} fontSize={'sm'}>
              {t('common.No more data')}
            </Box>
          )}
        </MyBox>
      );
    }
  );

  useMount(() => {
    loadData(1);
  });

  const scroll = useScroll(containerRef);
  useEffect(() => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;

    if (scrollTop + clientHeight >= scrollHeight - 100) {
      loadData(current + 1);
    }
  }, [scroll]);

  return {
    containerRef,
    list,
    isLoading,
    ScrollList,
    fetchData: loadData
  };
}
