'use client';
import React, { useRef, useState } from 'react';
import { Table, Thead, Tbody, Tr, Th, Td, Flex, Box, HStack, Button } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import AdminCompositeSearch, { useAdminCompositeSearch } from '@/components/admin/CompositeSearch';
import type { AdminSearchOption } from '@/components/admin/CompositeSearch/utils';
import { getDatasets } from '@/web/admin/dataset/api';
import BoxPageRoot from '@/components/admin/BoxContainer/PageRoot';
import { useRouter } from 'next/router';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';
import MyBox from '@fastgpt/web/components/common/MyBox';

const datasetSearchOptions: readonly AdminSearchOption<
  'username' | 'teamId' | 'teamName' | 'datasetId' | 'datasetName'
>[] = [
  { value: 'username', label: '用户名', placeholder: '搜索用户名' },
  { value: 'teamId', label: '团队 ID', placeholder: '搜索团队 ID', exactObjectId: true },
  { value: 'teamName', label: '团队名', placeholder: '搜索团队名' },
  { value: 'datasetId', label: '知识库 ID', placeholder: '搜索知识库 ID', exactObjectId: true },
  { value: 'datasetName', label: '知识库名', placeholder: '搜索知识库名' }
];

const DatasetTable = () => {
  const [appDetail, setAppDetail] = useState();
  const router = useRouter();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { searchField, inputValue, isInvalid, searchParams, onFieldChange, onInputChange } =
    useAdminCompositeSearch({ options: datasetSearchOptions });

  const {
    data: datasets,
    isLoading,
    Pagination,
    total,
    pageSize
  } = usePagination(getDatasets, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'admin-datasets-list',
    params: searchParams,
    refreshDeps: [searchParams],
    scrollContainerRef
  });

  const routeToDataset = (id: string) => {
    window.open(getWebReqUrl('/dataset/detail?datasetId=' + id), '_blank');
  };

  return (
    <BoxPageRoot display={'flex'} flexDirection={'column'} h={'100%'} p={0}>
      <Flex
        h={'64px'}
        flexShrink={0}
        px={6}
        alignItems={'center'}
        borderBottom={'1px solid'}
        borderColor={'myGray.200'}
      >
        <Box as={'h1'} {...accountTitleTextStyles}>
          用户知识库
        </Box>
        <Box flexGrow={1}></Box>
        <AdminCompositeSearch
          options={datasetSearchOptions}
          field={searchField}
          value={inputValue}
          triggerW={'112px'}
          w={['100%', '311px']}
          isInvalid={isInvalid}
          onFieldChange={onFieldChange}
          onValueChange={onInputChange}
        />
      </Flex>

      <MyBox isLoading={isLoading} flex={'1 0 0'} h={0} minH={0}>
        <FixedTableContainer
          ref={scrollContainerRef}
          position={'relative'}
          h={'100%'}
          maxH={'none'}
          px={[4, 6]}
          py={6}
          footer={
            total > pageSize ? (
              <Flex mt={3} justifyContent={'center'}>
                <Pagination />
              </Flex>
            ) : undefined
          }
        >
          <Table minW={'1100px'}>
            <Thead>
              <Tr>
                <Th>知识库名</Th>
                <Th>创建者</Th>
                <Th>介绍</Th>
                <Th>数据量</Th>
                <Th>向量总数</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody fontSize={'sm'}>
              {datasets.map((item) => (
                <Tr key={item.id}>
                  <Td>{item.name}</Td>
                  <Td
                    cursor={'pointer'}
                    onClick={() => {
                      router.push(`/admin/users?username=${item.username}`);
                    }}
                  >
                    {item.username}
                  </Td>
                  <Td>{item.intro}</Td>
                  <Td>{item.totalDatas}</Td>
                  <Td>{item.totalVectors}</Td>
                  <Td>
                    <HStack>
                      <Button
                        variant={'whiteBase'}
                        size={'sm'}
                        onClick={() => routeToDataset(item.id)}
                      >
                        跳转
                      </Button>
                    </HStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {!isLoading && datasets.length === 0 && (
            <Flex
              mt={'20vh'}
              flexDirection={'column'}
              alignItems={'center'}
              justifyContent={'center'}
            >
              <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
              <Box mt={2} color={'myGray.500'}>
                无应用记录～
              </Box>
            </Flex>
          )}
        </FixedTableContainer>
      </MyBox>

      {!!appDetail && <AppDetailModal app={appDetail} onClose={() => setAppDetail(undefined)} />}
    </BoxPageRoot>
  );
};

export default DatasetTable;

function AppDetailModal({ app, onClose }: { app: any; onClose: () => void }) {
  return (
    <MyModal isOpen={true} onClose={onClose} title={'应用详情'} maxW={['90vw', '700px']}>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>应用id:</Box>
        <Box>{app.id}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>应用名:</Box>
        <Box>{app.name}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>介绍:</Box>
        <Box>{app.intro}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>收藏数:</Box>
        <Box>{app['share.collection']}</Box>
      </Flex>
    </MyModal>
  );
}
