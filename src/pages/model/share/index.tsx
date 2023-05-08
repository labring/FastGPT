import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Box, Flex, Card, Grid, Input } from '@chakra-ui/react';
import { useLoading } from '@/hooks/useLoading';
import { getShareModelList, triggerModelCollection, getCollectionModels } from '@/api/model';
import { usePagination } from '@/hooks/usePagination';
import type { ShareModelItem } from '@/types/model';
import { useUserStore } from '@/store/user';
import ShareModelList from './components/list';
import { useQuery } from '@tanstack/react-query';

const modelList = () => {
  const { Loading } = useLoading();
  const lastSearch = useRef('');
  const [searchText, setSearchText] = useState('');
  const { refreshModel } = useUserStore();

  /* 加载模型 */
  const { data, isLoading, Pagination, getData, pageNum } = usePagination<ShareModelItem>({
    api: getShareModelList,
    pageSize: 20,
    params: {
      searchText
    }
  });

  const { data: collectionModels = [], refetch: refetchCollection } = useQuery(
    ['getCollectionModels'],
    getCollectionModels
  );

  const models = useMemo(() => {
    if (!collectionModels) return [];
    return data.map((model) => ({
      ...model,
      isCollection: !!collectionModels.find((item) => item._id === model._id)
    }));
  }, [collectionModels, data]);

  const onclickCollection = useCallback(
    async (modelId: string) => {
      try {
        await triggerModelCollection(modelId);
        getData(pageNum);
        refetchCollection();
        refreshModel.removeModelDetail(modelId);
      } catch (error) {
        console.log(error);
      }
    },
    [getData, pageNum, refetchCollection, refreshModel]
  );

  return (
    <Box py={[5, 10]} px={'5vw'}>
      <Card px={6} py={3}>
        <Flex alignItems={'center'} justifyContent={'space-between'}>
          <Box fontWeight={'bold'} fontSize={'xl'}>
            我收藏的AI助手
          </Box>
        </Flex>
        {collectionModels.length == 0 && (
          <Box textAlign={'center'} pt={3}>
            还没有收藏AI助手~
          </Box>
        )}
        <Grid templateColumns={['1fr', '1fr 1fr', '1fr 1fr 1fr']} gridGap={4} mt={4}>
          <ShareModelList models={collectionModels} onclickCollection={onclickCollection} />
        </Grid>
      </Card>

      <Card mt={5} px={6} py={3}>
        <Box display={['block', 'flex']} alignItems={'center'} justifyContent={'space-between'}>
          <Box fontWeight={'bold'} flex={1} fontSize={'xl'}>
            AI助手市场
            <Box as={'span'} fontWeight={'normal'} fontSize={'md'}>
              (Beta)
            </Box>
          </Box>
          <Box mt={[2, 0]} textAlign={'right'}>
            <Input
              maxW={'240px'}
              size={'sm'}
              value={searchText}
              placeholder="搜索AI助手，回车确认"
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
          </Box>
        </Box>
        <Grid templateColumns={['1fr', '1fr 1fr', '1fr 1fr 1fr']} gridGap={4} mt={4}>
          <ShareModelList models={models} onclickCollection={onclickCollection} />
        </Grid>
        <Box mt={4}>
          <Pagination />
        </Box>
      </Card>

      <Loading loading={isLoading} />
    </Box>
  );
};

export default modelList;
