import React, { useState, useRef, useCallback } from 'react';
import { Box, Flex, Card, Grid, Input } from '@chakra-ui/react';
import { useLoading } from '@/hooks/useLoading';
import { getShareModelList, triggerModelCollection } from '@/api/model';
import { usePagination } from '@/hooks/usePagination';
import type { ShareModelItem } from '@/types/model';
import { useUserStore } from '@/store/user';
import ShareModelList from './components/list';
import styles from './index.module.scss';

const modelList = () => {
  const { Loading } = useLoading();
  const lastSearch = useRef('');
  const [searchText, setSearchText] = useState('');
  const { refreshModel } = useUserStore();

  /* 加载模型 */
  const {
    data: models,
    isLoading,
    Pagination,
    getData,
    pageNum
  } = usePagination<ShareModelItem>({
    api: getShareModelList,
    pageSize: 24,
    params: {
      searchText
    }
  });

  const onclickCollection = useCallback(
    async (modelId: string) => {
      try {
        await triggerModelCollection(modelId);
        getData(pageNum);
        refreshModel.removeModelDetail(modelId);
      } catch (error) {
        console.log(error);
      }
    },
    [getData, pageNum, refreshModel]
  );

  return (
    <Box px={[5, 10]} py={[4, 6]} position={'relative'} minH={'109vh'}>
      <Flex alignItems={'center'} mb={2}>
        <Box className={'textlg'} fontWeight={'bold'} fontSize={'3xl'}>
          AI 应用市场
        </Box>
        {/* <Box mt={[2, 0]} textAlign={'right'}>
          <Input
            w={['200px', '250px']}
            size={'sm'}
            value={searchText}
            placeholder="搜索应用，回车确认"
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
        </Box> */}
      </Flex>
      <Grid
        templateColumns={[
          'repeat(1,1fr)',
          'repeat(2,1fr)',
          'repeat(3,1fr)',
          'repeat(4,1fr)',
          'repeat(5,1fr)'
        ]}
        gridGap={4}
        mt={4}
      >
        <ShareModelList models={models} onclickCollection={onclickCollection} />
      </Grid>
      <Flex mt={4} justifyContent={'center'}>
        <Pagination />
      </Flex>

      <Loading loading={isLoading} />
    </Box>
  );
};

export default modelList;
