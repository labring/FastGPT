import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Flex,
  TableContainer,
  TableCaption,
  Table,
  Thead,
  Tbody,
  Tr,
  Td,
  Th,
  Tag,
  TagLabel,
  useTheme,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Button,
  Center,
  Input,
  useDisclosure
} from '@chakra-ui/react';
import { delRemoveUser, queryUsers } from '@/web/support/user/manage/api';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { UserModelSchema } from '@fastgpt/global/support/user/type';
import UserModal from './userModal';
import dayjs from 'dayjs';
import { useTranslation } from 'next-i18next';
import { useMutation } from '@tanstack/react-query';
import { AddIcon } from '@chakra-ui/icons';
import { UserManageType } from '@fastgpt/global/support/user/manage/api';
import MySelect from '@/components/Select';
import { UserStatusEnum, userStatusMap } from '@fastgpt/global/support/user/constant';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { useUserStore } from '@/web/support/user/useUserStore';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';

const UserManage = () => {
  const theme = useTheme();
  const { Loading } = useLoading();
  const { t } = useTranslation();
  const { isPc } = useSystemStore();
  const lastSearch = useRef('');
  const { userInfo, initUserInfo } = useUserStore();
  const [status, setStatus] = useState('');
  const [username, setUsername] = useState('');
  const [editData, setEditData] = useState<UserManageType>();
  const {
    isOpen: isOpenCreateModal,
    onOpen: onOpenCreateModal,
    onClose: onCloseCreateModal
  } = useDisclosure();
  const statusOptions: { value: string; label: string }[] = [
    {
      label: '请选择',
      value: ''
    }
  ].concat(
    Object.keys(UserStatusEnum).map((key) => {
      return {
        label: 'support.user.status.' + key,
        value: key
      };
    })
  );
  const {
    data: users,
    isLoading,
    total,
    pageSize,
    Pagination,
    getData,
    pageNum
  } = usePagination<UserModelSchema>({
    api: queryUsers,
    defaultRequest: false,
    pageSize: isPc ? 20 : 10,
    params: {
      status,
      username
    }
  });

  const createSuccess = useCallback(() => {
    getData(1);
  }, []);

  const { mutate: onclickRemove, isLoading: isDeleting } = useMutation({
    mutationFn: async (id: string) => delRemoveUser(id),
    onSuccess() {
      getData(1);
    }
  });

  useEffect(() => {
    getData(1);
  }, [status]);

  return (
    <Flex flexDirection={'column'} py={[0, 5]} h={'100%'} position={'relative'}>
      <Box px={[3, 8]} position={'relative'} flex={'1 0 0'} h={0} overflowY={'auto'}>
        <Flex mb={3}>
          <Center>
            <Flex mt={5} px={3} alignItems={'center'}>
              <Box w={'40px'}>{t('user.Account')}</Box>
              <Input
                w={['200px', '250px']}
                size={'sm'}
                value={username}
                placeholder="搜索应用，回车确认"
                onChange={(e) => setUsername(e.target.value)}
                onBlur={() => {
                  if (username === lastSearch.current) return;
                  getData(1);
                  lastSearch.current = username;
                }}
                onKeyDown={(e) => {
                  if (username === lastSearch.current) return;
                  if (e.key === 'Enter') {
                    getData(1);
                    lastSearch.current = username;
                  }
                }}
              />
            </Flex>
            <Flex mt={5} px={3} alignItems={'center'}>
              <Box w={'40px'}>{t('common.Status')}</Box>
              <Box flex={1}>
                <MySelect
                  w={['200px', '250px']}
                  value={status}
                  list={statusOptions.map((item) => ({
                    value: item.value,
                    label: (
                      <Tag
                        colorScheme={
                          item.value === UserStatusEnum.active
                            ? 'green'
                            : item.value === UserStatusEnum.forbidden
                              ? 'red'
                              : undefined
                        }
                        borderRadius="full"
                      >
                        <TagLabel>{t(item.label)}</TagLabel>
                      </Tag>
                    )
                  }))}
                  onchange={setStatus}
                />
              </Box>
            </Flex>
            <Box position={'absolute'} top={0} right="30px">
              <Button
                variant={'whitePrimary'}
                leftIcon={<AddIcon fontSize={'10px'} />}
                onClick={() => {
                  setEditData({
                    _id: '',
                    username: '',
                    password: '',
                    status: 'active'
                  });
                  onOpenCreateModal();
                }}
              >
                新增用户
              </Button>
            </Box>
          </Center>
        </Flex>

        <TableContainer>
          <Table variant="simple">
            <Thead>
              <Tr>
                <Th>{t('user.Account')}</Th>
                <Th>状态</Th>
                <Th>创建时间</Th>
              </Tr>
            </Thead>
            <Tbody>
              {users.map(({ _id, username, password, status, createTime }) => (
                <Tr key={_id}>
                  <Td>{username}</Td>
                  <Td>
                    <Tag colorScheme={status === 'active' ? 'green' : 'red'} borderRadius="full">
                      <TagLabel>{t(`support.user.status.${status}`)}</TagLabel>
                    </Tag>
                  </Td>
                  <Td whiteSpace={'pre-wrap'}>{dayjs(createTime).format('YYYY/MM/DD HH:mm:ss')}</Td>
                  <Td>
                    {username != AuthUserTypeEnum.root && (
                      <Menu autoSelect={false} isLazy>
                        <MenuButton
                          _hover={{ bg: 'myWhite.600  ' }}
                          cursor={'pointer'}
                          borderRadius={'md'}
                        >
                          <MyIcon name={'more'} w={'14px'} p={2} />
                        </MenuButton>
                        <MenuList color={'myGray.700'} minW={`120px !important`} zIndex={10}>
                          <MenuItem
                            onClick={() => {
                              onOpenCreateModal();
                              setEditData({
                                _id,
                                username,
                                password,
                                status
                              });
                            }}
                            py={[2, 3]}
                          >
                            <MyIcon name={'edit'} w={['14px', '16px']} />
                            <Box ml={[1, 2]}>{t('common.Edit')}</Box>
                          </MenuItem>
                          <MenuItem onClick={() => onclickRemove(_id)} py={[2, 3]}>
                            <MyIcon name={'delete'} w={['14px', '16px']} />
                            <Box ml={[1, 2]}>{t('common.Delete')}</Box>
                          </MenuItem>
                        </MenuList>
                      </Menu>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
        {!isLoading && users.length === 0 && (
          <Flex flex={'1 0 0'} flexDirection={'column'} alignItems={'center'} pt={'10vh'}>
            <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
            <Box mt={2} color={'myGray.500'}>
              暂无通知~
            </Box>
          </Flex>
        )}
      </Box>

      {total > pageSize && (
        <Flex w={'100%'} mt={4} px={[3, 8]} justifyContent={'flex-end'}>
          <Pagination />
        </Flex>
      )}
      <Loading loading={isLoading && users.length === 0} fixed={false} />

      {isOpenCreateModal && (
        <UserModal onClose={onCloseCreateModal} userData={editData} onSuccess={createSuccess} />
      )}
    </Flex>
  );
};

export default UserManage;
