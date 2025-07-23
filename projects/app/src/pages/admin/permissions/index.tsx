import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  VStack,
  HStack,
  Text,
  useToast,
  Spinner,
  Alert,
  AlertIcon,
  Select,
  Input,
  InputGroup,
  InputLeftElement,
  Flex,
  Card,
  CardHeader,
  CardBody,
  Heading,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel
} from '@chakra-ui/react';
import { SearchIcon } from '@chakra-ui/icons';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { serviceSideProps } from '@/web/common/i18n/utils';

interface PermissionRecord {
  _id: string;
  resourceType: string;
  resourceId: string;
  resourceName: string;
  teamId: string;
  teamName: string;
  tmbId?: string;
  memberName?: string;
  groupId?: string;
  groupName?: string;
  orgId?: string;
  orgName?: string;
  permission: number;
  createTime: Date;
}

const PermissionManagement: React.FC = () => {
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchKey, setSearchKey] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');

  const { userInfo } = useUserStore();
  const router = useRouter();
  const toast = useToast();
  const { t } = useTranslation();

  // 检查是否为root用户
  const isRootUser = userInfo?.username === 'root';

  const fetchPermissions = async () => {
    if (!isRootUser) return;

    try {
      setLoading(true);
      const response = await fetch('/api/admin/permissions/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          searchKey,
          resourceType: resourceTypeFilter || undefined
        })
      });

      const data = await response.json();

      if (data.code === 200) {
        setPermissions(data.data.permissions || []);
      } else {
        toast({
          title: '获取权限列表失败',
          description: data.message,
          status: 'error'
        });
      }
    } catch (error) {
      console.error('Fetch permissions error:', error);
      toast({
        title: '获取权限列表出错',
        description: String(error),
        status: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isRootUser) {
      fetchPermissions();
    }
  }, [isRootUser, searchKey, resourceTypeFilter]);

  const getPermissionText = (permission: number) => {
    const permissions = [];
    if (permission & 4) permissions.push('读取');
    if (permission & 2) permissions.push('写入');
    if (permission & 1) permissions.push('管理');
    return permissions.join(', ') || '无权限';
  };

  const getPermissionColor = (permission: number) => {
    if (permission >= 7) return 'purple';
    if (permission >= 6) return 'blue';
    if (permission >= 4) return 'green';
    return 'gray';
  };

  if (!userInfo) {
    return (
      <Box p={8}>
        <Alert status="warning">
          <AlertIcon />
          请先登录
        </Alert>
      </Box>
    );
  }

  if (!isRootUser) {
    return (
      <Box p={8}>
        <Alert status="error">
          <AlertIcon />
          <Box>
            <Text fontWeight="bold">权限不足</Text>
            <Text>只有root用户可以访问权限管理页面</Text>
          </Box>
        </Alert>
      </Box>
    );
  }

  return (
    <Box p={8} maxW="1400px" mx="auto">
      <VStack spacing={6} align="stretch">
        <Card>
          <CardHeader>
            <Heading size="lg">权限管理</Heading>
            <Text color="gray.600" mt={2}>
              管理系统中所有资源的权限分配
            </Text>
          </CardHeader>
        </Card>

        <Card>
          <CardBody>
            <HStack spacing={4} mb={6}>
              <InputGroup maxW="300px">
                <InputLeftElement pointerEvents="none">
                  <SearchIcon color="gray.300" />
                </InputLeftElement>
                <Input
                  placeholder="搜索资源名称或用户名"
                  value={searchKey}
                  onChange={(e) => setSearchKey(e.target.value)}
                />
              </InputGroup>

              <Select
                placeholder="所有资源类型"
                maxW="200px"
                value={resourceTypeFilter}
                onChange={(e) => setResourceTypeFilter(e.target.value)}
              >
                <option value="app">应用</option>
                <option value="dataset">数据集</option>
                <option value="plugin">插件</option>
              </Select>

              <Button colorScheme="blue" onClick={fetchPermissions} isLoading={loading}>
                刷新
              </Button>
            </HStack>

            {loading ? (
              <Flex justify="center" align="center" h="200px">
                <Spinner size="lg" />
                <Text ml={4}>加载权限数据...</Text>
              </Flex>
            ) : (
              <Box overflowX="auto">
                <Table variant="simple">
                  <Thead>
                    <Tr>
                      <Th>资源类型</Th>
                      <Th>资源名称</Th>
                      <Th>团队</Th>
                      <Th>授权对象</Th>
                      <Th>权限</Th>
                      <Th>创建时间</Th>
                      <Th>操作</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {permissions.map((perm) => (
                      <Tr key={perm._id}>
                        <Td>
                          <Badge colorScheme="blue">
                            {perm.resourceType === 'app'
                              ? '应用'
                              : perm.resourceType === 'dataset'
                                ? '数据集'
                                : perm.resourceType === 'plugin'
                                  ? '插件'
                                  : perm.resourceType}
                          </Badge>
                        </Td>
                        <Td>
                          <Text fontWeight="medium">{perm.resourceName}</Text>
                          <Text fontSize="xs" color="gray.500">
                            {perm.resourceId}
                          </Text>
                        </Td>
                        <Td>
                          <Text>{perm.teamName}</Text>
                        </Td>
                        <Td>
                          {perm.memberName && (
                            <Badge colorScheme="green">用户: {perm.memberName}</Badge>
                          )}
                          {perm.groupName && (
                            <Badge colorScheme="orange">组: {perm.groupName}</Badge>
                          )}
                          {perm.orgName && <Badge colorScheme="purple">组织: {perm.orgName}</Badge>}
                        </Td>
                        <Td>
                          <Badge colorScheme={getPermissionColor(perm.permission)}>
                            {getPermissionText(perm.permission)}
                          </Badge>
                        </Td>
                        <Td>
                          <Text fontSize="sm">{new Date(perm.createTime).toLocaleString()}</Text>
                        </Td>
                        <Td>
                          <HStack spacing={2}>
                            <Button size="xs" colorScheme="blue">
                              编辑
                            </Button>
                            <Button size="xs" colorScheme="red" variant="outline">
                              删除
                            </Button>
                          </HStack>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>

                {permissions.length === 0 && !loading && (
                  <Box textAlign="center" py={8}>
                    <Text color="gray.500">暂无权限记录</Text>
                  </Box>
                )}
              </Box>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Text fontSize="sm" color="gray.600">
              <strong>权限说明：</strong>
              <br />• 读取权限(4)：可以查看资源
              <br />• 写入权限(6)：可以查看和编辑资源
              <br />• 管理权限(7)：可以查看、编辑和管理资源权限
              <br />• Root用户拥有所有资源的完整权限
            </Text>
          </CardBody>
        </Card>
      </VStack>
    </Box>
  );
};

export async function getServerSideProps(context: any) {
  return {
    props: {
      ...(await serviceSideProps(context, ['common']))
    }
  };
}

export default PermissionManagement;
