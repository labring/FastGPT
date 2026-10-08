'use client';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
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
  const { t } = useClientTranslation('admin');
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
          {t('admin:user_info')}
        </Box>
        <Box flexGrow={1} />
        <InputGroup w={['100%', '250px']} h={'36px'}>
          <InputLeftElement h={'full'}>
            <MyIcon name="common/searchLight" w={4} color={'myGray.400'} />
          </InputLeftElement>
          <Input
            placeholder={t('admin:search_by_username')}
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
              <Th>{t('admin:username')}</Th>
              <Th>{t('admin:created_at')}</Th>
              <Th>{t('admin:status')}</Th>
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
                    {t('admin:details')}
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
              {t('admin:no_users')}
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
  const { t } = useClientTranslation('admin');
  return (
    <MyModal isOpen={true} onClose={onClose} title={'用户详情'} maxW={['90vw', '700px']}>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>{t('admin:username')}</Box>
        <Box>{user.username}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>{t('admin:created_at_2')}</Box>
        <Box>{dayjs(user.createTime).format('YYYY/MM/DD HH:mm:ss')}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>{t('admin:contact')}</Box>
        <Box>{user.contact || '-'}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>{t('admin:status_2')}</Box>
        <Box>{user.status}</Box>
      </Flex>
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>账号来源:</Box>
        {/* isSsoUser 由服务端按当前 SSO 配置权威判定，用于让管理员区分同步账号与本地账号 */}
        <Box>{user.isSsoUser ? 'SSO 同步' : '本地账号'}</Box>
      </Flex>
    </MyModal>
  );
}
