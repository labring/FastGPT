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
  useDisclosure
} from '@chakra-ui/react';
import { getUserTeamInfo } from '@/web/support/user/admin/api';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import MyIcon from '@fastgpt/web/components/common/Icon';
import TeamSwitchGuideModal from './TeamSwitchGuideModal';
import TeamAppsModal from './TeamAppsModal';

interface UserTeamDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  username: string;
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

const UserTeamDetailModal: React.FC<UserTeamDetailModalProps> = ({
  isOpen,
  onClose,
  userId,
  username
}) => {
  const [teamInfo, setTeamInfo] = useState<UserTeamInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isOpen: isGuideOpen, onOpen: onGuideOpen, onClose: onGuideClose } = useDisclosure();
  const { isOpen: isAppsOpen, onOpen: onAppsOpen, onClose: onAppsClose } = useDisclosure();
  const [selectedTeam, setSelectedTeam] = useState<{ id: string; name: string } | null>(null);

  const fetchTeamInfo = async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await getUserTeamInfo(userId);
      setTeamInfo(response);
    } catch (err: any) {
      console.error('Failed to fetch team info:', err);
      setError(err.message || '获取团队信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && userId) {
      fetchTeamInfo();
    }
  }, [isOpen, userId]);

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'green';
      case 'inactive':
        return 'gray';
      default:
        return 'red';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return '活跃';
      case 'inactive':
        return '未激活';
      default:
        return '禁用';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack>
            <MyIcon name={'support/team/group'} w={'20px'} />
            <Text>用户团队详情</Text>
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
              {/* 用户基本信息 */}
              <Box p={4} bg="gray.50" borderRadius="md">
                <VStack align="start" spacing={2}>
                  <HStack>
                    <Avatar size="sm" name={teamInfo.username} />
                    <VStack align="start" spacing={0}>
                      <Text fontWeight="bold">{teamInfo.username}</Text>
                      <HStack>
                        <Badge colorScheme={getStatusColor(teamInfo.status)}>
                          {getStatusText(teamInfo.status)}
                        </Badge>
                        <Text fontSize="sm" color="gray.500">
                          注册时间: {formatTime2YMDHM(teamInfo.createTime)}
                        </Text>
                      </HStack>
                    </VStack>
                  </HStack>
                  <Text fontSize="sm" color="gray.600">
                    总共参与 {teamInfo.totalTeams} 个团队
                  </Text>
                </VStack>
              </Box>

              {/* 团队列表 */}
              <Box>
                <Text fontSize="lg" fontWeight="semibold" mb={3}>
                  团队列表 ({teamInfo.teams.length})
                </Text>

                {teamInfo.teams.length === 0 ? (
                  <Alert status="info">
                    <AlertIcon />
                    该用户暂未加入任何团队
                  </Alert>
                ) : (
                  <>
                    <Alert status="success" mb={3}>
                      <AlertIcon />
                      <Box>
                        <Text fontSize="sm">
                          ✅ <strong>团队切换功能正常</strong>
                          ：用户可以使用FastGPT原生的团队选择器在不同团队之间切换，
                          查看各团队的应用和资源。
                          <Button
                            size="xs"
                            variant="link"
                            colorScheme="blue"
                            ml={2}
                            onClick={onGuideOpen}
                          >
                            查看使用指南
                          </Button>
                        </Text>
                      </Box>
                    </Alert>
                    <TableContainer>
                      <Table variant="simple" size="sm">
                        <Thead>
                          <Tr>
                            <Th>团队名称</Th>
                            <Th>角色</Th>
                            <Th>状态</Th>
                            <Th>加入时间</Th>
                            <Th>操作</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {teamInfo.teams.map((team) => (
                            <Tr key={team._id}>
                              <Td>
                                <VStack align="start" spacing={1}>
                                  <Text fontWeight="medium">{team.teamName}</Text>
                                  <Text fontSize="xs" color="gray.500">
                                    ID: {team.teamId}
                                  </Text>
                                </VStack>
                              </Td>
                              <Td>
                                <Badge colorScheme={getRoleColor(team.role, team.isOwner)}>
                                  {getRoleText(team.role, team.isOwner)}
                                </Badge>
                              </Td>
                              <Td>
                                <Badge colorScheme={getStatusColor(team.status)}>
                                  {getStatusText(team.status)}
                                </Badge>
                              </Td>
                              <Td>
                                <Text fontSize="sm">{formatTime2YMDHM(team.createTime)}</Text>
                              </Td>
                              <Td>
                                <Button
                                  size="xs"
                                  colorScheme="blue"
                                  variant="outline"
                                  leftIcon={<MyIcon name="core/app/type/simple" w="12px" />}
                                  onClick={() => {
                                    setSelectedTeam({
                                      id: team.teamId,
                                      name: team.teamName
                                    });
                                    onAppsOpen();
                                  }}
                                >
                                  查看应用
                                </Button>
                              </Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </TableContainer>
                  </>
                )}
              </Box>
            </VStack>
          ) : null}
        </ModalBody>

        <ModalFooter>
          <Button onClick={onClose}>关闭</Button>
        </ModalFooter>
      </ModalContent>

      {teamInfo && (
        <TeamSwitchGuideModal
          isOpen={isGuideOpen}
          onClose={onGuideClose}
          username={teamInfo.username}
          teamCount={teamInfo.totalTeams}
        />
      )}

      {selectedTeam && (
        <TeamAppsModal
          isOpen={isAppsOpen}
          onClose={onAppsClose}
          teamId={selectedTeam.id}
          teamName={selectedTeam.name}
        />
      )}
    </Modal>
  );
};

export default UserTeamDetailModal;
