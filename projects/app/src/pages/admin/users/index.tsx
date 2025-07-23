import React, { useState, useCallback } from 'react';
import {
  Box,
  Flex,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Badge,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useDisclosure,
  HStack,
  VStack,
  Text,
  Select,
  Checkbox,
  useToast,
  Spinner
} from '@chakra-ui/react';
// import { useTranslation } from 'next-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MyIcon from '@fastgpt/web/components/common/Icon';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useRouter } from 'next/router';
import MyBox from '@fastgpt/web/components/common/MyBox';
import {
  getUserListForPagination,
  deleteUsers,
  batchUpdateUserStatus
} from '@/web/support/user/admin/api';
import type { UserListItemType } from '@/pages/api/support/user/admin/list';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import CreateUserModal from '@/pageComponents/admin/users/CreateUserModal';
import EditUserModal from '@/pageComponents/admin/users/EditUserModal';
import UserDetailModal from '@/pageComponents/admin/users/UserDetailModal';
import UserTeamDetailModal from '@/pageComponents/admin/users/UserTeamDetailModal';
import UserTeamEditModal from '@/pageComponents/admin/users/UserTeamEditModal';
import AdminLayout from '@/components/Layout/AdminLayout';

const UserManagement = () => {
  // const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { ConfirmModal, openConfirm } = useConfirm();

  // 状态管理
  const [searchKey, setSearchKey] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [editingUser, setEditingUser] = useState<UserListItemType | null>(null);
  const [viewingUser, setViewingUser] = useState<UserListItemType | null>(null);

  // 模态框控制
  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onClose: onCreateClose } = useDisclosure();

  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();

  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onClose: onDetailClose } = useDisclosure();

  const {
    isOpen: isTeamDetailOpen,
    onOpen: onTeamDetailOpen,
    onClose: onTeamDetailClose
  } = useDisclosure();

  const {
    isOpen: isTeamEditOpen,
    onOpen: onTeamEditOpen,
    onClose: onTeamEditClose
  } = useDisclosure();

  // 分页
  const {
    data: userListData,
    isLoading,
    Pagination,
    total,
    getData
  } = usePagination(getUserListForPagination, {
    pageSize: 20,
    params: {
      searchKey,
      status: statusFilter as any
    },
    refreshDeps: [searchKey, statusFilter],
    defaultRequest: true
  });

  const userList = React.useMemo(
    () => (Array.isArray(userListData) ? (userListData as UserListItemType[]) : []),
    [userListData]
  );

  // 删除用户
  const deleteMutation = useMutation({
    mutationFn: deleteUsers,
    onSuccess: (data) => {
      console.log('Delete response:', data);

      if (data.success > 0) {
        toast({
          title: `删除成功 ${data.success} 个用户`,
          status: 'success'
        });
      }

      if (data.failed > 0) {
        console.log('Delete errors:', data.errors);
        toast({
          title: `${data.failed} 个用户删除失败`,
          description: data.errors?.[0]?.error || '请查看控制台获取详细信息',
          status: 'warning'
        });
      }

      setSelectedUsers([]);
      // 刷新列表
      getData && getData(1);
    },
    onError: (error: any) => {
      console.error('Delete mutation error:', error);
      toast({
        title: '删除失败',
        description: error.message,
        status: 'error'
      });
    }
  });

  // 批量更新状态
  const updateStatusMutation = useMutation({
    mutationFn: batchUpdateUserStatus,
    onSuccess: () => {
      toast({
        title: '更新成功',
        status: 'success'
      });
      setSelectedUsers([]);
      // 刷新列表
      window.location.reload();
    },
    onError: (error: any) => {
      toast({
        title: '更新失败',
        description: error.message,
        status: 'error'
      });
    }
  });

  // 处理用户选择
  const handleSelectUser = useCallback((userId: string, checked: boolean) => {
    if (checked) {
      setSelectedUsers((prev) => [...prev, userId]);
    } else {
      setSelectedUsers((prev) => prev.filter((id) => id !== userId));
    }
  }, []);

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedUsers(userList.map((user) => user._id));
      } else {
        setSelectedUsers([]);
      }
    },
    [userList]
  );

  // 处理删除
  const handleDelete = useCallback(
    (userIds: string[]) => {
      openConfirm(
        () => {
          console.log('Deleting users:', userIds);
          deleteMutation.mutate({
            userIds,
            deleteResources: true // 设置为true以删除用户的资源
          });
        },
        undefined,
        `确认删除 ${userIds.length} 个用户？

⚠️ 此操作将删除用户及其所有资源，不可撤销。`
      )();
    },
    [deleteMutation, openConfirm]
  );

  // 处理状态更新
  const handleStatusUpdate = useCallback(
    (userIds: string[], status: string) => {
      updateStatusMutation.mutate({
        userIds,
        status
      });
    },
    [updateStatusMutation]
  );

  // 处理编辑用户
  const handleEditUser = useCallback(
    (user: UserListItemType) => {
      setEditingUser(user);
      onEditOpen();
    },
    [onEditOpen]
  );

  // 处理查看用户详情
  const handleViewUser = useCallback(
    (user: UserListItemType) => {
      setViewingUser(user);
      onDetailOpen();
    },
    [onDetailOpen]
  );

  // 处理查看用户团队详情
  const handleViewUserTeams = useCallback(
    (user: UserListItemType) => {
      setViewingUser(user);
      onTeamDetailOpen();
    },
    [onTeamDetailOpen]
  );

  // 处理编辑用户团队
  const handleEditUserTeams = useCallback(
    (user: UserListItemType) => {
      setEditingUser(user);
      onTeamEditOpen();
    },
    [onTeamEditOpen]
  );

  // 状态标签颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case UserStatusEnum.active:
        return 'green';
      case UserStatusEnum.inactive:
        return 'gray';
      case UserStatusEnum.forbidden:
        return 'red';
      default:
        return 'gray';
    }
  };

  // 状态文本
  const getStatusText = (status: string) => {
    switch (status) {
      case UserStatusEnum.active:
        return '正常';
      case UserStatusEnum.inactive:
        return '未激活';
      case UserStatusEnum.forbidden:
        return '禁用';
      default:
        return status;
    }
  };

  return (
    <AdminLayout title="用户管理" breadcrumbs={[{ label: '用户管理' }]}>
      <MyBox isLoading={isLoading} h={'100%'} position={'relative'}>
        <Flex flexDirection={'column'} h={'100%'}>
          {/* 头部操作栏 */}
          <Flex mb={4} gap={4} alignItems={'center'} flexWrap={'wrap'}>
            <SearchInput
              placeholder="搜索用户名..."
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
              w={'300px'}
            />

            <Select
              placeholder="全部状态"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              w={'150px'}
            >
              <option value={UserStatusEnum.active}>正常</option>
              <option value={UserStatusEnum.inactive}>未激活</option>
              <option value={UserStatusEnum.forbidden}>禁用</option>
            </Select>

            <Button
              leftIcon={<MyIcon name={'common/add2'} w={'14px'} />}
              variant={'primary'}
              onClick={onCreateOpen}
            >
              创建用户
            </Button>

            <Button
              leftIcon={<MyIcon name={'common/setting'} w={'14px'} />}
              variant={'outline'}
              onClick={() => window.open('/admin/permissions', '_blank')}
            >
              权限管理
            </Button>

            {selectedUsers.length > 0 && (
              <HStack>
                <Menu>
                  <MenuButton as={Button} size={'sm'} variant={'outline'}>
                    批量操作 ({selectedUsers.length})
                  </MenuButton>
                  <MenuList>
                    <MenuItem
                      onClick={() => handleStatusUpdate(selectedUsers, UserStatusEnum.active)}
                    >
                      设为正常
                    </MenuItem>
                    <MenuItem
                      onClick={() => handleStatusUpdate(selectedUsers, UserStatusEnum.inactive)}
                    >
                      设为未激活
                    </MenuItem>
                    <MenuItem
                      onClick={() => handleStatusUpdate(selectedUsers, UserStatusEnum.forbidden)}
                    >
                      设为禁用
                    </MenuItem>
                    <MenuItem color={'red.500'} onClick={() => handleDelete(selectedUsers)}>
                      删除
                    </MenuItem>
                  </MenuList>
                </Menu>
              </HStack>
            )}
          </Flex>

          {/* 用户列表 */}
          <TableContainer flex={1} overflowY={'auto'}>
            {userList.length === 0 && !isLoading ? (
              <Box textAlign="center" py={8}>
                <Text color="gray.500">暂无用户数据</Text>
              </Box>
            ) : (
              <Table variant={'simple'}>
                <Thead>
                  <Tr>
                    <Th w={'50px'}>
                      <Checkbox
                        isChecked={selectedUsers.length === userList.length && userList.length > 0}
                        isIndeterminate={
                          selectedUsers.length > 0 && selectedUsers.length < userList.length
                        }
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </Th>
                    <Th>用户名</Th>
                    <Th>状态</Th>
                    <Th>创建时间</Th>
                    <Th>团队</Th>
                    <Th>推广费率</Th>
                    <Th w={'120px'}>操作</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {userList.map((user) => (
                    <Tr key={user._id}>
                      <Td>
                        <Checkbox
                          isChecked={selectedUsers.includes(user._id)}
                          onChange={(e) => handleSelectUser(user._id, e.target.checked)}
                        />
                      </Td>
                      <Td>
                        <VStack align={'start'} spacing={1}>
                          <Text fontWeight={'medium'}>{user.username}</Text>
                          <Text fontSize={'xs'} color={'gray.500'}>
                            ID: {user._id}
                          </Text>
                        </VStack>
                      </Td>
                      <Td>
                        <Badge colorScheme={getStatusColor(user.status)}>
                          {getStatusText(user.status)}
                        </Badge>
                      </Td>
                      <Td>
                        <Text fontSize={'sm'}>{formatTime2YMDHM(user.createTime)}</Text>
                      </Td>
                      <Td>
                        <Text fontSize={'sm'}>{user.totalTeams} 个团队</Text>
                      </Td>
                      <Td>
                        <Text fontSize={'sm'}>{(user.promotionRate * 100).toFixed(1)}%</Text>
                      </Td>
                      <Td>
                        <Menu>
                          <MenuButton
                            as={Button}
                            variant={'ghost'}
                            size={'sm'}
                            rightIcon={<MyIcon name={'common/more'} w={'14px'} />}
                          >
                            操作
                          </MenuButton>
                          <MenuList>
                            <MenuItem onClick={() => handleViewUser(user)}>查看详情</MenuItem>
                            <MenuItem onClick={() => handleEditUser(user)}>编辑</MenuItem>
                            <MenuItem onClick={() => handleViewUserTeams(user)}>查看团队</MenuItem>
                            <MenuItem onClick={() => handleEditUserTeams(user)}>管理团队</MenuItem>

                            <MenuItem color={'red.500'} onClick={() => handleDelete([user._id])}>
                              删除
                            </MenuItem>
                          </MenuList>
                        </Menu>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </TableContainer>

          {/* 分页 */}
          {total > 0 && (
            <Flex justify="center" mt={4}>
              <Pagination />
            </Flex>
          )}
        </Flex>

        {/* 模态框 */}
        {isCreateOpen && (
          <CreateUserModal
            isOpen={isCreateOpen}
            onClose={onCreateClose}
            onSuccess={() => {
              window.location.reload();
              onCreateClose();
            }}
          />
        )}

        {isEditOpen && editingUser && (
          <EditUserModal
            isOpen={isEditOpen}
            onClose={onEditClose}
            user={editingUser}
            onSuccess={() => {
              window.location.reload();
              onEditClose();
            }}
          />
        )}

        {isDetailOpen && viewingUser && (
          <UserDetailModal isOpen={isDetailOpen} onClose={onDetailClose} user={viewingUser} />
        )}

        {isTeamDetailOpen && viewingUser && (
          <UserTeamDetailModal
            isOpen={isTeamDetailOpen}
            onClose={onTeamDetailClose}
            userId={viewingUser._id}
            username={viewingUser.username}
          />
        )}

        {isTeamEditOpen && editingUser && (
          <UserTeamEditModal
            isOpen={isTeamEditOpen}
            onClose={onTeamEditClose}
            userId={editingUser._id}
            username={editingUser.username}
            onSuccess={() => {
              getData && getData(1);
            }}
          />
        )}

        <ConfirmModal />
      </MyBox>
    </AdminLayout>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['common', 'user']))
    }
  };
}

export default UserManagement;
