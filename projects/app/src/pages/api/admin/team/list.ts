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

type TeamSelectorItemDoc = {
  _id: Types.ObjectId;
  name: string;
  avatar?: string;
};

type TeamSelectorFacetResult = {
  total: Array<{ count: number }>;
  list: TeamSelectorItemDoc[];
};

/**
 * 供系统超级管理员（root）在全局团队切换器中分页检索全站可用团队。
 * 排序优先级：自有团队（Owner）置顶 → 无搜索词时的当前所处团队 → 最近切换过的团队（lastSwitchTime 倒序）→ 其余全站团队（创建时间倒序）。
 * 各分段均在数据库内完成排序、计数与 skip/limit 切片，避免把历史访问记录全量拉入 Node.js。
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

  const baseFilter = {
    $or: [{ deleteTime: { $exists: false } }, { deleteTime: null }],
    ...(search ? { name: { $regex: new RegExp(replaceRegChars(search), 'i') } } : {})
  };
  const currentUserObjectId = new Types.ObjectId(currentUserId);
  const currentTeamObjectId =
    !search && currentTeamId && Types.ObjectId.isValid(currentTeamId)
      ? new Types.ObjectId(currentTeamId)
      : null;

  // 2. 在数据库内分页统计并查询“自有团队”分段、当前非自有团队及全站总数。
  const [[ownedFacet], currentTeamDoc, total] = await Promise.all([
    MongoTeam.aggregate<TeamSelectorFacetResult>([
      { $match: { $and: [baseFilter, { ownerId: currentUserObjectId }] } },
      {
        $lookup: {
          from: MongoTeamMember.collection.name,
          let: { teamId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$userId', currentUserObjectId] },
                    { $eq: ['$teamId', '$$teamId'] }
                  ]
                },
                status: { $ne: TeamMemberStatusEnum.leave },
                lastSwitchTime: { $exists: true, $ne: null }
              }
            },
            { $limit: 1 },
            { $project: { lastSwitchTime: 1 } }
          ],
          as: 'member'
        }
      },
      {
        $addFields: {
          isCurrent: currentTeamObjectId
            ? { $cond: [{ $eq: ['$_id', currentTeamObjectId] }, 1, 0] }
            : 0,
          lastSwitchTime: {
            $ifNull: [{ $arrayElemAt: ['$member.lastSwitchTime', 0] }, new Date(0)]
          }
        }
      },
      { $sort: { isCurrent: -1, lastSwitchTime: -1, createTime: -1, _id: -1 } },
      {
        $facet: {
          total: [{ $count: 'count' }],
          list: [
            { $skip: offset },
            { $limit: pageSize },
            { $project: { _id: 1, name: 1, avatar: 1 } }
          ]
        }
      }
    ]),
    currentTeamObjectId
      ? MongoTeam.findOne(
          {
            $and: [baseFilter, { _id: currentTeamObjectId, ownerId: { $ne: currentUserObjectId } }]
          },
          { _id: 1, name: 1, avatar: 1 }
        ).lean<TeamSelectorItemDoc | null>()
      : Promise.resolve(null),
    MongoTeam.countDocuments(baseFilter)
  ]);

  const ownedCount = ownedFacet?.total[0]?.count ?? 0;
  const ownedSlice = ownedFacet?.list ?? [];

  const currentCount = currentTeamDoc ? 1 : 0;
  const includeCurrent = Boolean(
    currentTeamDoc && offset <= ownedCount && ownedSlice.length < pageSize
  );
  const currentSlice = includeCurrent && currentTeamDoc ? [currentTeamDoc] : [];

  // 3. 当当前页未填满时，在数据库内对“最近切换过的非自有团队”分页并统计分段总数。
  const visitedLimit = pageSize - ownedSlice.length - currentSlice.length;
  const visitedSkip = Math.max(0, offset - ownedCount - currentCount);
  const [visitedFacet] =
    visitedLimit > 0
      ? await MongoTeamMember.aggregate<TeamSelectorFacetResult>([
          {
            $match: {
              userId: currentUserObjectId,
              status: { $ne: TeamMemberStatusEnum.leave },
              lastSwitchTime: { $exists: true, $ne: null },
              ...(currentTeamObjectId ? { teamId: { $ne: currentTeamObjectId } } : {})
            }
          },
          {
            $lookup: {
              from: MongoTeam.collection.name,
              localField: 'teamId',
              foreignField: '_id',
              pipeline: [
                {
                  $match: {
                    $and: [baseFilter, { ownerId: { $ne: currentUserObjectId } }]
                  }
                },
                { $project: { _id: 1, name: 1, avatar: 1, createTime: 1 } }
              ],
              as: 'team'
            }
          },
          { $unwind: '$team' },
          { $sort: { lastSwitchTime: -1, 'team.createTime': -1, 'team._id': -1 } },
          {
            $facet: {
              total: [{ $count: 'count' }],
              list: [
                { $skip: visitedSkip },
                { $limit: visitedLimit },
                { $project: { _id: '$team._id', name: '$team.name', avatar: '$team.avatar' } }
              ]
            }
          }
        ])
      : [undefined];

  const visitedCount = visitedFacet?.total[0]?.count ?? 0;
  const visitedSlice = visitedFacet?.list ?? [];

  // 4. 若仍未填满当前页，按创建时间倒序补齐剩余未切换团队（同样在数据库内完成过滤与 skip/limit）。
  const restLimit = visitedLimit - visitedSlice.length;
  const restSkip = Math.max(0, offset - ownedCount - currentCount - visitedCount);
  const restTeams =
    restLimit > 0
      ? await MongoTeam.aggregate<TeamSelectorItemDoc>([
          {
            $match: {
              $and: [
                baseFilter,
                { ownerId: { $ne: currentUserObjectId } },
                ...(currentTeamObjectId ? [{ _id: { $ne: currentTeamObjectId } }] : [])
              ]
            }
          },
          { $sort: { createTime: -1, _id: -1 } },
          {
            $lookup: {
              from: MongoTeamMember.collection.name,
              let: { teamId: '$_id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$userId', currentUserObjectId] },
                        { $eq: ['$teamId', '$$teamId'] }
                      ]
                    },
                    status: { $ne: TeamMemberStatusEnum.leave },
                    lastSwitchTime: { $exists: true, $ne: null }
                  }
                },
                { $limit: 1 },
                { $project: { _id: 1 } }
              ],
              as: 'switchedMember'
            }
          },
          { $match: { switchedMember: { $size: 0 } } },
          { $skip: restSkip },
          { $limit: restLimit },
          { $project: { _id: 1, name: 1, avatar: 1 } }
        ])
      : [];

  return AdminTeamSelectorResponseSchema.parse({
    total,
    list: [
      ...ownedSlice.map((team) => ({
        teamId: String(team._id),
        teamName: team.name,
        avatar: team.avatar,
        isOwner: true
      })),
      ...[...currentSlice, ...visitedSlice, ...restTeams].map((team) => ({
        teamId: String(team._id),
        teamName: team.name,
        avatar: team.avatar,
        isOwner: false
      }))
    ]
  });
}

export default NextAPI(handler);
