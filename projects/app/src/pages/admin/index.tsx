import React, { useMemo } from 'react';
import {
  Box,
  Flex,
  Button,
  VStack,
  HStack,
  Text,
  Card,
  CardBody,
  CardHeader,
  Grid,
  GridItem,
  Alert,
  AlertIcon,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Icon
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getUserStats } from '@/web/support/user/admin/api';

const AdminDashboard = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { userInfo } = useUserStore();

  // 检查管理员权限
  const isAdmin = useMemo(() => {
    return userInfo?.isRoot || userInfo?.username === 'root';
  }, [userInfo]);

  // 获取用户统计
  const { data: userStats } = useRequest2(getUserStats, {
    manual: false
  });

  // 权限检查
  if (!isAdmin) {
    return (
      <Box p={8}>
        <Alert status="error">
          <AlertIcon />
          您没有访问管理员页面的权限
        </Alert>
      </Box>
    );
  }

  const adminMenus = [
    {
      title: '用户管理',
      description: '管理系统用户，查看用户信息和团队关系',
      icon: 'user' as const,
      path: '/admin/users',
      color: 'blue'
    },
    {
      title: '团队管理',
      description: '管理团队信息，查看团队成员和权限',
      icon: 'support/team/group' as const,
      path: '/admin/teams',
      color: 'green'
    },
    {
      title: '权限管理',
      description: '管理系统权限，查看权限分配情况',
      icon: 'key' as const,
      path: '/admin/permissions',
      color: 'purple'
    },
    {
      title: '系统设置',
      description: '系统配置和参数设置',
      icon: 'common/settingLight' as const,
      path: '/admin/settings',
      color: 'orange'
    }
  ];

  return (
    <Box p={6} bg="gray.50" minH="100vh">
      <VStack spacing={6} align="stretch">
        {/* 页面标题 */}
        <Box>
          <Text fontSize="2xl" fontWeight="bold" mb={2}>
            管理员控制台
          </Text>
          <Text color="gray.600">欢迎回来，{userInfo?.username}！这里是系统管理中心。</Text>
        </Box>

        {/* 统计卡片 */}
        {userStats && (
          <Grid templateColumns="repeat(auto-fit, minmax(250px, 1fr))" gap={6}>
            <GridItem>
              <Card>
                <CardBody>
                  <Stat>
                    <StatLabel>总用户数</StatLabel>
                    <StatNumber color="blue.600">{userStats.totalUsers}</StatNumber>
                    <StatHelpText>系统注册用户总数</StatHelpText>
                  </Stat>
                </CardBody>
              </Card>
            </GridItem>
            <GridItem>
              <Card>
                <CardBody>
                  <Stat>
                    <StatLabel>活跃用户</StatLabel>
                    <StatNumber color="green.600">{userStats.activeUsers}</StatNumber>
                    <StatHelpText>当前活跃用户数量</StatHelpText>
                  </Stat>
                </CardBody>
              </Card>
            </GridItem>
            <GridItem>
              <Card>
                <CardBody>
                  <Stat>
                    <StatLabel>活跃用户</StatLabel>
                    <StatNumber color="purple.600">{userStats?.activeUsers || 0}</StatNumber>
                    <StatHelpText>当前活跃用户数</StatHelpText>
                  </Stat>
                </CardBody>
              </Card>
            </GridItem>
            <GridItem>
              <Card>
                <CardBody>
                  <Stat>
                    <StatLabel>团队总数</StatLabel>
                    <StatNumber color="orange.600">{userStats.totalTeams || 0}</StatNumber>
                    <StatHelpText>系统中的团队数量</StatHelpText>
                  </Stat>
                </CardBody>
              </Card>
            </GridItem>
          </Grid>
        )}

        {/* 功能菜单 */}
        <Box>
          <Text fontSize="lg" fontWeight="semibold" mb={4}>
            管理功能
          </Text>
          <Grid templateColumns="repeat(auto-fit, minmax(300px, 1fr))" gap={6}>
            {adminMenus.map((menu) => (
              <GridItem key={menu.path}>
                <Card
                  cursor="pointer"
                  transition="all 0.2s"
                  _hover={{
                    transform: 'translateY(-2px)',
                    shadow: 'lg'
                  }}
                  onClick={() => router.push(menu.path)}
                >
                  <CardBody>
                    <HStack spacing={4}>
                      <Box
                        p={3}
                        borderRadius="md"
                        bg={`${menu.color}.100`}
                        color={`${menu.color}.600`}
                      >
                        <MyIcon name={menu.icon} w="24px" h="24px" />
                      </Box>
                      <VStack align="start" spacing={1} flex={1}>
                        <Text fontWeight="semibold" fontSize="md">
                          {menu.title}
                        </Text>
                        <Text fontSize="sm" color="gray.600">
                          {menu.description}
                        </Text>
                      </VStack>
                    </HStack>
                  </CardBody>
                </Card>
              </GridItem>
            ))}
          </Grid>
        </Box>

        {/* 快速操作 */}
        <Card>
          <CardHeader>
            <Text fontSize="lg" fontWeight="semibold">
              快速操作
            </Text>
          </CardHeader>
          <CardBody>
            <HStack spacing={4} flexWrap="wrap">
              <Button
                leftIcon={<MyIcon name="support/user/userLight" w="16px" />}
                colorScheme="blue"
                variant="outline"
                onClick={() => router.push('/admin/users')}
              >
                查看用户列表
              </Button>
              <Button
                leftIcon={<MyIcon name="support/team/group" w="16px" />}
                colorScheme="green"
                variant="outline"
                onClick={() => router.push('/admin/teams')}
              >
                管理团队
              </Button>
              <Button
                leftIcon={<MyIcon name="key" w="16px" />}
                colorScheme="purple"
                variant="outline"
                onClick={() => router.push('/admin/permissions')}
              >
                权限设置
              </Button>
              <Button
                leftIcon={<MyIcon name="common/settingLight" w="16px" />}
                colorScheme="orange"
                variant="outline"
                onClick={() => router.push('/admin/settings')}
              >
                系统设置
              </Button>
            </HStack>
          </CardBody>
        </Card>

        {/* 系统信息 */}
        <Card>
          <CardHeader>
            <Text fontSize="lg" fontWeight="semibold">
              系统信息
            </Text>
          </CardHeader>
          <CardBody>
            <Grid templateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap={4}>
              <Box>
                <Text fontSize="sm" color="gray.600">
                  系统版本
                </Text>
                <Text fontWeight="semibold">FastGPT v4.11.0</Text>
              </Box>
              <Box>
                <Text fontSize="sm" color="gray.600">
                  当前用户
                </Text>
                <Text fontWeight="semibold">{userInfo?.username}</Text>
              </Box>
              <Box>
                <Text fontSize="sm" color="gray.600">
                  用户角色
                </Text>
                <Text fontWeight="semibold">管理员</Text>
              </Box>
              <Box>
                <Text fontSize="sm" color="gray.600">
                  登录时间
                </Text>
                <Text fontWeight="semibold">{new Date().toLocaleString('zh-CN')}</Text>
              </Box>
            </Grid>
          </CardBody>
        </Card>

        {/* 功能说明 */}
        <Alert status="info">
          <AlertIcon />
          <Box>
            <Text fontWeight="semibold">功能说明</Text>
            <Text fontSize="sm" mt={1}>
              • <strong>用户管理</strong>：查看和管理系统中的所有用户，包括用户状态、团队关系等
            </Text>
            <Text fontSize="sm">
              • <strong>团队管理</strong>：管理团队信息，查看团队成员和权限分配
            </Text>
            <Text fontSize="sm">
              • <strong>权限管理</strong>：查看和管理系统权限，确保安全访问控制
            </Text>
            <Text fontSize="sm">
              • <strong>系统设置</strong>：配置系统参数和全局设置
            </Text>
          </Box>
        </Alert>
      </VStack>
    </Box>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['common', 'account']))
    }
  };
}

export default AdminDashboard;
