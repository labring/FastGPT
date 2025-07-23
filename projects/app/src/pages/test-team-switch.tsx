import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  VStack,
  HStack,
  Text,
  Badge,
  useToast,
  Spinner,
  Alert,
  AlertIcon,
  Code,
  Divider
} from '@chakra-ui/react';
// import { switchTeamCustom } from '@/web/support/user/admin/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRouter } from 'next/router';

interface TeamInfo {
  teamId: string;
  teamName: string;
  teamAvatar: string;
  role: string;
  status: string;
  isOwner: boolean;
  memberCount: number;
  appCount: number;
  createTime: Date;
}

const TestTeamSwitch: React.FC = () => {
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const { userInfo } = useUserStore();
  const router = useRouter();
  const toast = useToast();

  const fetchTeams = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/proApi/support/user/team/list');
      const data = await response.json();
      console.log('Teams response:', data);

      if (data.code === 200) {
        setTeams(data.data || []);
        setCurrentTeamId(data.data?.[0]?.teamId || null);
      } else {
        throw new Error(data.message || 'Failed to fetch teams');
      }
    } catch (error: any) {
      console.error('Failed to fetch teams:', error);
      toast({
        title: '获取团队列表失败',
        description: error.message,
        status: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchTeam = async (teamId: string, teamName: string) => {
    if (teamId === currentTeamId) {
      return;
    }

    console.log('Switching to team:', teamId, teamName);

    try {
      setSwitching(teamId);

      const response = await fetch('/api/proApi/support/user/team/switch', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ teamId })
      });

      const data = await response.json();
      console.log('Switch team response:', data);

      if (data.code === 200) {
        toast({
          title: '团队切换成功',
          description: `已切换到团队：${teamName}`,
          status: 'success',
          duration: 3000
        });
      } else {
        throw new Error(data.message || 'Switch failed');
      }

      setCurrentTeamId(teamId);

      // 延迟刷新页面
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error: any) {
      console.error('Failed to switch team:', error);

      toast({
        title: '团队切换失败',
        description: error.message || '未知错误',
        status: 'error',
        duration: 5000
      });
    } finally {
      setSwitching(null);
    }
  };

  const testDebugAPI = async () => {
    try {
      const response = await fetch('/api/test/team-switch-debug');
      const data = await response.json();
      console.log('Team switch debug response:', data);

      if (data.code === 200) {
        toast({
          title: '团队切换调试信息获取成功',
          description: '请查看控制台获取详细信息',
          status: 'success'
        });
      } else {
        toast({
          title: '团队切换调试信息获取失败',
          description: data.message,
          status: 'error'
        });
      }
    } catch (error) {
      console.error('Team switch debug API error:', error);
      toast({
        title: '团队切换调试API出错',
        description: String(error),
        status: 'error'
      });
    }
  };

  const testSessionDebugAPI = async () => {
    try {
      const response = await fetch('/api/test/session-debug');
      const data = await response.json();
      console.log('Session debug response:', data);

      if (data.code === 200) {
        const summary = data.data.summary;
        const allMatch = summary.allMatch;

        toast({
          title: allMatch ? 'Session状态正常' : 'Session状态异常',
          description: `Session团队ID: ${summary.sessionTeamId}\n认证团队ID: ${summary.authTeamId}\n数据库团队ID: ${summary.dbTeamId}`,
          status: allMatch ? 'success' : 'warning',
          duration: 8000
        });
      } else {
        toast({
          title: 'Session调试信息获取失败',
          description: data.message,
          status: 'error'
        });
      }
    } catch (error) {
      console.error('Session debug API error:', error);
      toast({
        title: 'Session调试API出错',
        description: String(error),
        status: 'error'
      });
    }
  };

  const testAppListDebugAPI = async () => {
    try {
      const response = await fetch('/api/test/app-list-debug');
      const data = await response.json();
      console.log('App list debug response:', data);

      if (data.code === 200) {
        const summary = data.data.summary;

        toast({
          title: '应用列表调试信息',
          description: `当前团队: ${summary.currentTeamId}\n团队应用数: ${summary.teamAppCount}\n用户应用数: ${summary.userAppCount}\n总应用数: ${summary.totalAppCount}`,
          status: summary.teamAppCount > 0 ? 'success' : 'warning',
          duration: 8000
        });
      } else {
        toast({
          title: '应用列表调试信息获取失败',
          description: data.message,
          status: 'error'
        });
      }
    } catch (error) {
      console.error('App list debug API error:', error);
      toast({
        title: '应用列表调试API出错',
        description: String(error),
        status: 'error'
      });
    }
  };

  const createTestApp = async () => {
    try {
      const response = await fetch('/api/test/create-test-app', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          appName: '团队切换测试应用'
        })
      });

      const data = await response.json();
      console.log('Create test app response:', data);

      if (data.code === 200) {
        toast({
          title: '测试应用创建成功',
          description: `应用名称: ${data.data.app.name}\n应用ID: ${data.data.app._id}`,
          status: 'success',
          duration: 5000
        });

        // 刷新团队列表以更新应用数量
        await fetchTeams();
      } else {
        toast({
          title: '测试应用创建失败',
          description: data.message,
          status: 'error'
        });
      }
    } catch (error) {
      console.error('Create test app error:', error);
      toast({
        title: '创建测试应用出错',
        description: String(error),
        status: 'error'
      });
    }
  };

  const testPermissionCheck = async () => {
    try {
      const response = await fetch('/api/test/permission-check');
      const data = await response.json();
      console.log('Permission check response:', data);

      if (data.code === 200) {
        const summary = data.data.summary;
        const currentUser = data.data.currentUser;

        toast({
          title: '权限检查结果',
          description: `${summary.message}\n${summary.rootUserStatus}\n用户: ${currentUser.username}`,
          status: summary.appDefaultHasRead ? 'success' : 'warning',
          duration: 8000
        });

        // 如果是root用户，显示权限管理链接
        if (currentUser.canManagePermissions) {
          console.log('Root user detected, can access permission management');
        }
      } else {
        toast({
          title: '权限检查失败',
          description: data.message,
          status: 'error'
        });
      }
    } catch (error) {
      console.error('Permission check error:', error);
      toast({
        title: '权限检查出错',
        description: String(error),
        status: 'error'
      });
    }
  };

  const testPermissionManagement = async () => {
    try {
      const response = await fetch('/api/admin/permissions/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          searchKey: '',
          resourceType: 'app'
        })
      });

      const data = await response.json();
      console.log('Permission management response:', data);

      if (data.code === 200) {
        const permissions = data.data.permissions;

        toast({
          title: '权限管理测试成功',
          description: `找到 ${permissions.length} 条权限记录`,
          status: 'success',
          duration: 5000
        });
      } else {
        toast({
          title: '权限管理测试失败',
          description: data.message,
          status: 'error'
        });
      }
    } catch (error) {
      console.error('Permission management test error:', error);
      toast({
        title: '权限管理测试出错',
        description: String(error),
        status: 'error'
      });
    }
  };

  const testActualAppListAPI = async () => {
    try {
      const response = await fetch('/api/test/app-list-actual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      const data = await response.json();
      console.log('Actual app list response:', data);

      if (data.code === 200) {
        const debug = data.data.debug;
        const apps = data.data.apps;

        toast({
          title: '实际应用列表调试',
          description: `查询到: ${debug.rawApps}个应用\n权限过滤后: ${debug.filteredApps}个\n最终返回: ${debug.finalApps}个`,
          status: debug.finalApps > 0 ? 'success' : 'warning',
          duration: 8000
        });

        // 显示应用详情
        if (apps && apps.length > 0) {
          console.log(
            'Apps returned:',
            apps.map((app: any) => ({
              name: app.name,
              tmbId: app.tmbId,
              permission: app.permission?.value,
              hasReadPer: app.permission?.hasReadPer
            }))
          );
        }
      } else {
        toast({
          title: '实际应用列表调试失败',
          description: data.message,
          status: 'error'
        });
      }
    } catch (error) {
      console.error('Actual app list debug error:', error);
      toast({
        title: '实际应用列表调试出错',
        description: String(error),
        status: 'error'
      });
    }
  };

  useEffect(() => {
    if (userInfo) {
      fetchTeams();
    }
  }, [userInfo]);

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

  return (
    <Box p={8} maxW="800px" mx="auto">
      <VStack spacing={6} align="stretch">
        <Box>
          <Text fontSize="2xl" fontWeight="bold" mb={4}>
            团队切换测试页面
          </Text>

          <Alert status="info" mb={4}>
            <AlertIcon />
            <Box>
              <Text fontSize="sm">
                当前用户: <Badge colorScheme="blue">{userInfo.username}</Badge>
              </Text>
              <Text fontSize="sm" mt={1}>
                当前团队: <Badge colorScheme="green">{userInfo.team?.teamName || '未知'}</Badge>
              </Text>
            </Box>
          </Alert>
        </Box>

        <HStack wrap="wrap" spacing={2}>
          <Button colorScheme="blue" onClick={fetchTeams} isLoading={loading}>
            刷新团队列表
          </Button>
          <Button colorScheme="purple" onClick={testDebugAPI}>
            团队调试
          </Button>
          <Button colorScheme="orange" onClick={testSessionDebugAPI}>
            Session调试
          </Button>
          <Button colorScheme="green" onClick={testAppListDebugAPI}>
            应用调试
          </Button>
          <Button colorScheme="red" onClick={testActualAppListAPI}>
            实际应用API
          </Button>
          <Button colorScheme="pink" onClick={testPermissionCheck}>
            权限检查
          </Button>
          <Button colorScheme="cyan" onClick={testPermissionManagement}>
            权限管理测试
          </Button>
          <Button colorScheme="teal" onClick={createTestApp}>
            创建测试应用
          </Button>
          <Button colorScheme="gray" onClick={() => router.push('/dashboard/apps')}>
            返回应用列表
          </Button>
        </HStack>

        <Divider />

        <Box>
          <Text fontSize="lg" fontWeight="semibold" mb={3}>
            我的团队 ({teams.length})
          </Text>

          {loading ? (
            <Box display="flex" alignItems="center" justifyContent="center" p={4}>
              <Spinner size="lg" />
              <Text ml={3}>加载团队列表...</Text>
            </Box>
          ) : teams.length === 0 ? (
            <Alert status="warning">
              <AlertIcon />
              暂无团队
            </Alert>
          ) : (
            <VStack spacing={3} align="stretch">
              {teams.map((team) => (
                <Box
                  key={team.teamId}
                  p={4}
                  border="1px solid"
                  borderColor={team.teamId === currentTeamId ? 'blue.300' : 'gray.200'}
                  borderRadius="md"
                  bg={team.teamId === currentTeamId ? 'blue.50' : 'white'}
                >
                  <HStack justify="space-between" align="center">
                    <VStack align="start" spacing={1}>
                      <HStack>
                        <Text fontWeight="medium">{team.teamName}</Text>
                        {team.teamId === currentTeamId && (
                          <Badge colorScheme="blue" size="sm">
                            当前
                          </Badge>
                        )}
                      </HStack>
                      <HStack spacing={2}>
                        <Badge colorScheme={getRoleColor(team.role, team.isOwner)} size="sm">
                          {getRoleText(team.role, team.isOwner)}
                        </Badge>
                        <Text fontSize="xs" color="gray.500">
                          {team.memberCount}人
                        </Text>
                        <Text fontSize="xs" color={team.appCount > 0 ? 'blue.500' : 'gray.400'}>
                          {team.appCount}个应用
                        </Text>
                      </HStack>
                      <Code fontSize="xs" color="gray.500">
                        ID: {team.teamId}
                      </Code>
                    </VStack>

                    <Button
                      size="sm"
                      colorScheme={team.teamId === currentTeamId ? 'gray' : 'blue'}
                      isDisabled={team.teamId === currentTeamId}
                      isLoading={switching === team.teamId}
                      loadingText="切换中..."
                      onClick={() => handleSwitchTeam(team.teamId, team.teamName)}
                    >
                      {team.teamId === currentTeamId ? '当前团队' : '切换'}
                    </Button>
                  </HStack>
                </Box>
              ))}
            </VStack>
          )}
        </Box>
      </VStack>
    </Box>
  );
};

export default TestTeamSwitch;
