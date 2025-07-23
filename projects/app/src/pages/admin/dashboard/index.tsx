import React from 'react';
import {
  Box,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatArrow,
  Card,
  CardHeader,
  CardBody,
  Heading,
  Text,
  VStack,
  HStack,
  Badge,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Progress,
  Spinner,
  Alert,
  AlertIcon
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer
} from 'recharts';
import { getUserStats } from '@/web/support/user/admin/api';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import AdminLayout from '@/components/Layout/AdminLayout';

// 图表颜色配置
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

const AdminDashboard = () => {
  const { t } = useTranslation();

  // 获取用户统计数据
  const {
    data: stats,
    isLoading,
    error
  } = useQuery({
    queryKey: ['userStats'],
    queryFn: getUserStats,
    refetchInterval: 30000 // 30秒刷新一次
  });

  if (isLoading) {
    return (
      <MyBox isLoading={true} h={'100%'} py={[0, 5]}>
        <Box display="flex" justifyContent="center" alignItems="center" h="400px">
          <Spinner size="xl" />
        </Box>
      </MyBox>
    );
  }

  if (error) {
    return (
      <MyBox h={'100%'} py={[0, 5]}>
        <Alert status="error">
          <AlertIcon />
          加载失败
        </Alert>
      </MyBox>
    );
  }

  // 准备图表数据
  const registrationChartData =
    stats?.recentRegistrations?.map((item) => ({
      date: item.date,
      count: item.count
    })) || [];

  const statusPieData =
    stats?.usersByStatus?.map((item, index) => ({
      name: (() => {
        switch (item.status) {
          case 'active':
            return t('user:user_status.active');
          case 'inactive':
            return t('user:user_status.inactive');
          case 'forbidden':
            return t('user:user_status.forbidden');
          default:
            return item.status;
        }
      })(),
      value: item.count,
      fill: COLORS[index % COLORS.length]
    })) || [];

  return (
    <AdminLayout
      title={t('user:admin.dashboard_title')}
      breadcrumbs={[{ label: t('user:admin.dashboard_title') }]}
    >
      <MyBox h={'100%'} position={'relative'}>
        <VStack spacing={6} align="stretch">
          {/* 统计卡片 */}
          <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6}>
            <Card>
              <CardBody>
                <Stat>
                  <StatLabel>{t('user:admin.total_users')}</StatLabel>
                  <StatNumber color="blue.500">{stats?.totalUsers || 0}</StatNumber>
                  <StatHelpText>
                    <HStack>
                      <MyIcon name="support/user/userLight" w="14px" h="14px" />
                      <Text>{t('user:admin.all_users')}</Text>
                    </HStack>
                  </StatHelpText>
                </Stat>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Stat>
                  <StatLabel>{t('user:admin.active_users')}</StatLabel>
                  <StatNumber color="green.500">{stats?.activeUsers || 0}</StatNumber>
                  <StatHelpText>
                    <StatArrow type="increase" />
                    {stats?.totalUsers
                      ? ((stats.activeUsers / stats.totalUsers) * 100).toFixed(1)
                      : 0}
                    %
                  </StatHelpText>
                </Stat>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Stat>
                  <StatLabel>{t('user:admin.total_teams')}</StatLabel>
                  <StatNumber color="purple.500">{stats?.totalTeams || 0}</StatNumber>
                  <StatHelpText>
                    <HStack>
                      <MyIcon name="support/user/usersLight" w="14px" h="14px" />
                      <Text>{t('user:admin.all_teams')}</Text>
                    </HStack>
                  </StatHelpText>
                </Stat>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Stat>
                  <StatLabel>{t('user:admin.total_resources')}</StatLabel>
                  <StatNumber color="orange.500">
                    {(stats?.totalApps || 0) + (stats?.totalDatasets || 0)}
                  </StatNumber>
                  <StatHelpText>
                    <Text fontSize="xs">
                      {stats?.totalApps || 0} {t('user:admin.apps')} + {stats?.totalDatasets || 0}{' '}
                      {t('user:admin.datasets')}
                    </Text>
                  </StatHelpText>
                </Stat>
              </CardBody>
            </Card>
          </SimpleGrid>

          {/* 图表区域 */}
          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
            {/* 注册趋势图 */}
            <Card>
              <CardHeader>
                <Heading size="md">{t('user:admin.registration_trend')}</Heading>
              </CardHeader>
              <CardBody>
                <Box h="300px">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={registrationChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#8884d8"
                        strokeWidth={2}
                        name={t('user:admin.daily_registrations')}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </CardBody>
            </Card>

            {/* 用户状态分布 */}
            <Card>
              <CardHeader>
                <Heading size="md">{t('user:admin.user_status_distribution')}</Heading>
              </CardHeader>
              <CardBody>
                <Box h="300px">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusPieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              </CardBody>
            </Card>
          </SimpleGrid>

          {/* 团队排行榜 */}
          <Card>
            <CardHeader>
              <Heading size="md">{t('user:admin.top_teams_by_members')}</Heading>
            </CardHeader>
            <CardBody>
              {stats?.topTeamsByMembers && stats.topTeamsByMembers.length > 0 ? (
                <TableContainer>
                  <Table variant="simple">
                    <Thead>
                      <Tr>
                        <Th>{t('user:admin.rank')}</Th>
                        <Th>{t('user:team_name')}</Th>
                        <Th>{t('user:admin.member_count')}</Th>
                        <Th>{t('user:admin.progress')}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {stats.topTeamsByMembers.map((team, index) => {
                        const maxMembers = stats.topTeamsByMembers[0]?.memberCount || 1;
                        const percentage = (team.memberCount / maxMembers) * 100;

                        return (
                          <Tr key={team.teamId}>
                            <Td>
                              <Badge
                                colorScheme={index === 0 ? 'gold' : index === 1 ? 'gray' : 'bronze'}
                                variant={index < 3 ? 'solid' : 'outline'}
                              >
                                #{index + 1}
                              </Badge>
                            </Td>
                            <Td>
                              <VStack align="start" spacing={1}>
                                <Text fontWeight="medium">{team.teamName}</Text>
                                <Text fontSize="xs" color="gray.500">
                                  ID: {team.teamId}
                                </Text>
                              </VStack>
                            </Td>
                            <Td>
                              <Text fontWeight="semibold">{team.memberCount}</Text>
                            </Td>
                            <Td>
                              <Box w="100px">
                                <Progress
                                  value={percentage}
                                  colorScheme={index === 0 ? 'blue' : 'gray'}
                                  size="sm"
                                  borderRadius="md"
                                />
                              </Box>
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </TableContainer>
              ) : (
                <Alert status="info">
                  <AlertIcon />
                  {t('user:admin.no_team_data')}
                </Alert>
              )}
            </CardBody>
          </Card>

          {/* 系统状态 */}
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
            <Card>
              <CardBody>
                <VStack spacing={3}>
                  <HStack>
                    <MyIcon name="common/check" w="16px" h="16px" color="green.500" />
                    <Text fontWeight="semibold">{t('user:admin.system_status')}</Text>
                  </HStack>
                  <Badge colorScheme="green" size="lg">
                    {t('user:admin.running_normal')}
                  </Badge>
                </VStack>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <VStack spacing={3}>
                  <HStack>
                    <MyIcon name="date" w="16px" h="16px" color="blue.500" />
                    <Text fontWeight="semibold">{t('user:admin.last_update')}</Text>
                  </HStack>
                  <Text fontSize="sm" color="gray.600">
                    {formatTime2YMDHM(new Date())}
                  </Text>
                </VStack>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <VStack spacing={3}>
                  <HStack>
                    <MyIcon name="common/data" w="16px" h="16px" color="purple.500" />
                    <Text fontWeight="semibold">{t('user:admin.database_status')}</Text>
                  </HStack>
                  <Badge colorScheme="green" size="lg">
                    {t('user:admin.connected')}
                  </Badge>
                </VStack>
              </CardBody>
            </Card>
          </SimpleGrid>
        </VStack>
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

export default AdminDashboard;
