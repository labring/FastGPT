'use client';
import React, { useState } from 'react';
import {
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Flex,
  Box,
  HStack,
  Input,
  InputGroup
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getApps } from '@/web/admin/apps/api';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import BoxCard from '@/components/admin/BoxContainer/Card';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';

const AppTable = () => {
  const [appDetail, setAppDetail] = useState<any>();
  const [searchKey, setSearchKey] = useState<string>();

  const {
    data: apps,
    isLoading,
    ScrollData
  } = useScrollPagination(getApps, {
    pageSize: 20,
    params: {
      searchKey
    },
    refreshDeps: [searchKey],
    throttleWait: 200
  });

  const routeToApp = (id: string) => {
    window.open(getWebReqUrl('/app/detail?appId=' + id), '_blank');
  };

  return (
    <BoxCard display={'flex'} flexDirection={'column'} h={'100%'}>
      <HStack pb={4}>
        <Box as={'h1'} {...accountTitleTextStyles}>
          应用列表
        </Box>
        <Box flexGrow={1}></Box>
        <InputGroup w={['100%', '250px']}>
          <Input
            placeholder="请输入应用名或应用id搜索"
            size={'sm'}
            onChange={(e) => setSearchKey(e.target.value)}
          ></Input>
        </InputGroup>
      </HStack>
      <ScrollData position={'relative'} h={'100%'}>
        <TableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>应用id</Th>
                <Th>应用名</Th>
                <Th>创建者</Th>
                <Th>团队</Th>
                <Th>介绍</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody fontSize={'sm'}>
              {apps.map((item, i) => (
                <Tr key={i}>
                  <Td>{item.id}</Td>
                  <Td>{item.name}</Td>
                  <Td>{item.username}</Td>
                  <Td>{item.teamName}</Td>
                  <Td maxW={'300px'} className="textEllipsis">
                    {item.intro || '-'}
                  </Td>
                  <Td textAlign={'center'}>
                    <HStack spacing={2} ml={4}>
                      <Button variant={'whiteBase'} size={'sm'} onClick={() => setAppDetail(item)}>
                        详情
                      </Button>
                      <Button variant={'whiteBase'} size={'sm'} onClick={() => routeToApp(item.id)}>
                        跳转
                      </Button>
                    </HStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {!isLoading && apps.length === 0 && (
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
        </TableContainer>
      </ScrollData>

      {!!appDetail && <AppDetailModal app={appDetail} onClose={() => setAppDetail(undefined)} />}
    </BoxCard>
  );
};

export default AppTable;

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
        <Box flex={'0 0 120px'}>创建者:</Box>
        <Box>{app.username}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>创建者 ID:</Box>
        <Box>{app.userId}</Box>
      </Flex>
    </MyModal>
  );
}
