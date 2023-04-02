import { useState, useCallback, useMemo } from 'react';
import type { PagingData } from '../types/index';
import { IconButton, Flex, Box } from '@chakra-ui/react';
import { ArrowBackIcon, ArrowForwardIcon } from '@chakra-ui/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from './useToast';

export const usePagination = <T = any,>({
  api,
  pageSize = 10,
  params = {}
}: {
  api: (data: any) => any;
  pageSize?: number;
  params?: Record<string, any>;
}) => {
  const { toast } = useToast();
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [data, setData] = useState<T[]>([]);
  const maxPage = useMemo(() => Math.ceil(total / pageSize), [pageSize, total]);

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
    }
  });
  useQuery(['init'], () => {
    mutate(1);
    return null;
  });

  const Pagination = useCallback(() => {
    return (
      <Flex alignItems={'center'} justifyContent={'end'}>
        <IconButton
          isDisabled={pageNum === 1}
          icon={<ArrowBackIcon />}
          aria-label={'left'}
          size={'sm'}
          onClick={() => mutate(pageNum - 1)}
        />
        <Box mx={2}>
          {pageNum}/{maxPage}
        </Box>
        <IconButton
          isDisabled={pageNum === maxPage}
          icon={<ArrowForwardIcon />}
          aria-label={'left'}
          size={'sm'}
          onClick={() => mutate(pageNum + 1)}
        />
      </Flex>
    );
  }, [maxPage, mutate, pageNum]);

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
