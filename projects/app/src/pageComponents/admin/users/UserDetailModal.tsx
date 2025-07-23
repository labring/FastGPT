import React from 'react';
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
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Box,
  Divider,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Spinner,
  Alert,
  AlertIcon
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useQuery } from '@tanstack/react-query';
import { getUserDetail } from '@/web/support/user/admin/api';
import type { UserListItemType } from '@/pages/api/support/user/admin/list';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import MyIcon from '@fastgpt/web/components/common/Icon';

interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserListItemType;
}

const UserDetailModal: React.FC<UserDetailModalProps> = ({ isOpen, onClose, user }) => {
  const { t } = useTranslation();

  // 获取用户详细信息
  const { data: userDetail, isLoading } = useQuery({
    queryKey: ['userDetail', user._id],
    queryFn: () => getUserDetail(user._id),
    enabled: isOpen
  });

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

  const getStatusText = (status: string) => {
    switch (status) {
      case UserStatusEnum.active:
        return t('user:user_status.active');
      case UserStatusEnum.inactive:
        return t('user:user_status.inactive');
      case UserStatusEnum.forbidden:
        return t('user:user_status.forbidden');
      default:
        return status;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack>
            <MyIcon name="support/user/userLight" w="20px" h="20px" />
            <Text>{t('user:admin.user_detail')}</Text>
            <Badge colorScheme={getStatusColor(user.status)}>{getStatusText(user.status)}</Badge>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          {isLoading ? (
            <Box display="flex" justifyContent="center" py={8}>
              <Spinner size="lg" />
            </Box>
          ) : (
            <Tabs>
              <TabList>
                <Tab>{t('user:basic_info')}</Tab>
                <Tab>{t('user:teams')}</Tab>
                <Tab>{t('user:resources')}</Tab>
                <Tab>{t('user:activity_log')}</Tab>
              </TabList>

              <TabPanels>
                {/* 基本信息 */}
                <TabPanel>
                  <VStack spacing={6} align="stretch">
                    <SimpleGrid columns={2} spacing={6}>
                      <Stat>
                        <StatLabel>{t('user:username')}</StatLabel>
                        <StatNumber fontSize="lg">{user.username}</StatNumber>
                        <StatHelpText>ID: {user._id}</StatHelpText>
                      </Stat>

                      <Stat>
                        <StatLabel>状态</StatLabel>
                        <StatNumber>
                          <Badge colorScheme={getStatusColor(user.status)} fontSize="md">
                            {getStatusText(user.status)}
                          </Badge>
                        </StatNumber>
                      </Stat>

                      <Stat>
                        <StatLabel>{t('user:create_time')}</StatLabel>
                        <StatNumber fontSize="md">{formatTime2YMDHM(user.createTime)}</StatNumber>
                      </Stat>

                      <Stat>
                        <StatLabel>{t('user:timezone')}</StatLabel>
                        <StatNumber fontSize="md">{user.timezone}</StatNumber>
                      </Stat>

                      <Stat>
                        <StatLabel>{t('user:promotion_rate')}</StatLabel>
                        <StatNumber fontSize="md">
                          {(user.promotionRate * 100).toFixed(1)}%
                        </StatNumber>
                      </Stat>

                      <Stat>
                        <StatLabel>{t('user:total_teams')}</StatLabel>
                        <StatNumber fontSize="md">{user.totalTeams}</StatNumber>
                      </Stat>
                    </SimpleGrid>
                  </VStack>
                </TabPanel>

                {/* 团队信息 */}
                <TabPanel>
                  <VStack spacing={4} align="stretch">
                    {user.teams.length === 0 ? (
                      <Alert status="info">
                        <AlertIcon />
                        {t('user:no_teams')}
                      </Alert>
                    ) : (
                      <TableContainer>
                        <Table variant="simple">
                          <Thead>
                            <Tr>
                              <Th>{t('user:team_name')}</Th>
                              <Th>{t('user:member_role')}</Th>
                              <Th>状态</Th>
                              <Th>{t('user:join_time')}</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {user.teams.map((team) => (
                              <Tr key={team.teamId}>
                                <Td>
                                  <Text fontWeight="medium">{team.teamName}</Text>
                                  <Text fontSize="xs" color="gray.500">
                                    ID: {team.teamId}
                                  </Text>
                                </Td>
                                <Td>
                                  <Badge colorScheme="blue">{team.role}</Badge>
                                </Td>
                                <Td>
                                  <Badge colorScheme={team.status === 'active' ? 'green' : 'gray'}>
                                    {team.status}
                                  </Badge>
                                </Td>
                                <Td>
                                  <Text fontSize="sm">-</Text>
                                </Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </TableContainer>
                    )}
                  </VStack>
                </TabPanel>

                {/* 资源统计 */}
                <TabPanel>
                  <VStack spacing={6} align="stretch">
                    <SimpleGrid columns={3} spacing={6}>
                      <Stat>
                        <StatLabel>{t('user:total_apps')}</StatLabel>
                        <StatNumber>{userDetail?.apps?.length || 0}</StatNumber>
                        <StatHelpText>{t('user:created_apps')}</StatHelpText>
                      </Stat>

                      <Stat>
                        <StatLabel>{t('user:total_datasets')}</StatLabel>
                        <StatNumber>{userDetail?.datasets?.length || 0}</StatNumber>
                        <StatHelpText>{t('user:created_datasets')}</StatHelpText>
                      </Stat>

                      <Stat>
                        <StatLabel>{t('user:storage_used')}</StatLabel>
                        <StatNumber>-</StatNumber>
                        <StatHelpText>{t('user:total_storage')}</StatHelpText>
                      </Stat>
                    </SimpleGrid>

                    <Divider />

                    {/* 应用列表 */}
                    {userDetail?.apps && userDetail.apps.length > 0 && (
                      <Box>
                        <Text fontSize="md" fontWeight="semibold" mb={3}>
                          {t('user:recent_apps')}
                        </Text>
                        <TableContainer>
                          <Table size="sm" variant="simple">
                            <Thead>
                              <Tr>
                                <Th>{t('user:app_name')}</Th>
                                <Th>{t('user:app_type')}</Th>
                                <Th>{t('user:create_time')}</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {userDetail.apps.slice(0, 5).map((app: any) => (
                                <Tr key={app._id}>
                                  <Td>{app.name}</Td>
                                  <Td>
                                    <Badge size="sm">{app.type}</Badge>
                                  </Td>
                                  <Td>
                                    <Text fontSize="xs">{formatTime2YMDHM(app.createTime)}</Text>
                                  </Td>
                                </Tr>
                              ))}
                            </Tbody>
                          </Table>
                        </TableContainer>
                      </Box>
                    )}

                    {/* 知识库列表 */}
                    {userDetail?.datasets && userDetail.datasets.length > 0 && (
                      <Box>
                        <Text fontSize="md" fontWeight="semibold" mb={3}>
                          {t('user:recent_datasets')}
                        </Text>
                        <TableContainer>
                          <Table size="sm" variant="simple">
                            <Thead>
                              <Tr>
                                <Th>{t('user:dataset_name')}</Th>
                                <Th>{t('user:vector_model')}</Th>
                                <Th>{t('user:create_time')}</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {userDetail.datasets.slice(0, 5).map((dataset: any) => (
                                <Tr key={dataset._id}>
                                  <Td>{dataset.name}</Td>
                                  <Td>
                                    <Text fontSize="xs">{dataset.vectorModel}</Text>
                                  </Td>
                                  <Td>
                                    <Text fontSize="xs">
                                      {formatTime2YMDHM(dataset.createTime)}
                                    </Text>
                                  </Td>
                                </Tr>
                              ))}
                            </Tbody>
                          </Table>
                        </TableContainer>
                      </Box>
                    )}
                  </VStack>
                </TabPanel>

                {/* 活动日志 */}
                <TabPanel>
                  <VStack spacing={4} align="stretch">
                    <Alert status="info">
                      <AlertIcon />
                      {t('user:activity_log_coming_soon')}
                    </Alert>

                    {userDetail?.loginHistory && userDetail.loginHistory.length > 0 && (
                      <Box>
                        <Text fontSize="md" fontWeight="semibold" mb={3}>
                          {t('user:recent_login')}
                        </Text>
                        <TableContainer>
                          <Table size="sm" variant="simple">
                            <Thead>
                              <Tr>
                                <Th>{t('user:login_time')}</Th>
                                <Th>{t('user:ip_address')}</Th>
                                <Th>{t('user:user_agent')}</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {userDetail.loginHistory
                                .slice(0, 10)
                                .map((log: any, index: number) => (
                                  <Tr key={index}>
                                    <Td>
                                      <Text fontSize="xs">{formatTime2YMDHM(log.loginTime)}</Text>
                                    </Td>
                                    <Td>
                                      <Text fontSize="xs">{log.ip}</Text>
                                    </Td>
                                    <Td>
                                      <Text fontSize="xs" maxW="200px" isTruncated>
                                        {log.userAgent}
                                      </Text>
                                    </Td>
                                  </Tr>
                                ))}
                            </Tbody>
                          </Table>
                        </TableContainer>
                      </Box>
                    )}
                  </VStack>
                </TabPanel>
              </TabPanels>
            </Tabs>
          )}
        </ModalBody>

        <ModalFooter>
          <Button onClick={onClose}>关闭</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default UserDetailModal;
