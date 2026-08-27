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
  InputGroup,
  Input,
  InputLeftElement
} from '@chakra-ui/react';
import dayjs from 'dayjs';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getUsers } from '@/web/admin/users/api';
import UserEditModal from './components/UserEditModal';
import type { UserItemType } from '@fastgpt/global/openapi/admin/routes/users/api';
import UserAddModal from './components/UserAddModal';
import BoxCard from '@/components/admin/BoxContainer/Card';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';

const UserTable = () => {
  // const [username, setUsername] = useState<string>();
  const { isPc } = useSystem();
  const [userDetail, setUserDetail] = useState<UserItemType>();
  const [search, setSearch] = useState<string>();

  const {
    data: users,
    isLoading,
    ScrollData,
    getData
  } = usePagination(getUsers, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'users-users-list',
    params: {
      username: search
    },
    type: 'scroll',
    refreshDeps: [search]
  });

  return (
    <BoxCard display={'flex'} flexDirection={'column'} h={'100%'}>
      <HStack pb={4}>
        {isPc && (
          <Box as={'h1'} {...accountTitleTextStyles}>
            用户信息
          </Box>
        )}
        <Box flexGrow={1}></Box>

        <InputGroup w={['100%', '250px']}>
          <InputLeftElement h={'full'}>
            <MyIcon name="common/searchLight" w={4} color={'myGray.400'} />
          </InputLeftElement>
          <Input
            placeholder="请输入用户名搜索"
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            size={'sm'}
          ></Input>
        </InputGroup>
        <UserAddModal
          data={{}}
          updateData={() => {
            getData(1);
          }}
        />
      </HStack>

      <ScrollData position={'relative'} h={'100%'}>
        <TableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>#</Th>
                <Th>用户名</Th>
                <Th>创建时间</Th>
                <Th>状态</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody fontSize={'sm'}>
              {users.map((item, i) => (
                <Tr key={i}>
                  <Td>{i + 1}</Td>
                  <Td>{item.username}</Td>
                  <Td>
                    {item.createTime ? dayjs(item.createTime).format('YYYY/MM/DD HH:mm:ss') : '-'}
                  </Td>
                  <Td>{item.status}</Td>
                  <Td>
                    <Button
                      variant={'whiteBase'}
                      size={'sm'}
                      mr={2}
                      onClick={() => setUserDetail(item)}
                    >
                      详情
                    </Button>
                    <UserEditModal
                      data={item}
                      getData={() => {
                        getData(1);
                      }}
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {!isLoading && users.length === 0 && (
            <Flex
              mt={'20vh'}
              flexDirection={'column'}
              alignItems={'center'}
              justifyContent={'center'}
            >
              <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
              <Box mt={2} color={'myGray.500'}>
                无用户记录～
              </Box>
            </Flex>
          )}
        </TableContainer>
      </ScrollData>

      {!!userDetail && (
        <UserDetailModal user={userDetail} onClose={() => setUserDetail(undefined)} />
      )}
    </BoxCard>
  );
};

export default UserTable;

function UserDetailModal({ user, onClose }: { user: UserItemType; onClose: () => void }) {
  return (
    <MyModal isOpen={true} onClose={onClose} title={'用户详情'} maxW={['90vw', '700px']}>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>用户名</Box>
        <Box>{user.username}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>创建时间:</Box>
        <Box>{dayjs(user.createTime).format('YYYY/MM/DD HH:mm:ss')}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>联系方式:</Box>
        <Box>{user.contact || '-'}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>状态:</Box>
        <Box>{user.status}</Box>
      </Flex>
    </MyModal>
  );
}
