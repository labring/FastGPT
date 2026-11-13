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
import { normalizePagination } from '@fastgpt/service/common/api/pagination';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

/**
 * 供系统超级管理员（root）在全局团队切换器中分页检索全站可用团队。
 * 无搜索词时通过确定性排序将当前所处团队置顶，保证跨页滚动时不丢项、不重项且回显准确。
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
  const { teamId: currentTeamId } = await authSystemAdmin({ req });
  const { search } = query;
  const { offset, pageSize } = normalizePagination(query);

  // 2. 按团队名称模糊查询未软删除的全站团队，无搜索词时将当前团队排在全局首位。
  const filter = {
    $or: [{ deleteTime: { $exists: false } }, { deleteTime: null }],
    ...(search ? { name: { $regex: new RegExp(replaceRegChars(search), 'i') } } : {})
  };
  const currentTeamObjectId =
    !search && currentTeamId && Types.ObjectId.isValid(currentTeamId)
      ? new Types.ObjectId(currentTeamId)
      : null;

  const [teams, total] = await Promise.all([
    currentTeamObjectId
      ? MongoTeam.aggregate<{ _id: Types.ObjectId; name: string; avatar?: string }>([
          { $match: filter },
          {
            $addFields: {
              isCurrentTeam: { $cond: [{ $eq: ['$_id', currentTeamObjectId] }, 1, 0] }
            }
          },
          { $sort: { isCurrentTeam: -1, createTime: -1, _id: -1 } },
          { $skip: offset },
          { $limit: pageSize },
          { $project: { _id: 1, name: 1, avatar: 1 } }
        ])
      : MongoTeam.find(filter, { _id: 1, name: 1, avatar: 1 })
          .sort({ createTime: -1, _id: -1 })
          .skip(offset)
          .limit(pageSize)
          .lean(),
    MongoTeam.countDocuments(filter)
  ]);

  return AdminTeamSelectorResponseSchema.parse({
    total,
    list: teams.map((team) => ({
      teamId: String(team._id),
      teamName: team.name,
      avatar: team.avatar
    }))
  });
}

export default NextAPI(handler);
