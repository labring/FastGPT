import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  ReadPermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { MongoEvaluation } from '@fastgpt/service/core/evaluation/evalSchema';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { Types } from '@fastgpt/service/common/mongo';
import type { PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type { listEvaluationsBody } from '@fastgpt/global/core/evaluation/api';
import type { EvaluationSchemaType, evaluationType } from '@fastgpt/global/core/evaluation/type';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import type { TeamMemberSchema } from '@fastgpt/global/support/user/team/type';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { MongoApp } from '@fastgpt/service/core/app/schema';

async function handler(
  req: ApiRequestProps<listEvaluationsBody, {}>,
  res: ApiResponseType<any>
): Promise<PaginationResponse<evaluationType>> {
  const {
    teamId,
    tmbId,
    permission: teamPer
  } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  const { offset, pageSize } = parsePaginationRequest(req);
  const { searchKey } = req.body;

  const [perList, myGroupMap, myOrgSet] = await Promise.all([
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.app,
      teamId,
      resourceId: {
        $exists: true
      }
    }).lean(),
    getGroupsByTmbId({
      tmbId,
      teamId
    }).then((item) => {
      const map = new Map<string, 1>();
      item.forEach((item) => {
        map.set(String(item._id), 1);
      });
      return map;
    }),
    getOrgIdSetWithParentByTmbId({
      teamId,
      tmbId
    })
  ]);
  const myPerAppIdList = perList
    .filter(
      (item) =>
        String(item.tmbId) === String(tmbId) ||
        myGroupMap.has(String(item.groupId)) ||
        myOrgSet.has(String(item.orgId))
    )
    .map((item) => new Types.ObjectId(item.resourceId));

  const myAppIds = await MongoApp.find({
    teamId: new Types.ObjectId(teamId),
    $or: [{ tmbId }, { parentId: { $in: myPerAppIdList } }]
  })
    .select('_id')
    .lean();

  const match = {
    teamId: new Types.ObjectId(teamId),
    ...(searchKey && { name: { $regex: new RegExp(`${replaceRegChars(searchKey)}`, 'i') } }),
    ...(!teamPer.isOwner && {
      appId: {
        $in: [...myPerAppIdList, ...myAppIds.map((item) => item._id)]
      }
    })
  };

  const [evaluations, total] = await Promise.all([
    MongoEvaluation.aggregate(
      buildPipeline(match, offset, pageSize)
    ) as unknown as (EvaluationSchemaType & {
      teamMember: TeamMemberSchema;
      app: AppSchema;
      stats: {
        totalCount: number;
        completedCount: number;
        errorCount: number;
        avgScore: number;
      };
    })[],
    MongoEvaluation.countDocuments(match)
  ]);

  return {
    total,
    list: evaluations.map((item) => {
      const { stats } = item;
      const { totalCount = 0, completedCount = 0, errorCount = 0, avgScore } = stats || {};

      const calculatedScore = totalCount === completedCount ? avgScore || 0 : undefined;

      return {
        name: item.name,
        appId: String(item.appId),
        createTime: item.createTime,
        finishTime: item.finishTime,
        evalModel: item.evalModel,
        errorMessage: item.errorMessage,
        score: calculatedScore,
        _id: String(item._id),
        executorAvatar: item.teamMember?.avatar,
        executorName: item.teamMember?.name,
        appAvatar: item.app?.avatar,
        appName: item.app?.name || i18nT('app:deleted'),
        completedCount,
        errorCount,
        totalCount
      };
    })
  };
}

const buildPipeline = (match: Record<string, any>, offset: number, pageSize: number) => [
  { $match: match },
  { $sort: { createTime: -1 as const } },
  { $skip: offset },
  { $limit: pageSize },
  {
    $lookup: {
      from: 'team_members',
      localField: 'tmbId',
      foreignField: '_id',
      as: 'teamMember'
    }
  },
  {
    $lookup: {
      from: 'apps',
      localField: 'appId',
      foreignField: '_id',
      as: 'app'
    }
  },
  {
    $lookup: {
      from: 'eval_items',
      let: { evalId: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$evalId', '$$evalId'] } } },
        {
          $group: {
            _id: null,
            totalCount: { $sum: 1 },
            completedCount: {
              $sum: { $cond: [{ $eq: ['$status', 2] }, 1, 0] }
            },
            errorCount: {
              $sum: {
                $cond: [{ $ifNull: ['$errorMessage', false] }, 1, 0]
              }
            },
            avgScore: {
              $avg: {
                $cond: [{ $ne: ['$score', null] }, '$score', '$$REMOVE']
              }
            }
          }
        }
      ],
      as: 'evalStats'
    }
  },
  {
    $addFields: {
      teamMember: { $arrayElemAt: ['$teamMember', 0] },
      app: { $arrayElemAt: ['$app', 0] },
      stats: { $arrayElemAt: ['$evalStats', 0] }
    }
  }
];

export default NextAPI(handler);
