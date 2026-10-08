import { getTeamMembers } from './api';
import type { TeamMemberItemType } from '@fastgpt/global/support/user/team/type';

/**
 * 分页读取成员编辑所需的完整列表，只在数量一致且成员 ID 不重复时返回。
 * 发现分页期间总数变化、缺页或重复数据时拒绝建立编辑草稿，避免覆盖保存误删成员。
 * 调用方关闭弹窗或切换资源时可中止请求；失败后重试必须重新读取完整列表。
 */
export const getAllTeamMembers = async (
  params: Pick<
    Parameters<typeof getTeamMembers>[0],
    'groupId' | 'orgId' | 'withOrgs' | 'withPermission'
  >,
  controller: AbortController
) => {
  const members: TeamMemberItemType[] = [];
  const memberIds = new Set<string>();
  let total: number | undefined;

  while (true) {
    controller.signal.throwIfAborted();
    const response = await getTeamMembers(
      { ...params, pageSize: 1000, offset: members.length },
      controller
    );
    controller.signal.throwIfAborted();

    if (
      !Number.isInteger(response.total) ||
      response.total < 0 ||
      (total !== undefined && total !== response.total)
    ) {
      throw new Error('common:core.chat.error.data_error');
    }
    total = response.total;

    for (const member of response.list) {
      if (memberIds.has(member.tmbId)) {
        throw new Error('common:core.chat.error.data_error');
      }
      memberIds.add(member.tmbId);
      members.push(member);
    }

    if (members.length === total) return members;
    if (members.length > total || response.list.length === 0) {
      throw new Error('common:core.chat.error.data_error');
    }
  }
};
