import { GET, POST, PUT, DELETE } from '@/web/common/api/request';
import type { GetUserListQuery, UserListItemType } from '@/pages/api/support/user/admin/list';
import type { CreateUserBody } from '@/pages/api/support/user/admin/create';
import type { UpdateUserBody } from '@/pages/api/support/user/admin/update';
import type { DeleteUserBody } from '@/pages/api/support/user/admin/delete';
import type { UserStatsResponse } from '@/pages/api/support/user/admin/stats';
import type { PaginationResponse } from '@fastgpt/web/common/fetch/type';

// 获取用户列表
export const getUserList = (params: GetUserListQuery) =>
  GET<PaginationResponse<UserListItemType>>('/support/user/admin/list', params);

// 获取用户列表（适配 usePagination hook）
export const getUserListForPagination = async (params: any) => {
  const { pageNum, pageSize, ...otherParams } = params;

  const response = await getUserList({
    current: pageNum,
    pageSize,
    ...otherParams
  });

  // 确保返回格式符合 usePagination 的期望
  // usePagination 期望返回 { list: Array, total: number }
  // 检查响应格式：可能是 {data: {list, total}} 或直接是 {list, total}
  let result;
  const responseAny = response as any;
  if (responseAny.data) {
    // 格式：{data: {list, total}}
    result = {
      list: responseAny.data.list || [],
      total: responseAny.data.total || 0
    };
  } else if (responseAny.list !== undefined) {
    // 格式：{list, total}
    result = {
      list: responseAny.list || [],
      total: responseAny.total || 0
    };
  } else {
    // 兜底：空数据
    result = {
      list: [],
      total: 0
    };
  }

  return result;
};

// 创建用户
export const createUser = (data: CreateUserBody) =>
  POST<{ userId: string; username: string; status: string }>('/support/user/admin/create', data);

// 更新用户
export const updateUser = (data: UpdateUserBody) =>
  PUT<{ user: any; teams: any[] }>('/support/user/admin/update', data);

// 删除用户
export const deleteUsers = (data: DeleteUserBody) =>
  POST<{
    deletedUsers: string[];
    errors: { userId: string; error: string }[];
    success: number;
    failed: number;
  }>('/support/user/admin/delete', data);

// 获取用户统计
export const getUserStats = () => GET<UserStatsResponse>('/support/user/admin/stats');

// 批量更新用户状态
export const batchUpdateUserStatus = (data: { userIds: string[]; status: string }) =>
  PUT<{ success: number; failed: number }>('/support/user/admin/batchUpdateStatus', data);

// 重置用户密码
export const resetUserPassword = (data: { userId: string; newPassword: string }) =>
  PUT<{ success: boolean }>('/support/user/admin/resetPassword', data);

// 获取用户详情
export const getUserDetail = (userId: string) =>
  GET<{
    user: any;
    teams: any[];
    apps: any[];
    datasets: any[];
    loginHistory: any[];
  }>(`/support/user/admin/detail?userId=${userId}`);

// 导出用户数据
export const exportUsers = (params: {
  searchKey?: string;
  status?: string;
  teamId?: string;
  format?: 'csv' | 'excel';
}) => GET<{ downloadUrl: string }>('/support/user/admin/export', params);

// 获取团队列表（用于用户管理中的团队选择）
export const getTeamListForAdmin = () =>
  GET<{ _id: string; name: string; memberCount: number }[]>('/support/user/admin/teams');

// 团队管理相关API
export const getUserTeamInfo = (userId: string) =>
  GET<{
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
  }>(`/support/user/admin/team-management?userId=${userId}`);

export const manageUserTeam = (data: {
  userId: string;
  action: 'add' | 'remove' | 'updateRole';
  teamId?: string;
  role?: string;
}) => POST<{ message: string }>('/support/user/admin/team-management', data);

export const getAllTeams = (params?: { search?: string; limit?: number }) =>
  GET<
    Array<{
      _id: string;
      name: string;
      ownerId: string;
      ownerName: string;
      createTime: Date;
      memberCount: number;
    }>
  >('/support/user/admin/teams', params).then((response) => ({
    teams: response,
    total: response.length
  }));

export const getTeamApps = (teamId: string) =>
  GET<{
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
  }>(`/support/user/admin/team-apps?teamId=${teamId}`);
