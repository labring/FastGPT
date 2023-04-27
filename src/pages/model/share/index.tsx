import React, { useState, useRef } from 'react';
import { Box, Flex, Card, Grid, Input } from '@chakra-ui/react';
import { useLoading } from '@/hooks/useLoading';
import { getShareModelList } from '@/api/model';
import { usePagination } from '@/hooks/usePagination';
import type { ShareModelItem } from '@/types/model';

import ShareModelList from './components/list';

const modelList = () => {
  const { Loading, setIsLoading } = useLoading();
  const lastSearch = useRef('');
  const [searchText, setSearchText] = useState('');

  /* 加载模型 */
  const {
    data: models,
    isLoading,
    Pagination,
    getData
  } = usePagination<ShareModelItem>({
    api: getShareModelList,
    pageSize: 20,
    params: {
      searchText
    }
  });

  return (
    <Box position={'relative'}>
      {/* 头部 */}
      <Card px={6} py={3}>
        <Flex alignItems={'center'} justifyContent={'space-between'}>
          <Box fontWeight={'bold'} fontSize={'xl'}>
            模型共享市场
          </Box>
          <Box flex={1}>(Beta)</Box>
          <Input
            maxW={'240px'}
            size={'sm'}
            value={searchText}
            placeholder="搜索模型，回车确认"
            onChange={(e) => setSearchText(e.target.value)}
            onBlur={() => {
              if (searchText === lastSearch.current) return;
              getData(1);
              lastSearch.current = searchText;
            }}
            onKeyDown={(e) => {
              if (searchText === lastSearch.current) return;
              if (e.key === 'Enter') {
                getData(1);
                lastSearch.current = searchText;
              }
            }}
          />
        </Flex>
      </Card>

      <Grid templateColumns={['1fr', '1fr 1fr']} gridGap={4} mt={4}>
        <ShareModelList models={models} />
      </Grid>

      <Box mt={4}>
        <Pagination />
      </Box>

      <Loading loading={isLoading} />
    </Box>
  );
};

export default modelList;
