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
  useToast,
  Spinner,
  IconButton
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MyIcon from '@fastgpt/web/components/common/Icon';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import AdminLayout from '@/components/Layout/AdminLayout';
import CreateTeamModal from '@/pageComponents/admin/teams/CreateTeamModal';

// 团队数据类型
type TeamListItemType = {
  _id: string;
  name: string;
  createTime: Date;
  memberCount: number;
  ownerName: string;
  ownerId: string;
};

// API函数
const getTeamList = async (): Promise<TeamListItemType[]> => {
  const response = await fetch('/api/support/user/admin/teams');
  if (!response.ok) {
    throw new Error('Failed to fetch teams');
  }
  const data = await response.json();
  return data.data || [];
};

const TeamManagement = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { ConfirmModal, openConfirm } = useConfirm();
  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onClose: onCreateClose } = useDisclosure();

  // 状态管理
  const [searchKey, setSearchKey] = useState('');
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);

  // 获取团队列表
  const {
    data: teamList = [],
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['teamList'],
    queryFn: getTeamList,
    onError: (error: any) => {
      toast({
        title: '获取团队列表失败',
        description: error.message,
        status: 'error',
        duration: 3000,
        isClosable: true
      });
    }
  });

  // 删除团队mutation
  const deleteTeamMutation = useMutation({
    mutationFn: async (teamIds: string[]) => {
      const response = await fetch('/api/support/user/admin/teams/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          teamIds,
          deleteResources: true
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '删除团队失败');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: '删除成功',
        status: 'success',
        duration: 3000,
        isClosable: true
      });
      setSelectedTeams([]);
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: '删除失败',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    }
  });

  // 处理删除团队
  const handleDeleteTeams = (teamIds: string[]) => {
    openConfirm(
      () => deleteTeamMutation.mutate(teamIds),
      `确认删除 ${teamIds.length} 个团队？此操作将同时删除团队的所有资源，不可撤销。`
    )();
  };

  // 过滤团队列表
  const filteredTeams = teamList.filter(
    (team) =>
      team.name.toLowerCase().includes(searchKey.toLowerCase()) ||
      team.ownerName.toLowerCase().includes(searchKey.toLowerCase())
  );

  return (
    <AdminLayout title="团队管理" breadcrumbs={[{ label: '团队管理' }]}>
      <MyBox isLoading={isLoading} h={'100%'} position={'relative'}>
        <Flex flexDirection={'column'} h={'100%'}>
          {/* 头部操作栏 */}
          <Flex mb={4} gap={4} alignItems={'center'} flexWrap={'wrap'}>
            <SearchInput
              placeholder="搜索团队名称或所有者..."
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
              w={'300px'}
            />

            <Button
              leftIcon={<MyIcon name={'common/add2'} w={'14px'} />}
              variant={'primary'}
              onClick={onCreateOpen}
            >
              创建团队
            </Button>

            {selectedTeams.length > 0 && (
              <Menu>
                <MenuButton as={Button} size={'sm'} variant={'outline'}>
                  批量操作 ({selectedTeams.length})
                </MenuButton>
                <MenuList>
                  <MenuItem color={'red.500'} onClick={() => handleDeleteTeams(selectedTeams)}>
                    删除团队
                  </MenuItem>
                </MenuList>
              </Menu>
            )}

            <Button
              leftIcon={<MyIcon name={'common/refreshLight'} w={'14px'} />}
              variant={'outline'}
              onClick={() => refetch()}
            >
              刷新
            </Button>
          </Flex>

          {/* 团队列表 */}
          <TableContainer flex={1} overflowY={'auto'}>
            {filteredTeams.length === 0 && !isLoading ? (
              <Box textAlign="center" py={8}>
                <Text color="gray.500">暂无团队数据</Text>
              </Box>
            ) : (
              <Table variant={'simple'}>
                <Thead>
                  <Tr>
                    <Th w={'50px'}>
                      <input
                        type="checkbox"
                        checked={
                          selectedTeams.length === filteredTeams.length && filteredTeams.length > 0
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTeams(filteredTeams.map((team) => team._id));
                          } else {
                            setSelectedTeams([]);
                          }
                        }}
                      />
                    </Th>
                    <Th>团队名称</Th>
                    <Th>所有者</Th>
                    <Th>成员数量</Th>
                    <Th>创建时间</Th>
                    <Th w={'120px'}>操作</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredTeams.map((team) => (
                    <Tr key={team._id}>
                      <Td>
                        <input
                          type="checkbox"
                          checked={selectedTeams.includes(team._id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTeams([...selectedTeams, team._id]);
                            } else {
                              setSelectedTeams(selectedTeams.filter((id) => id !== team._id));
                            }
                          }}
                        />
                      </Td>
                      <Td>
                        <VStack align={'start'} spacing={1}>
                          <Text fontWeight={'medium'}>{team.name}</Text>
                          <Text fontSize={'xs'} color={'gray.500'}>
                            ID: {team._id}
                          </Text>
                        </VStack>
                      </Td>
                      <Td>
                        <Text>{team.ownerName}</Text>
                      </Td>
                      <Td>
                        <Badge colorScheme="blue" variant="subtle">
                          {team.memberCount} 人
                        </Badge>
                      </Td>
                      <Td>
                        <Text fontSize={'sm'}>{formatTime2YMDHM(team.createTime)}</Text>
                      </Td>
                      <Td>
                        <Menu>
                          <MenuButton
                            as={IconButton}
                            icon={<MyIcon name={'common/more'} />}
                            variant={'ghost'}
                            size={'sm'}
                          />
                          <MenuList>
                            <MenuItem
                              icon={<MyIcon name={'common/viewLight'} />}
                              onClick={() => {
                                // TODO: 查看团队详情
                                toast({
                                  title: '功能开发中',
                                  status: 'info',
                                  duration: 2000
                                });
                              }}
                            >
                              查看详情
                            </MenuItem>
                            <MenuItem
                              icon={<MyIcon name={'common/settingLight'} />}
                              onClick={() => {
                                // TODO: 编辑团队
                                toast({
                                  title: '功能开发中',
                                  status: 'info',
                                  duration: 2000
                                });
                              }}
                            >
                              编辑团队
                            </MenuItem>
                            <MenuItem
                              icon={<MyIcon name={'common/trash'} />}
                              color={'red.500'}
                              onClick={() => handleDeleteTeams([team._id])}
                            >
                              删除团队
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

          {/* 统计信息 */}
          {filteredTeams.length > 0 && (
            <Flex
              justify="space-between"
              align="center"
              mt={4}
              pt={4}
              borderTop="1px solid"
              borderColor="gray.200"
            >
              <Text fontSize="sm" color="gray.600">
                共 {filteredTeams.length} 个团队
              </Text>
            </Flex>
          )}
        </Flex>

        <ConfirmModal />
        <CreateTeamModal isOpen={isCreateOpen} onClose={onCreateClose} />
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

export default TeamManagement;
