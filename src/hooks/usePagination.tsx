import { useState, useCallback, useMemo, useEffect } from 'react';
import type { PagingData } from '../types/index';
import { IconButton, Flex, Box, Input } from '@chakra-ui/react';
import { ArrowBackIcon, ArrowForwardIcon } from '@chakra-ui/icons';
import { useMutation } from '@tanstack/react-query';
import { useToast } from './useToast';
import { useQuery } from '@tanstack/react-query';

export const usePagination = <T = any,>({
  api,
  pageSize = 10,
  params = {},
  defaultRequest = true
}: {
  api: (data: any) => any;
  pageSize?: number;
  params?: Record<string, any>;
  defaultRequest?: boolean;
}) => {
  const { toast } = useToast();
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [data, setData] = useState<T[]>([]);
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
        setTotal(res.total);
        setData(res.data);
      } catch (error: any) {
        toast({
          title: error?.message || '获取数据异常',
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
          size={'sm'}
          w={'28px'}
          h={'28px'}
          onClick={() => mutate(pageNum - 1)}
        />
        <Flex mx={2} alignItems={'center'}>
          <Input
            defaultValue={pageNum}
            w={'50px'}
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
          />
          <Box mx={2}>/</Box>
          {maxPage}
        </Flex>
        <IconButton
          isDisabled={pageNum === maxPage}
          icon={<ArrowForwardIcon />}
          aria-label={'left'}
          size={'sm'}
          w={'28px'}
          h={'28px'}
          onClick={() => mutate(pageNum + 1)}
        />
      </Flex>
    );
  }, [maxPage, mutate, pageNum]);

  useEffect(() => {
    defaultRequest && mutate(1);
  }, []);

  return {
    pageNum,
    pageSize,
    total,
    data,
    isLoading,
    Pagination,
    getData: mutate
  };
};
