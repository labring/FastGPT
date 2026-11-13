import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import {
  AdminTeamSelectorQuerySchema,
  AdminTeamSelectorResponseSchema,
  type AdminTeamSelectorQueryType,
  type AdminTeamSelectorResponseType
} from '@fastgpt/global/openapi/admin/team/api';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { normalizePagination } from '@fastgpt/service/common/api/pagination';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

/**
 * 供系统超级管理员（root）在全局团队切换器中分页检索全站可用团队。
 * 排序优先级：自有团队（Owner）置顶 → 无搜索词时的当前所处团队 → 最近切换过的团队（lastSwitchTime 倒序）→ 其余全站团队（创建时间倒序）。
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, AdminTeamSelectorQueryType>
): Promise<AdminTeamSelectorResponseType> {
  if (req.method !== 'GET') {
    return Promise.reject(CommonErrEnum.invalidParams);
  }

  // 1. 校验 root 管理员权限并归一化分页与检索参数。
  const { query } = parseApiInput({
    req,
    querySchema: AdminTeamSelectorQuerySchema
  });
  const { userId: currentUserId, teamId: currentTeamId } = await authSystemAdmin({ req });
  const { search } = query;
  const { offset, pageSize } = normalizePagination(query);

  // 2. 先查询 root 在 team_members 中记录过最近切换时间的团队，避免对全站 teams 做全表 $lookup。
  const baseFilter = {
    $or: [{ deleteTime: { $exists: false } }, { deleteTime: null }],
    ...(search ? { name: { $regex: new RegExp(replaceRegChars(search), 'i') } } : {})
  };
  const currentUserObjectId = new Types.ObjectId(currentUserId);
  const currentTeamObjectId =
    !search && currentTeamId && Types.ObjectId.isValid(currentTeamId)
      ? new Types.ObjectId(currentTeamId)
      : null;

  const switchedMembers = await MongoTeamMember.find(
    {
      userId: currentUserObjectId,
      status: { $ne: TeamMemberStatusEnum.leave },
      lastSwitchTime: { $exists: true, $ne: null }
    },
    { teamId: 1, lastSwitchTime: 1 }
  ).lean();

  const switchTimeMap = new Map<string, number>();
  const switchedTeamIds: Types.ObjectId[] = [];
  for (const member of switchedMembers) {
    if (!member.lastSwitchTime) continue;
    switchTimeMap.set(String(member.teamId), new Date(member.lastSwitchTime).getTime());
    switchedTeamIds.push(new Types.ObjectId(String(member.teamId)));
  }

  // 3. 拉取置顶前置段（自有团队 + 最近切换团队 + 当前团队）并排序，再由剩余未切换团队按创建时间补位。
  const pinnedTeamConditions: Record<string, any>[] = [{ ownerId: currentUserObjectId }];
  if (switchedTeamIds.length > 0) {
    pinnedTeamConditions.push({ _id: { $in: switchedTeamIds } });
  }
  if (currentTeamObjectId) {
    pinnedTeamConditions.push({ _id: currentTeamObjectId });
  }

  const [pinnedTeamsRaw, total] = await Promise.all([
    MongoTeam.find(
      { $and: [baseFilter, { $or: pinnedTeamConditions }] },
      { _id: 1, name: 1, avatar: 1, ownerId: 1, createTime: 1 }
    ).lean(),
    MongoTeam.countDocuments(baseFilter)
  ]);

  const currentTeamIdStr = currentTeamObjectId ? String(currentTeamObjectId) : '';
  const pinnedTeams = [...pinnedTeamsRaw].sort((a, b) => {
    const aOwner = String(a.ownerId) === currentUserId ? 1 : 0;
    const bOwner = String(b.ownerId) === currentUserId ? 1 : 0;
    if (aOwner !== bOwner) return bOwner - aOwner;

    if (currentTeamIdStr) {
      const aCurrent = String(a._id) === currentTeamIdStr ? 1 : 0;
      const bCurrent = String(b._id) === currentTeamIdStr ? 1 : 0;
      if (aCurrent !== bCurrent) return bCurrent - aCurrent;
    }

    const aSwitch = switchTimeMap.get(String(a._id)) ?? 0;
    const bSwitch = switchTimeMap.get(String(b._id)) ?? 0;
    if (aSwitch !== bSwitch) return bSwitch - aSwitch;

    const aCreate = a.createTime ? new Date(a.createTime).getTime() : 0;
    const bCreate = b.createTime ? new Date(b.createTime).getTime() : 0;
    if (aCreate !== bCreate) return bCreate - aCreate;

    const aId = String(a._id);
    const bId = String(b._id);
    return bId > aId ? 1 : bId < aId ? -1 : 0;
  });

  const pinnedSlice = pinnedTeams.slice(offset, offset + pageSize);
  const remainingCount = pageSize - pinnedSlice.length;
  const restTeams =
    remainingCount > 0
      ? await MongoTeam.find(
          pinnedTeams.length > 0
            ? { $and: [baseFilter, { _id: { $nin: pinnedTeams.map((team) => team._id) } }] }
            : baseFilter,
          { _id: 1, name: 1, avatar: 1 }
        )
          .sort({ createTime: -1, _id: -1 })
          .skip(Math.max(0, offset - pinnedTeams.length))
          .limit(remainingCount)
          .lean()
      : [];

  return AdminTeamSelectorResponseSchema.parse({
    total,
    list: [
      ...pinnedSlice.map((team) => ({
        teamId: String(team._id),
        teamName: team.name,
        avatar: team.avatar,
        isOwner: String(team.ownerId) === currentUserId
      })),
      ...restTeams.map((team) => ({
        teamId: String(team._id),
        teamName: team.name,
        avatar: team.avatar,
        isOwner: false
      }))
    ]
  });
}

export default NextAPI(handler);
