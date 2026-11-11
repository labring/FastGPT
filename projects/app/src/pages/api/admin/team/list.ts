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
import { Types } from '@fastgpt/service/common/mongo';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

/**
 * 供系统超级管理员（root）在全局团队切换器中检索全站可用团队。
 * 无搜索词时默认确保当前所处团队包含在返回列表中，保证下拉触发器始终能准确回显当前团队。
 */
async function handler(
  req: ApiRequestProps<Record<string, never>, AdminTeamSelectorQueryType>
): Promise<AdminTeamSelectorResponseType> {
  if (req.method !== 'GET') {
    return Promise.reject(CommonErrEnum.invalidParams);
  }

  // 1. 校验 root 管理员权限与检索参数。
  const { query } = parseApiInput({
    req,
    querySchema: AdminTeamSelectorQuerySchema
  });
  const { teamId: currentTeamId } = await authSystemAdmin({ req });
  const { search, limit } = query;

  // 2. 按团队名称模糊查询未软删除的全站团队。
  const activeFilter = {
    $or: [{ deleteTime: { $exists: false } }, { deleteTime: null }]
  };
  const teams = await MongoTeam.find(
    {
      ...activeFilter,
      ...(search ? { name: { $regex: new RegExp(replaceRegChars(search), 'i') } } : {})
    },
    { _id: 1, name: 1, avatar: 1 }
  )
    .sort({ createTime: -1, _id: -1 })
    .limit(limit)
    .lean();

  // 3. 未输入搜索词且当前团队未落在前 N 条时，置顶补齐当前团队以便选择器正常展示。
  const finalTeams = await (async () => {
    if (
      search ||
      !currentTeamId ||
      !Types.ObjectId.isValid(currentTeamId) ||
      teams.some((item) => String(item._id) === String(currentTeamId))
    ) {
      return teams;
    }

    const currentTeam = await MongoTeam.findOne(
      {
        _id: new Types.ObjectId(currentTeamId),
        ...activeFilter
      },
      { _id: 1, name: 1, avatar: 1 }
    ).lean();

    return currentTeam ? [currentTeam, ...teams.slice(0, Math.max(0, limit - 1))] : teams;
  })();

  return AdminTeamSelectorResponseSchema.parse({
    list: finalTeams.map((team) => ({
      teamId: String(team._id),
      teamName: team.name,
      avatar: team.avatar
    }))
  });
}

export default NextAPI(handler);
