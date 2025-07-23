import React, { useEffect, useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  VStack,
  HStack,
  Text,
  Badge,
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Spinner,
  Alert,
  AlertIcon,
  Avatar,
  Flex,
  Select,
  useToast,
  IconButton,
  Tooltip,
  FormControl,
  FormLabel,
  Input,
  useDisclosure
} from '@chakra-ui/react';
import { getUserTeamInfo, manageUserTeam, getAllTeams } from '@/web/support/user/admin/api';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';

interface UserTeamEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  username: string;
  onSuccess?: () => void;
}

interface UserTeamInfo {
  _id: string;
  username: string;
  status: string;
  createTime: Date;
  teams: Array<{
    _id: string;
    teamId: string;
    teamName: string;
    role: string;
    status: string;
    isOwner: boolean;
    createTime: Date;
  }>;
  totalTeams: number;
}

interface TeamOption {
  _id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  memberCount: number;
}

const UserTeamEditModal: React.FC<UserTeamEditModalProps> = ({
  isOpen,
  onClose,
  userId,
  username,
  onSuccess
}) => {
  const [teamInfo, setTeamInfo] = useState<UserTeamInfo | null>(null);
  const [allTeams, setAllTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedRole, setSelectedRole] = useState('member');
  const [searchTeam, setSearchTeam] = useState('');

  const toast = useToast();
  const { ConfirmModal, openConfirm } = useConfirm();

  const fetchData = async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const [teamInfoResponse, teamsResponse] = await Promise.all([
        getUserTeamInfo(userId),
        getAllTeams({ search: searchTeam, limit: 100 })
      ]);

      setTeamInfo(teamInfoResponse);
      setAllTeams(teamsResponse.teams);
    } catch (err: any) {
      console.error('Failed to fetch data:', err);
      setError(err.message || '获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && userId) {
      fetchData();
    }
  }, [isOpen, userId, searchTeam]);

  const handleAddToTeam = async () => {
    if (!selectedTeamId) {
      toast({
        title: '请选择团队',
        status: 'warning'
      });
      return;
    }

    try {
      await manageUserTeam({
        userId,
        action: 'add',
        teamId: selectedTeamId,
        role: selectedRole
      });

      toast({
        title: '添加成功',
        status: 'success'
      });

      setSelectedTeamId('');
      setSelectedRole('member');
      fetchData();
      onSuccess?.();
    } catch (err: any) {
      toast({
        title: '添加失败',
        description: err.message,
        status: 'error'
      });
    }
  };

  const handleRemoveFromTeam = (teamId: string, teamName: string, isOwner: boolean) => {
    if (isOwner) {
      toast({
        title: '无法移除',
        description: '不能将团队所有者从团队中移除',
        status: 'warning'
      });
      return;
    }

    openConfirm(
      async () => {
        try {
          await manageUserTeam({
            userId,
            action: 'remove',
            teamId
          });

          toast({
            title: '移除成功',
            status: 'success'
          });

          fetchData();
          onSuccess?.();
        } catch (err: any) {
          toast({
            title: '移除失败',
            description: err.message,
            status: 'error'
          });
        }
      },
      undefined,
      `确认将用户 "${username}" 从团队 "${teamName}" 中移除？`
    )();
  };

  const handleUpdateRole = async (teamId: string, newRole: string) => {
    try {
      await manageUserTeam({
        userId,
        action: 'updateRole',
        teamId,
        role: newRole
      });

      toast({
        title: '角色更新成功',
        status: 'success'
      });

      fetchData();
      onSuccess?.();
    } catch (err: any) {
      toast({
        title: '角色更新失败',
        description: err.message,
        status: 'error'
      });
    }
  };

  const getRoleColor = (role: string, isOwner: boolean) => {
    if (isOwner) return 'purple';
    switch (role) {
      case 'admin':
        return 'red';
      case 'member':
        return 'blue';
      default:
        return 'gray';
    }
  };

  const getRoleText = (role: string, isOwner: boolean) => {
    if (isOwner) return '所有者';
    switch (role) {
      case 'admin':
        return '管理员';
      case 'member':
        return '成员';
      default:
        return role;
    }
  };

  const getAvailableTeams = () => {
    if (!teamInfo) return allTeams;

    const userTeamIds = teamInfo.teams.map((t) => t.teamId);
    return allTeams.filter((team) => !userTeamIds.includes(team._id));
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="5xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack>
              <MyIcon name={'edit'} w={'20px'} />
              <Text>编辑用户团队</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />

          <ModalBody>
            {loading ? (
              <Flex justify="center" align="center" h="200px">
                <Spinner size="lg" />
              </Flex>
            ) : error ? (
              <Alert status="error">
                <AlertIcon />
                {error}
              </Alert>
            ) : teamInfo ? (
              <VStack spacing={6} align="stretch">
                {/* 用户信息 */}
                <Box p={4} bg="gray.50" borderRadius="md">
                  <HStack>
                    <Avatar size="sm" name={teamInfo.username} />
                    <VStack align="start" spacing={0}>
                      <Text fontWeight="bold">{teamInfo.username}</Text>
                      <Text fontSize="sm" color="gray.500">
                        当前参与 {teamInfo.totalTeams} 个团队
                      </Text>
                    </VStack>
                  </HStack>
                </Box>

                {/* 添加到团队 */}
                <Box p={4} border="1px" borderColor="gray.200" borderRadius="md">
                  <Text fontSize="md" fontWeight="semibold" mb={3}>
                    添加到团队
                  </Text>
                  <HStack spacing={3}>
                    <FormControl flex={2}>
                      <Select
                        placeholder="选择团队"
                        value={selectedTeamId}
                        onChange={(e) => setSelectedTeamId(e.target.value)}
                      >
                        {getAvailableTeams().map((team) => (
                          <option key={team._id} value={team._id}>
                            {team.name} (所有者: {team.ownerName}, 成员: {team.memberCount})
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl flex={1}>
                      <Select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                      >
                        <option value="member">成员</option>
                        <option value="admin">管理员</option>
                      </Select>
                    </FormControl>
                    <Button colorScheme="blue" onClick={handleAddToTeam}>
                      添加
                    </Button>
                  </HStack>
                </Box>

                {/* 当前团队列表 */}
                <Box>
                  <Text fontSize="md" fontWeight="semibold" mb={3}>
                    当前团队 ({teamInfo.teams.length})
                  </Text>

                  {teamInfo.teams.length === 0 ? (
                    <Alert status="info">
                      <AlertIcon />
                      该用户暂未加入任何团队
                    </Alert>
                  ) : (
                    <TableContainer>
                      <Table variant="simple" size="sm">
                        <Thead>
                          <Tr>
                            <Th>团队名称</Th>
                            <Th>当前角色</Th>
                            <Th>加入时间</Th>
                            <Th>操作</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {teamInfo.teams.map((team) => (
                            <Tr key={team._id}>
                              <Td>
                                <Text fontWeight="medium">{team.teamName}</Text>
                              </Td>
                              <Td>
                                {team.isOwner ? (
                                  <Badge colorScheme="purple">所有者</Badge>
                                ) : (
                                  <Select
                                    size="sm"
                                    value={team.role}
                                    onChange={(e) => handleUpdateRole(team.teamId, e.target.value)}
                                    w="100px"
                                  >
                                    <option value="member">成员</option>
                                    <option value="admin">管理员</option>
                                  </Select>
                                )}
                              </Td>
                              <Td>
                                <Text fontSize="sm">{formatTime2YMDHM(team.createTime)}</Text>
                              </Td>
                              <Td>
                                <Tooltip
                                  label={team.isOwner ? '不能移除团队所有者' : '从团队中移除'}
                                >
                                  <IconButton
                                    aria-label="移除"
                                    icon={<MyIcon name={'delete'} w={'14px'} />}
                                    size="sm"
                                    colorScheme="red"
                                    variant="ghost"
                                    isDisabled={team.isOwner}
                                    onClick={() =>
                                      handleRemoveFromTeam(team.teamId, team.teamName, team.isOwner)
                                    }
                                  />
                                </Tooltip>
                              </Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </VStack>
            ) : null}
          </ModalBody>

          <ModalFooter>
            <Button onClick={onClose}>关闭</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmModal />
    </>
  );
};

export default UserTeamEditModal;
