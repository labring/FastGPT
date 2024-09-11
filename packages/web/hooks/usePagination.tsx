import { useRef, useState, useCallback, useMemo } from 'react';
import { IconButton, Flex, Box, Input, BoxProps } from '@chakra-ui/react';
import { ArrowBackIcon, ArrowForwardIcon } from '@chakra-ui/icons';
import { useTranslation } from 'next-i18next';
import { useToast } from './useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  useBoolean,
  useLockFn,
  useMemoizedFn,
  useRequest,
  useScroll,
  useThrottleEffect
} from 'ahooks';

type PagingData<T> = {
  pageNum: number;
  pageSize: number;
  data: T[];
  total?: number;
};

export function usePagination<ResT = any>({
  api,
  pageSize = 10,
  params = {},
  defaultRequest = true,
  type = 'button',
  onChange,
  refreshDeps
}: {
  api: (data: any) => Promise<PagingData<ResT>>;
  pageSize?: number;
  params?: Record<string, any>;
  defaultRequest?: boolean;
  type?: 'button' | 'scroll';
  onChange?: (pageNum: number) => void;
  refreshDeps?: any[];
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [pageNum, setPageNum] = useState(1);

  const ScrollContainerRef = useRef<HTMLDivElement>(null);

  const noMore = useRef(false);

  const [isLoading, { setTrue, setFalse }] = useBoolean(false);

  const [total, setTotal] = useState(0);
  const [data, setData] = useState<ResT[]>([]);

  const maxPage = useMemo(() => Math.ceil(total / pageSize) || 1, [pageSize, total]);

  const fetchData = useLockFn(async (num: number = pageNum) => {
    if (noMore.current && num !== 1) return;
    setTrue();

    try {
      const res: PagingData<ResT> = await api({
        pageNum: num,
        pageSize,
        ...params
      });

      // Check total and set
      res.total !== undefined && setTotal(res.total);

      if (res.total !== undefined && res.total <= data.length + res.data.length) {
        noMore.current = true;
      }

      setPageNum(num);

      if (type === 'scroll') {
        setData((prevData) => (num === 1 ? res.data : [...prevData, ...res.data]));
      } else {
        setData(res.data);
      }

      onChange?.(num);
    } catch (error: any) {
      toast({
        title: getErrText(error, t('common:core.chat.error.data_error')),
        status: 'error'
      });
      console.log(error);
    }

    setFalse();
  });

  const Pagination = useCallback(() => {
    return (
      <Flex alignItems={'center'} justifyContent={'end'}>
        <IconButton
          isDisabled={pageNum === 1}
          icon={<ArrowBackIcon />}
          aria-label={'left'}
          size={'smSquare'}
          isLoading={isLoading}
          onClick={() => fetchData(pageNum - 1)}
        />
        <Flex mx={2} alignItems={'center'}>
          <Input
            defaultValue={pageNum}
            w={'50px'}
            h={'30px'}
            size={'xs'}
            type={'number'}
            min={1}
            max={maxPage}
            onBlur={(e) => {
              const val = +e.target.value;
              if (val === pageNum) return;
              if (val >= maxPage) {
                fetchData(maxPage);
              } else if (val < 1) {
                fetchData(1);
              } else {
                fetchData(+e.target.value);
              }
            }}
            onKeyDown={(e) => {
              // @ts-ignore
              const val = +e.target.value;
              if (val && e.key === 'Enter') {
                if (val === pageNum) return;
                if (val >= maxPage) {
                  fetchData(maxPage);
                } else if (val < 1) {
                  fetchData(1);
                } else {
                  fetchData(val);
                }
              }
            }}
          />
          <Box mx={2}>/</Box>
          {maxPage}
        </Flex>
        <IconButton
          isDisabled={pageNum === maxPage}
          icon={<ArrowForwardIcon />}
          aria-label={'left'}
          size={'sm'}
          isLoading={isLoading}
          w={'28px'}
          h={'28px'}
          onClick={() => fetchData(pageNum + 1)}
        />
      </Flex>
    );
  }, [isLoading, maxPage, fetchData, pageNum]);

  // Reload data
  const { runAsync: refresh } = useRequest(
    async () => {
      setData([]);
      defaultRequest && fetchData(1);
    },
    {
      manual: false,
      refreshDeps,
      throttleWait: 100
    }
  );

  const ScrollData = useMemoizedFn(
    ({ children, ...props }: { children: React.ReactNode } & BoxProps) => {
      const loadText = (() => {
        if (isLoading) return t('common:common.is_requesting');
        if (total <= data.length) return t('common:common.request_end');
        return t('common:common.request_more');
      })();

      return (
        <Box {...props} ref={ScrollContainerRef} overflow={'overlay'}>
          {children}
          <Box
            mt={2}
            fontSize={'xs'}
            color={'blackAlpha.500'}
            textAlign={'center'}
            cursor={loadText === t('common:common.request_more') ? 'pointer' : 'default'}
            onClick={() => {
              if (loadText !== t('common:common.request_more')) return;
              fetchData(pageNum + 1);
            }}
          >
            {loadText}
          </Box>
        </Box>
      );
    }
  );

  // Scroll check
  const scroll = useScroll(ScrollContainerRef);
  useThrottleEffect(
    () => {
      if (!ScrollContainerRef?.current || type !== 'scroll' || total === 0) return;
      const { scrollTop, scrollHeight, clientHeight } = ScrollContainerRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        fetchData(pageNum + 1);
      }
    },
    [scroll],
    { wait: 50 }
  );

  return {
    pageNum,
    pageSize,
    total,
    data,
    setData,
    isLoading,
    Pagination,
    ScrollData,
    getData: fetchData,
    refresh
  };
}
