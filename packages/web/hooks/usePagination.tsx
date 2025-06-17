import { useRef, useState, useCallback, type RefObject, type ReactNode, useMemo } from 'react';
import { IconButton, Flex, Box, Input, type BoxProps } from '@chakra-ui/react';
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

import { type PaginationProps, type PaginationResponse } from '../common/fetch/type';

const thresholdVal = 200;

export function usePagination<DataT, ResT = {}>(
  api: (data: PaginationProps<DataT>) => Promise<PaginationResponse<ResT>>,
  {
    pageSize = 10,
    params,
    defaultRequest = true,
    type = 'button',
    onChange,
    refreshDeps,
    scrollLoadType = 'bottom',
    EmptyTip
  }: {
    pageSize?: number;
    params?: DataT;
    defaultRequest?: boolean;
    type?: 'button' | 'scroll';
    onChange?: (pageNum: number) => void;
    refreshDeps?: any[];
    throttleWait?: number;
    scrollLoadType?: 'top' | 'bottom';
    EmptyTip?: React.JSX.Element;
  }
) {
  const { toast } = useToast();
  const { t } = useTranslation();

  const [isLoading, { setTrue, setFalse }] = useBoolean(false);

  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [data, setData] = useState<ResT[]>([]);
  const totalDataLength = useMemo(() => Math.max(total, data.length), [total, data.length]);

  const isEmpty = total === 0 && !isLoading;
  const noMore = data.length >= totalDataLength;

  const fetchData = useMemoizedFn(
    async (num: number = pageNum, ScrollContainerRef?: RefObject<HTMLDivElement>) => {
      if (noMore && num !== 1) return;
      setTrue();

      try {
        const res = await api({
          pageNum: num,
          pageSize,
          ...params
        });

        // Check total and set
        setPageNum(num);
        res.total !== undefined && setTotal(res.total);

        if (type === 'scroll') {
          if (scrollLoadType === 'top') {
            const prevHeight = ScrollContainerRef?.current?.scrollHeight || 0;
            const prevScrollTop = ScrollContainerRef?.current?.scrollTop || 0;
            // 使用 requestAnimationFrame 来调整滚动位置
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

            setData((prevData) => (num === 1 ? res.list : [...res.list, ...prevData]));
            adjustScrollPosition();
          } else {
            setData((prevData) => (num === 1 ? res.list : [...prevData, ...res.list]));
          }
        } else {
          setData(res.list);
        }

        onChange?.(num);
      } catch (error: any) {
        if (error.code !== 'ERR_CANCELED') {
          toast({
            title: getErrText(error, t('common:core.chat.error.data_error')),
            status: 'error'
          });
        }
      }

      setFalse();
    }
  );

  // Button pagination
  const Pagination = useCallback(() => {
    const maxPage = Math.ceil(totalDataLength / pageSize);

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
  }, [isLoading, totalDataLength, pageSize, fetchData, pageNum]);

  // Scroll pagination
  const DefaultRef = useRef<HTMLDivElement>(null);
  const ScrollData = useMemoizedFn(
    ({
      children,
      ScrollContainerRef,
      ...props
    }: {
      children: ReactNode;
      ScrollContainerRef?: RefObject<HTMLDivElement>;
    } & BoxProps) => {
      const ref = ScrollContainerRef || DefaultRef;
      const loadText = (() => {
        if (isLoading) return t('common:is_requesting');
        if (noMore) return t('common:request_end');
        return t('common:request_more');
      })();

      const scroll = useScroll(ref);

      // Watch scroll position
      useThrottleEffect(
        () => {
          if (!ref?.current || type !== 'scroll' || noMore || isLoading) return;
          const { scrollTop, scrollHeight, clientHeight } = ref.current;

          if (
            (scrollLoadType === 'bottom' &&
              scrollTop + clientHeight >= scrollHeight - thresholdVal) ||
            (scrollLoadType === 'top' && scrollTop < thresholdVal)
          ) {
            fetchData(pageNum + 1, ref);
          }
        },
        [scroll, isLoading],
        { wait: 50 }
      );

      return (
        <Box {...props} ref={ref} overflow={'overlay'}>
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
                fetchData(pageNum + 1);
              }}
            >
              {loadText}
            </Box>
          )}
          {isEmpty && EmptyTip}
        </Box>
      );
    }
  );

  // Reload data
  const { runAsync: refresh } = useRequest(
    async () => {
      defaultRequest && fetchData(1);
    },
    {
      manual: false,
      refreshDeps,
      throttleWait: 100
    }
  );

  return {
    pageNum,
    setPageNum,
    pageSize,
    total: totalDataLength,
    data,
    setData,
    isLoading,
    Pagination,
    ScrollData,
    getData: fetchData,
    refresh
  };
}
