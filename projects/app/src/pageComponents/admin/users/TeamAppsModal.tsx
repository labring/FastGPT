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
  Image
} from '@chakra-ui/react';
import { getTeamApps } from '@/web/support/user/admin/api';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import MyIcon from '@fastgpt/web/components/common/Icon';

interface TeamAppsModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  teamName: string;
}

interface TeamAppsData {
  teamInfo: {
    _id: string;
    name: string;
    ownerId: string;
    memberCount: number;
  };
  apps: Array<{
    _id: string;
    name: string;
    type: string;
    avatar: string;
    createTime: Date;
    tmbId: string;
    teamId: string;
  }>;
  total: number;
}

const TeamAppsModal: React.FC<TeamAppsModalProps> = ({ isOpen, onClose, teamId, teamName }) => {
  const [appsData, setAppsData] = useState<TeamAppsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTeamApps = async () => {
    if (!teamId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await getTeamApps(teamId);
      setAppsData(response);
    } catch (err: any) {
      console.error('Failed to fetch team apps:', err);
      setError(err.message || '获取团队应用失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && teamId) {
      fetchTeamApps();
    }
  }, [isOpen, teamId]);

  const getAppTypeText = (type: string) => {
    switch (type) {
      case 'simple':
        return '简单应用';
      case 'workflow':
        return '工作流';
      case 'plugin':
        return '插件';
      default:
        return type;
    }
  };

  const getAppTypeColor = (type: string) => {
    switch (type) {
      case 'simple':
        return 'blue';
      case 'workflow':
        return 'green';
      case 'plugin':
        return 'purple';
      default:
        return 'gray';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack>
            <MyIcon name={'core/app/type/simple'} w={'20px'} />
            <Text>团队应用列表</Text>
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
          ) : appsData ? (
            <VStack spacing={4} align="stretch">
              {/* 团队信息 */}
              <Box p={4} bg="gray.50" borderRadius="md">
                <VStack align="start" spacing={2}>
                  <HStack>
                    <MyIcon name={'support/team/group'} w={'16px'} />
                    <Text fontWeight="bold">{appsData.teamInfo.name}</Text>
                  </HStack>
                  <HStack spacing={4} fontSize="sm" color="gray.600">
                    <Text>团队ID: {appsData.teamInfo._id}</Text>
                    <Text>成员数: {appsData.teamInfo.memberCount}</Text>
                    <Text>应用数: {appsData.total}</Text>
                  </HStack>
                </VStack>
              </Box>

              <Alert status="info">
                <AlertIcon />
                <Box>
                  <Text fontSize="sm">
                    💡 <strong>提示</strong>：这些是团队 &quot;{teamName}&quot; 中的所有应用。
                    用户需要切换到该团队才能在应用列表中看到这些应用。
                  </Text>
                </Box>
              </Alert>

              {/* 应用列表 */}
              <Box>
                <Text fontSize="lg" fontWeight="semibold" mb={3}>
                  应用列表 ({appsData.total})
                </Text>

                {appsData.apps.length === 0 ? (
                  <Alert status="info">
                    <AlertIcon />
                    该团队暂无应用
                  </Alert>
                ) : (
                  <TableContainer>
                    <Table variant="simple" size="sm">
                      <Thead>
                        <Tr>
                          <Th>应用</Th>
                          <Th>类型</Th>
                          <Th>创建时间</Th>
                          <Th>创建者ID</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {appsData.apps.map((app) => (
                          <Tr key={app._id}>
                            <Td>
                              <HStack>
                                <Avatar
                                  src={app.avatar}
                                  name={app.name}
                                  size="sm"
                                  borderRadius="md"
                                />
                                <VStack align="start" spacing={0}>
                                  <Text fontWeight="medium">{app.name}</Text>
                                  <Text fontSize="xs" color="gray.500">
                                    {app._id}
                                  </Text>
                                </VStack>
                              </HStack>
                            </Td>
                            <Td>
                              <Badge colorScheme={getAppTypeColor(app.type)}>
                                {getAppTypeText(app.type)}
                              </Badge>
                            </Td>
                            <Td>
                              <Text fontSize="sm">{formatTime2YMDHM(app.createTime)}</Text>
                            </Td>
                            <Td>
                              <Text fontSize="xs" color="gray.500">
                                {app.tmbId}
                              </Text>
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
  );
};

export default TeamAppsModal;
