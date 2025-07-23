import React, { type ReactNode } from 'react';
import {
  Box,
  Flex,
  VStack,
  HStack,
  Text,
  Button,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  useColorModeValue
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useUserStore } from '@/web/support/user/useUserStore';

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
  breadcrumbs?: { label: string; href?: string }[];
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children, title, breadcrumbs = [] }) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  const bgColor = useColorModeValue('gray.50', 'gray.900');
  const sidebarBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  // 检查管理员权限 - 检查用户名是否为root或isRoot字段
  const isAdmin = userInfo?.isRoot || userInfo?.username === 'root';

  if (!isAdmin) {
    return (
      <Flex h="100vh" align="center" justify="center">
        <VStack spacing={4}>
          <MyIcon name="common/warn" w="48px" h="48px" color="gray.400" />
          <Text fontSize="lg" color="gray.500">
            权限不足，需要root用户权限
          </Text>
          <Text fontSize="sm" color="gray.400">
            当前用户：{userInfo?.username || '未登录'}
          </Text>
          <Button onClick={() => router.push('/dashboard/apps')}>返回首页</Button>
        </VStack>
      </Flex>
    );
  }

  const menuItems = [
    {
      label: '仪表板',
      icon: 'common/overviewLight',
      href: '/admin/dashboard',
      active: router.pathname === '/admin/dashboard'
    },
    {
      label: '用户管理',
      icon: 'support/user/userLight',
      href: '/admin/users',
      active: router.pathname === '/admin/users'
    },
    {
      label: '团队管理',
      icon: 'support/user/usersLight',
      href: '/admin/teams',
      active: router.pathname === '/admin/teams'
    }
  ];

  return (
    <Flex h="100vh" bg={bgColor}>
      {/* 侧边栏 */}
      <Box w="250px" bg={sidebarBg} borderRight="1px" borderColor={borderColor} p={4}>
        <VStack align="stretch" spacing={4}>
          {/* 标题 */}
          <HStack spacing={3} mb={4}>
            <MyIcon name="common/settingLight" w="24px" h="24px" color="primary.500" />
            <Text fontSize="lg" fontWeight="bold">
              系统管理
            </Text>
          </HStack>

          {/* 菜单项 */}
          <VStack align="stretch" spacing={1}>
            {menuItems.map((item) => (
              <Button
                key={item.href}
                variant={item.active ? 'solid' : 'ghost'}
                colorScheme={item.active ? 'blue' : 'gray'}
                justifyContent="flex-start"
                leftIcon={<MyIcon name={item.icon as any} w="16px" h="16px" />}
                onClick={() => router.push(item.href)}
                size="md"
                fontWeight="normal"
              >
                {item.label}
              </Button>
            ))}
          </VStack>
        </VStack>
      </Box>

      {/* 主内容区 */}
      <Flex flex={1} direction="column" overflow="hidden">
        {/* 顶部栏 */}
        <Box bg={sidebarBg} borderBottom="1px" borderColor={borderColor} px={6} py={4}>
          <Flex align="center" justify="space-between">
            <VStack align="start" spacing={1}>
              {title && (
                <Text fontSize="xl" fontWeight="semibold">
                  {title}
                </Text>
              )}
              {breadcrumbs.length > 0 && (
                <Breadcrumb fontSize="sm" color="gray.500">
                  <BreadcrumbItem>
                    <BreadcrumbLink onClick={() => router.push('/admin/dashboard')}>
                      系统管理
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {breadcrumbs.map((crumb, index) => (
                    <BreadcrumbItem key={index} isCurrentPage={!crumb.href}>
                      {crumb.href ? (
                        <BreadcrumbLink onClick={() => router.push(crumb.href!)}>
                          {crumb.label}
                        </BreadcrumbLink>
                      ) : (
                        <Text>{crumb.label}</Text>
                      )}
                    </BreadcrumbItem>
                  ))}
                </Breadcrumb>
              )}
            </VStack>

            <HStack>
              <Text fontSize="sm" color="gray.500">
                管理员模式
              </Text>
              <Button size="sm" variant="outline" onClick={() => router.push('/dashboard/apps')}>
                返回应用
              </Button>
            </HStack>
          </Flex>
        </Box>

        {/* 内容区域 */}
        <Box flex={1} overflow="auto" p={6}>
          {children}
        </Box>
      </Flex>
    </Flex>
  );
};

export default AdminLayout;
