'use client';
import React, { useRef, useState } from 'react';
import {
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Flex,
  Box,
  InputGroup,
  Input,
  InputLeftElement
} from '@chakra-ui/react';
import dayjs from 'dayjs';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getUsers } from '@/web/admin/user/api';
import UserEditModal from './components/UserEditModal';
import type { UserItemType } from '@fastgpt/global/openapi/admin/user/api';
import UserAddModal from './components/UserAddModal';
import BoxPageRoot from '@/components/admin/BoxContainer/PageRoot';
import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';

const UserTable = () => {
  // const [username, setUsername] = useState<string>();
  const [userDetail, setUserDetail] = useState<UserItemType>();
  const [search, setSearch] = useState<string>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    data: users,
    isLoading,
    Pagination,
    total,
    pageSize,
    getData
  } = usePagination(getUsers, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'users-users-list',
    params: {
      username: search
    },
    refreshDeps: [search],
    scrollContainerRef
  });

  return (
    <BoxPageRoot display={'flex'} flexDirection={'column'} h={'100%'} p={0}>
      <Flex
        h={'64px'}
        flexShrink={0}
        px={6}
        alignItems={'center'}
        gap={2}
        borderBottom={'1px solid'}
        borderColor={'myGray.200'}
      >
        <Box as={'h1'} {...accountTitleTextStyles}>
          用户信息
        </Box>
        <Box flexGrow={1} />
        <InputGroup w={['100%', '250px']} h={'36px'}>
          <InputLeftElement h={'full'}>
            <MyIcon name="common/searchLight" w={4} color={'myGray.400'} />
          </InputLeftElement>
          <Input
            placeholder="请输入用户名搜索"
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            h={'36px'}
          ></Input>
        </InputGroup>
        <UserAddModal
          data={{}}
          updateData={() => {
            getData(1);
          }}
        />
      </Flex>

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
        <Table>
          <Thead>
            <Tr>
              <Th>用户名</Th>
              <Th>创建时间</Th>
              <Th>状态</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {users.map((item) => (
              <Tr key={item.username}>
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
      </FixedTableContainer>

      {!!userDetail && (
        <UserDetailModal user={userDetail} onClose={() => setUserDetail(undefined)} />
      )}
    </BoxPageRoot>
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
