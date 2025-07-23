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

const TestAppList = () => {
  const { userInfo } = useUserStore();
  const router = useRouter();
  const [appListResult, setAppListResult] = useState<any>(null);
  const [userInfoResult, setUserInfoResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // 测试应用列表API
  const testAppListAPI = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/core/app/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      const data = await response.json();
      setAppListResult(data);
      console.log('App List API Response:', data);
    } catch (error) {
      setAppListResult({
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      console.error('App List API Error:', error);
    }
    setLoading(false);
  };

  // 测试数据库中的应用数据
  const testDatabaseApps = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/test/database-apps', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      const data = await response.json();
      console.log('Database Apps Response:', data);
      setAppListResult(data);
    } catch (error) {
      setAppListResult({
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      console.error('Database Apps Error:', error);
    }
    setLoading(false);
  };

  // 测试用户信息API
  const testUserInfoAPI = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/support/user/account/tokenLogin');
      const data = await response.json();
      setUserInfoResult(data);
      console.log('User Info API Response:', data);
    } catch (error) {
      setUserInfoResult({
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      console.error('User Info API Error:', error);
    }
    setLoading(false);
  };

  // 测试所有API
  const testAllAPIs = async () => {
    await testUserInfoAPI();
    await testAppListAPI();
  };

  // 创建测试应用
  const createTestApp = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/test/create-test-app', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          appName: '测试应用'
        })
      });
      const data = await response.json();
      console.log('Create Test App Response:', data);

      if (data.code === 200) {
        alert('测试应用创建成功！');
        // 重新检查应用列表
        await testDatabaseApps();
      } else {
        alert('创建失败: ' + data.message);
      }
    } catch (error) {
      console.error('Create Test App Error:', error);
      alert('创建失败: ' + (error instanceof Error ? error.message : 'Unknown error occurred'));
    }
    setLoading(false);
  };

  // 测试简化的应用列表API
  const testSimpleAppList = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/test/simple-app-list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      const data = await response.json();
      setAppListResult(data);
      console.log('Simple App List Response:', data);
    } catch (error) {
      setAppListResult({
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
      console.error('Simple App List Error:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    testAllAPIs();
  }, []);

  return (
    <Box p={6} maxW="1200px" mx="auto">
      <VStack spacing={6} align="stretch">
        <Text fontSize="2xl" fontWeight="bold" color="blue.600">
          🔧 应用列表和团队切换测试页面
        </Text>

        {/* 当前用户信息 */}
        <Alert status="info">
          <AlertIcon />
          <VStack align="start" spacing={1}>
            <Text fontWeight="bold" fontSize="lg">
              当前用户信息 (前端Store)
            </Text>
            <HStack spacing={4}>
              <Badge colorScheme="blue">用户名: {userInfo?.username || '未获取'}</Badge>
              <Badge colorScheme="green">团队ID: {userInfo?.team?.teamId || '未获取'}</Badge>
              <Badge colorScheme="purple">团队名称: {userInfo?.team?.teamName || '未获取'}</Badge>
              <Badge colorScheme="orange">tmbId: {userInfo?.team?.tmbId || '未获取'}</Badge>
            </HStack>
          </VStack>
        </Alert>

        {/* 操作按钮 */}
        <HStack spacing={4} flexWrap="wrap">
          <Button colorScheme="blue" onClick={testUserInfoAPI} isLoading={loading} size="sm">
            🔄 测试用户信息API
          </Button>
          <Button colorScheme="green" onClick={testAppListAPI} isLoading={loading} size="sm">
            📱 测试应用列表API
          </Button>
          <Button colorScheme="red" onClick={testDatabaseApps} isLoading={loading} size="sm">
            🗄️ 检查数据库应用
          </Button>
          <Button colorScheme="yellow" onClick={createTestApp} isLoading={loading} size="sm">
            ➕ 创建测试应用
          </Button>
          <Button colorScheme="purple" onClick={testAllAPIs} isLoading={loading} size="sm">
            🔄 测试所有API
          </Button>
          <Button colorScheme="orange" onClick={() => window.location.reload()} size="sm">
            🔄 刷新页面
          </Button>
        </HStack>

        <Divider />

        {/* API响应对比 */}
        <HStack spacing={6} align="start">
          {/* 用户信息API响应 */}
          <Box flex={1}>
            <Text fontSize="lg" fontWeight="semibold" mb={2} color="green.600">
              🔌 用户信息API响应:
            </Text>
            <Code
              p={4}
              display="block"
              whiteSpace="pre-wrap"
              fontSize="xs"
              maxH="400px"
              overflowY="auto"
            >
              {JSON.stringify(userInfoResult, null, 2)}
            </Code>
          </Box>

          {/* 应用列表API响应 */}
          <Box flex={1}>
            <Text fontSize="lg" fontWeight="semibold" mb={2} color="blue.600">
              📱 应用列表API响应:
            </Text>
            <Code
              p={4}
              display="block"
              whiteSpace="pre-wrap"
              fontSize="xs"
              maxH="400px"
              overflowY="auto"
            >
              {JSON.stringify(appListResult, null, 2)}
            </Code>
          </Box>
        </HStack>

        <Divider />

        {/* 团队信息对比 */}
        <Box>
          <Text fontSize="lg" fontWeight="semibold" mb={4} color="purple.600">
            🔍 团队信息对比:
          </Text>
          <VStack align="start" spacing={3}>
            <HStack>
              <Text minW="150px" fontWeight="semibold">
                前端Store团队ID:
              </Text>
              <Badge colorScheme="blue" size="lg">
                {userInfo?.team?.teamId || '未获取'}
              </Badge>
            </HStack>
            <HStack>
              <Text minW="150px" fontWeight="semibold">
                API返回团队ID:
              </Text>
              <Badge colorScheme="green" size="lg">
                {userInfoResult?.team?.teamId || '未获取'}
              </Badge>
            </HStack>
            <HStack>
              <Text minW="150px" fontWeight="semibold">
                前端Store团队名:
              </Text>
              <Badge colorScheme="purple" size="lg">
                {userInfo?.team?.teamName || '未获取'}
              </Badge>
            </HStack>
            <HStack>
              <Text minW="150px" fontWeight="semibold">
                API返回团队名:
              </Text>
              <Badge colorScheme="orange" size="lg">
                {userInfoResult?.team?.teamName || '未获取'}
              </Badge>
            </HStack>
            <HStack>
              <Text minW="150px" fontWeight="semibold">
                应用数量:
              </Text>
              <Badge colorScheme="red" size="lg">
                {Array.isArray(appListResult) ? appListResult.length : '0'} 个应用
              </Badge>
            </HStack>
          </VStack>
        </Box>

        <Divider />

        {/* 诊断信息 */}
        <Alert status="warning">
          <AlertIcon />
          <Box>
            <Text fontWeight="bold">🔧 诊断信息:</Text>
            <VStack align="start" spacing={1} mt={2}>
              <Text fontSize="sm">
                <strong>问题:</strong> 团队切换后看不到应用
              </Text>
              <Text fontSize="sm">
                <strong>可能原因:</strong>
              </Text>
              <Text fontSize="sm" ml={4}>
                1. 前端Store的团队信息没有更新
              </Text>
              <Text fontSize="sm" ml={4}>
                2. API返回的团队信息不正确
              </Text>
              <Text fontSize="sm" ml={4}>
                3. 应用列表API使用了错误的团队ID
              </Text>
              <Text fontSize="sm" ml={4}>
                4. 缓存问题导致数据不一致
              </Text>
            </VStack>
          </Box>
        </Alert>

        {/* 解决方案 */}
        <Alert status="success">
          <AlertIcon />
          <Box>
            <Text fontWeight="bold">💡 解决方案:</Text>
            <VStack align="start" spacing={1} mt={2}>
              <Text fontSize="sm">1. 检查团队切换API是否正确更新了session</Text>
              <Text fontSize="sm">2. 确认用户信息API返回正确的团队信息</Text>
              <Text fontSize="sm">3. 验证应用列表API使用正确的团队ID过滤</Text>
              <Text fontSize="sm">4. 清除前端缓存并强制刷新数据</Text>
            </VStack>
          </Box>
        </Alert>

        {/* 快速操作 */}
        <Box bg="gray.50" p={4} borderRadius="md">
          <Text fontSize="md" fontWeight="semibold" mb={2}>
            🚀 快速操作:
          </Text>
          <HStack spacing={3}>
            <Button size="sm" colorScheme="blue" onClick={() => router.push('/dashboard/apps')}>
              前往应用列表
            </Button>
            <Button size="sm" colorScheme="green" onClick={() => router.push('/account/info')}>
              前往账户信息
            </Button>
            <Button size="sm" colorScheme="purple" onClick={() => router.push('/test-team-switch')}>
              团队切换测试
            </Button>
          </HStack>
        </Box>
      </VStack>
    </Box>
  );
};

export default TestAppList;
