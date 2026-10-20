'use client';
import React, { useMemo, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
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
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { getUsers } from '@/web/admin/user/api';
import UserEditModal from './components/UserEditModal';
import {
  AdminUserStatusFilterEnum,
  type AdminUserStatusFilterType,
  type UserItemType
} from '@fastgpt/global/openapi/admin/user/api';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import UserAddModal from './components/UserAddModal';
import BoxPageRoot from '@/components/admin/BoxContainer/PageRoot';
import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

const allStatuses: AdminUserStatusFilterType[] = AdminUserStatusFilterEnum.options;
const defaultStatuses: AdminUserStatusFilterType[] = [UserStatusEnum.active];

const UserTable = () => {
  const { t } = useSafeTranslation();
  // const [username, setUsername] = useState<string>();
  const [userDetail, setUserDetail] = useState<UserItemType>();
  const [search, setSearch] = useState<string>();
  const [statuses, setStatuses] = useState<AdminUserStatusFilterType[]>(defaultStatuses);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 状态标签使用静态 i18n key，避免动态拼接导致清理脚本误删词条。
  const statusOptions = useMemo<{ label: string; value: AdminUserStatusFilterType }[]>(
    () => [
      { label: t('admin:user_status_active'), value: UserStatusEnum.active },
      { label: t('admin:user_status_forbidden'), value: UserStatusEnum.forbidden }
    ],
    [t]
  );

  const isAllStatusSelected = statuses.length === allStatuses.length;
  const isStatusFilterActive = !isAllStatusSelected;

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
      username: search,
      statuses
    },
    refreshDeps: [search, statuses],
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
              <Th>
                <MyMenu
                  trigger="hover"
                  placement="bottom-start"
                  // 表头会被 FixedTableContainer 克隆到隐藏测量节点；弹层挂到 body，
                  // 避免克隆出第二个菜单，同时脱离表头 overflow:hidden 的裁剪。
                  portal
                  strategy="fixed"
                  Button={
                    <Flex
                      alignItems={'center'}
                      cursor={'pointer'}
                      w={'fit-content'}
                      color={isStatusFilterActive ? 'primary.600' : 'inherit'}
                    >
                      <Box>状态</Box>
                      <MyIcon
                        name={isStatusFilterActive ? 'common/filter' : 'core/chat/chevronDown'}
                        w={4}
                        ml={1}
                        fill={isStatusFilterActive ? 'none' : 'currentColor'}
                      />
                    </Flex>
                  }
                  menuList={[
                    {
                      children: [
                        {
                          label: (
                            <Checkbox
                              size={'sm'}
                              isChecked={isAllStatusSelected}
                              isIndeterminate={statuses.length > 0 && !isAllStatusSelected}
                              pointerEvents={'none'}
                            >
                              {t('common:All')}
                            </Checkbox>
                          ),
                          closeOnClick: false,
                          // 空数组在接口语义里等于“全部”，因此“全部”只负责选中，不再切换为空选。
                          onClick: () => setStatuses([...allStatuses])
                        },
                        ...statusOptions.map((item) => ({
                          label: (
                            <Checkbox
                              size={'sm'}
                              isChecked={statuses.includes(item.value)}
                              pointerEvents={'none'}
                            >
                              {item.label}
                            </Checkbox>
                          ),
                          closeOnClick: false,
                          onClick: () =>
                            setStatuses((current) => {
                              if (current.includes(item.value)) {
                                const next = current.filter((value) => value !== item.value);
                                // 至少保留一个状态：空选在接口里等于不过滤，会出现“没有勾选却展示全部”的歧义。
                                return next.length ? next : current;
                              }
                              return [...current, item.value];
                            })
                        }))
                      ]
                    }
                  ]}
                />
              </Th>
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
      <Flex alignItems={'center'} pb={4}>
        <Box flex={'0 0 120px'}>账号来源:</Box>
        {/* isSsoUser 由服务端按当前 SSO 配置权威判定，用于让管理员区分同步账号与本地账号 */}
        <Box>{user.isSsoUser ? 'SSO 同步' : '本地账号'}</Box>
      </Flex>
    </MyModal>
  );
}
