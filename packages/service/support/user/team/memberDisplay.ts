import type { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { getTeamMemberDisplayName } from '@fastgpt/global/support/user/team/memberName';
import { MongoUser } from '../schema';
import { MongoTeamMember } from './teamMemberSchema';
import type { ClientSession } from '../../../common/mongo';

export type TeamMemberDisplayIdentity = {
  tmbId: string;
  name: string;
  avatar?: string | null;
  status: TeamMemberStatusEnum;
};

/**
 * 批量解析团队成员的对外展示身份。
 * 数据库成员名仅作为内部状态读取；待补齐时回落到登录用户名，绝不返回保留值。
 */
export const getTeamMemberDisplayIdentityMap = async ({
  tmbIds,
  teamId,
  session
}: {
  tmbIds: Array<string | { toString(): string }>;
  teamId?: string;
  session?: ClientSession;
}): Promise<Map<string, TeamMemberDisplayIdentity>> => {
  const uniqueTmbIds = Array.from(new Set(tmbIds.map(String)));
  if (uniqueTmbIds.length === 0) return new Map();

  const members = await MongoTeamMember.find(
    {
      _id: { $in: uniqueTmbIds },
      ...(teamId ? { teamId } : {})
    },
    '_id userId name avatar status',
    { session }
  ).lean();
  const users = await MongoUser.find(
    { _id: { $in: members.map((member) => member.userId) } },
    '_id username',
    { session }
  ).lean();
  const usernameMap = new Map(users.map((user) => [String(user._id), user.username]));

  return new Map(
    members.map((member) => [
      String(member._id),
      {
        tmbId: String(member._id),
        name: getTeamMemberDisplayName({
          memberName: member.name?.trim(),
          username: usernameMap.get(String(member.userId))?.trim()
        }),
        avatar: member.avatar,
        status: member.status
      }
    ])
  );
};
