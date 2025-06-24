import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEvaluation } from '@fastgpt/service/core/app/evaluation/evalSchema';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { Types } from '@fastgpt/service/common/mongo';
import { getAccessibleAppIds } from '@fastgpt/service/core/app/evaluation/utils';

export type listEvaluationsQuery = {};

export type listEvaluationsBody = PaginationProps<{
  searchKey?: string;
}>;

export type listEvaluationsResponse = PaginationResponse<evaluationType>;

export type evaluationType = {
  _id: string;
  name: string;
  executorAvatar: string;
  executorName: string;
  appAvatar: string;
  appName: string;
  appId: string;
  createTime: Date;
  finishTime?: Date;
  score: string | null;
  completedCount: number;
  errorCount: number;
  totalCount: number;
  agentModel: string;
};

const transformEvaluationData = (item: any): evaluationType => {
  const { stats = {} } = item;
  const { totalCount = 0, completedCount = 0, errorCount = 0, avgScore } = stats;

  const isCompleted = totalCount === completedCount + errorCount;
  const calculatedScore = isCompleted ? avgScore || 0 : null;

  return {
    _id: String(item._id),
    name: item.name,
    agentModel: item.agentModel,
    executorAvatar: item.teamMember?.avatar,
    executorName: item.teamMember?.name,
    appId: String(item.appId),
    appAvatar: item.app?.avatar,
    appName: item.app?.name,
    createTime: item.createTime,
    finishTime: item.finishTime,
    score: calculatedScore !== null ? (calculatedScore * 100).toFixed(2) : null,
    completedCount,
    errorCount,
    totalCount
  };
};

async function handler(
  req: ApiRequestProps<listEvaluationsBody, listEvaluationsQuery>,
  res: ApiResponseType<any>
): Promise<listEvaluationsResponse> {
  const {
    tmbId,
    teamId,
    permission: teamPer
  } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  const { offset, pageSize } = parsePaginationRequest(req);
  const { searchKey } = req.body;

  const accessibleAppIds = await getAccessibleAppIds(teamId, tmbId, teamPer);

  const match = {
    teamId: new Types.ObjectId(teamId),
    ...(searchKey && { name: { $regex: searchKey, $options: 'i' } }),
    ...(accessibleAppIds && { appId: { $in: accessibleAppIds } })
  };

  const [evaluations, total] = await Promise.all([
    MongoEvaluation.aggregate(buildPipeline(match, offset, pageSize)),
    MongoEvaluation.countDocuments(match)
  ]);

  const evaluationList = evaluations.map(transformEvaluationData);

  return {
    total,
    list: evaluationList
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
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$status', 2] },
                      {
                        $or: [
                          { $eq: ['$errorMessage', null] },
                          { $eq: [{ $type: '$errorMessage' }, 'missing'] }
                        ]
                      }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            errorCount: {
              $sum: {
                $cond: [{ $and: [{ $eq: ['$retry', 0] }, { $ne: ['$errorMessage', null] }] }, 1, 0]
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
