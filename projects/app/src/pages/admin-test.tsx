import React, { useEffect, useState } from 'react';
import {
  Box,
  VStack,
  Text,
  Button,
  Alert,
  AlertIcon,
  Code,
  HStack,
  Badge,
  Divider
} from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRouter } from 'next/router';

const AdminTest = () => {
  const { userInfo, initUserInfo } = useUserStore();
  const router = useRouter();
  const [apiResult, setApiResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // 测试API调用
  const testAPI = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/support/user/account/tokenLogin');
      const data = await response.json();
      setApiResult(data);
      console.log('API Response:', data);
    } catch (error) {
      setApiResult({ error: error instanceof Error ? error.message : String(error) });
      console.error('API Error:', error);
    }
    setLoading(false);
  };

  // 强制刷新用户信息
  const forceRefresh = async () => {
    setLoading(true);
    try {
      await initUserInfo();
      await testAPI();
    } catch (error) {
      console.error('刷新失败:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    testAPI();
  }, []);

  const isAdmin = userInfo?.isRoot || userInfo?.username === 'root';

  return (
    <Box p={6} maxW="1000px" mx="auto">
      <VStack spacing={6} align="stretch">
        <Text fontSize="2xl" fontWeight="bold" color="blue.600">
          🔧 管理员功能测试页面
        </Text>

        {/* 当前状态 */}
        <Alert status={isAdmin ? 'success' : 'error'}>
          <AlertIcon />
          <VStack align="start" spacing={1}>
            <Text fontWeight="bold" fontSize="lg">
              {isAdmin ? '✅ 管理员权限正常' : '❌ 没有管理员权限'}
            </Text>
            <HStack spacing={4}>
              <Badge colorScheme={userInfo?.username === 'root' ? 'green' : 'red'}>
                用户名: {userInfo?.username || '未获取'}
              </Badge>
              <Badge colorScheme={userInfo?.isRoot ? 'green' : 'red'}>
                isRoot: {userInfo?.isRoot ? '是' : '否'}
              </Badge>
            </HStack>
          </VStack>
        </Alert>

        {/* 操作按钮 */}
        <HStack spacing={4} flexWrap="wrap">
          <Button colorScheme="blue" onClick={testAPI} isLoading={loading} size="sm">
            🔄 测试API
          </Button>
          <Button colorScheme="green" onClick={forceRefresh} isLoading={loading} size="sm">
            🔄 强制刷新
          </Button>
          <Button
            colorScheme="purple"
            onClick={() => router.push('/admin/dashboard')}
            disabled={!isAdmin}
            size="sm"
          >
            🏠 管理仪表板
          </Button>
          <Button
            colorScheme="orange"
            onClick={() => router.push('/admin/users')}
            disabled={!isAdmin}
            size="sm"
          >
            👥 用户管理
          </Button>
          <Button
            colorScheme="teal"
            onClick={() => router.push('/admin/teams')}
            disabled={!isAdmin}
            size="sm"
          >
            🏢 团队管理
          </Button>
        </HStack>

        <Divider />

        {/* 详细信息 */}
        <HStack spacing={6} align="start">
          {/* 用户信息 */}
          <Box flex={1}>
            <Text fontSize="lg" fontWeight="semibold" mb={2} color="blue.600">
              📋 用户信息 (useUserStore):
            </Text>
            <Code
              p={4}
              display="block"
              whiteSpace="pre-wrap"
              fontSize="xs"
              maxH="300px"
              overflowY="auto"
            >
              {JSON.stringify(userInfo, null, 2)}
            </Code>
          </Box>

          {/* API响应 */}
          <Box flex={1}>
            <Text fontSize="lg" fontWeight="semibold" mb={2} color="green.600">
              🔌 API响应 (/api/support/user/account/tokenLogin):
            </Text>
            <Code
              p={4}
              display="block"
              whiteSpace="pre-wrap"
              fontSize="xs"
              maxH="300px"
              overflowY="auto"
            >
              {JSON.stringify(apiResult, null, 2)}
            </Code>
          </Box>
        </HStack>

        <Divider />

        {/* 权限检查详情 */}
        <Box>
          <Text fontSize="lg" fontWeight="semibold" mb={4} color="purple.600">
            🔍 权限检查详情:
          </Text>
          <VStack align="start" spacing={3}>
            <HStack>
              <Text minW="120px">用户名检查:</Text>
              <Badge colorScheme={userInfo?.username === 'root' ? 'green' : 'red'} size="lg">
                {userInfo?.username === 'root' ? '✅ 是root用户' : '❌ 不是root用户'}
              </Badge>
              <Text fontSize="sm" color="gray.500">
                (当前: {userInfo?.username || '未获取'})
              </Text>
            </HStack>
            <HStack>
              <Text minW="120px">isRoot字段:</Text>
              <Badge colorScheme={userInfo?.isRoot ? 'green' : 'red'} size="lg">
                {userInfo?.isRoot ? '✅ true' : '❌ false/undefined'}
              </Badge>
              <Text fontSize="sm" color="gray.500">
                (值: {String(userInfo?.isRoot)})
              </Text>
            </HStack>
            <HStack>
              <Text minW="120px">最终权限:</Text>
              <Badge colorScheme={isAdmin ? 'green' : 'red'} size="lg">
                {isAdmin ? '✅ 有管理员权限' : '❌ 无管理员权限'}
              </Badge>
              <Text fontSize="sm" color="gray.500">
                (条件: isRoot || username === &apos;root&apos;)
              </Text>
            </HStack>
          </VStack>
        </Box>

        <Divider />

        {/* 导航栏显示逻辑 */}
        <Alert status="info">
          <AlertIcon />
          <Box>
            <Text fontWeight="bold">🧭 导航栏显示逻辑:</Text>
            <Text fontSize="sm" mt={1}>
              <strong>条件:</strong> userInfo?.isRoot (当前: {String(userInfo?.isRoot)})
            </Text>
            <Text fontSize="sm">
              <strong>结果:</strong> {isAdmin ? '✅ 应该显示"管理"菜单' : '❌ 不会显示"管理"菜单'}
            </Text>
          </Box>
        </Alert>

        {/* 故障排除 */}
        <Alert status="warning">
          <AlertIcon />
          <Box>
            <Text fontWeight="bold">🔧 如果没有管理员权限，请尝试:</Text>
            <VStack align="start" spacing={1} mt={2}>
              <Text fontSize="sm">
                1. 确保使用 <strong>root/123456</strong> 登录
              </Text>
              <Text fontSize="sm">2. 点击&quot;强制刷新&quot;按钮</Text>
              <Text fontSize="sm">3. 清除浏览器缓存并重新登录</Text>
              <Text fontSize="sm">4. 检查浏览器控制台是否有错误</Text>
              <Text fontSize="sm">5. 确认服务器已重启并加载新配置</Text>
            </VStack>
          </Box>
        </Alert>

        {/* 系统信息 */}
        <Box bg="gray.50" p={4} borderRadius="md">
          <Text fontSize="md" fontWeight="semibold" mb={2}>
            ℹ️ 系统信息:
          </Text>
          <VStack align="start" spacing={1}>
            <Text fontSize="sm">当前页面: {router.pathname}</Text>
            <Text fontSize="sm">用户ID: {userInfo?._id || '未获取'}</Text>
            <Text fontSize="sm">团队ID: {userInfo?.team?.teamId || '未获取'}</Text>
            <Text fontSize="sm">团队名称: {userInfo?.team?.teamName || '未获取'}</Text>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
};

export default AdminTest;
