import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { IconButton, Flex, Box, Input } from '@chakra-ui/react';
import { ArrowBackIcon, ArrowForwardIcon } from '@chakra-ui/icons';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'next-i18next';
import { throttle } from 'lodash';
import { useToast } from './useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';

const thresholdVal = 100;

type PagingData<T> = {
  pageNum: number;
  pageSize: number;
  data: T[];
  total?: number;
};

export function usePagination<T = any>({
  api,
  pageSize = 10,
  params = {},
  defaultRequest = true,
  type = 'button',
  onChange,
  elementRef
}: {
  api: (data: any) => any;
  pageSize?: number;
  params?: Record<string, any>;
  defaultRequest?: boolean;
  type?: 'button' | 'scroll';
  onChange?: (pageNum: number) => void;
  elementRef?: React.RefObject<HTMLDivElement>;
}) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [pageNum, setPageNum] = useState(1);
  const pageNumRef = useRef(pageNum);
  pageNumRef.current = pageNum;
  const [total, setTotal] = useState(0);
  const totalRef = useRef(total);
  totalRef.current = total;
  const [data, setData] = useState<T[]>([]);
  const dataLengthRef = useRef(data.length);
  dataLengthRef.current = data.length;
  const maxPage = useMemo(() => Math.ceil(total / pageSize) || 1, [pageSize, total]);

  const { mutate, isLoading } = useMutation({
    mutationFn: async (num: number = pageNum) => {
      try {
        const res: PagingData<T> = await api({
          pageNum: num,
          pageSize,
          ...params
        });
        setPageNum(num);
        res.total !== undefined && setTotal(res.total);
        if (type === 'scroll') {
          setData((prevData) => [...prevData, ...res.data]);
        } else {
          setData(res.data);
        }
        onChange && onChange(num);
      } catch (error: any) {
        toast({
          title: getErrText(error, t('common:core.chat.error.data_error')),
          status: 'error'
        });
        console.log(error);
      }
      return null;
    }
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
          onClick={() => mutate(pageNum - 1)}
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
                mutate(maxPage);
              } else if (val < 1) {
                mutate(1);
              } else {
                mutate(+e.target.value);
              }
            }}
            onKeyDown={(e) => {
              // @ts-ignore
              const val = +e.target.value;
              if (val && e.keyCode === 13) {
                if (val === pageNum) return;
                if (val >= maxPage) {
                  mutate(maxPage);
                } else if (val < 1) {
                  mutate(1);
                } else {
                  mutate(val);
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
          onClick={() => mutate(pageNum + 1)}
        />
      </Flex>
    );
  }, [isLoading, maxPage, mutate, pageNum]);

  const ScrollData = useCallback(
    ({ children, ...props }: { children: React.ReactNode }) => {
      const loadText = useMemo(() => {
        if (isLoading) return t('common:common.is_requesting');
        if (total <= data.length) return t('common:common.request_end');
        return t('common:common.request_more');
      }, []);

      return (
        <Box {...props} ref={elementRef} overflow={'overlay'}>
          {children}
          <Box
            mt={2}
            fontSize={'xs'}
            color={'blackAlpha.500'}
            textAlign={'center'}
            cursor={loadText === t('common:common.request_more') ? 'pointer' : 'default'}
            onClick={() => {
              if (loadText !== t('common:common.request_more')) return;
              mutate(pageNum + 1);
            }}
          >
            {loadText}
          </Box>
        </Box>
      );
    },
    [data.length, isLoading, mutate, pageNum, total]
  );

  useEffect(() => {
    if (!elementRef?.current || type !== 'scroll') return;

    const scrolling = throttle((e: Event) => {
      const element = e.target as HTMLDivElement;
      if (!element) return;
      // 当前滚动位置
      const scrollTop = element.scrollTop;
      // 可视高度
      const clientHeight = element.clientHeight;
      // 内容总高度
      const scrollHeight = element.scrollHeight;
      // 判断是否滚动到底部
      if (
        scrollTop + clientHeight + thresholdVal >= scrollHeight &&
        dataLengthRef.current < totalRef.current
      ) {
        mutate(pageNumRef.current + 1);
      }
    }, 100);

    const handleScroll = (e: Event) => {
      scrolling(e);
    };

    elementRef.current.addEventListener('scroll', handleScroll);
    return () => {
      elementRef.current?.removeEventListener('scroll', handleScroll);
    };
  }, [elementRef, mutate, pageNum, type, total, data.length]);

  useEffect(() => {
    defaultRequest && mutate(1);
  }, []);

  return {
    pageNum,
    pageSize,
    total,
    data,
    setData,
    isLoading,
    Pagination,
    ScrollData,
    getData: mutate
  };
}
