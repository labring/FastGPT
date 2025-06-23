import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoEvaluation } from '@fastgpt/service/core/app/evaluation/evalSchema';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { concatPer } from '@fastgpt/service/support/permission/controller';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { AppDefaultPermissionVal } from '@fastgpt/global/support/permission/app/constant';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';

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

  const [result, total] = await Promise.all([
    (async () => {
      const evaluations = await MongoEvaluation.aggregate([
        {
          $match: match
        },
        {
          $sort: {
            createTime: -1
          }
        },
        {
          $skip: offset
        },
        {
          $limit: pageSize
        },
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
              {
                $match: {
                  $expr: { $eq: ['$evalId', '$$evalId'] }
                }
              },
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
                      $cond: [
                        { $and: [{ $eq: ['$retry', 0] }, { $ne: ['$errorMessage', null] }] },
                        1,
                        0
                      ]
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
      ]);

      return evaluations;
    })(),
    MongoEvaluation.countDocuments(match)
  ]);

  const evaluationPromises = result.map(async (item) => {
    const totalCount = item.stats?.totalCount || 0;
    const completedCount = item.stats?.completedCount || 0;
    const errorCount = item.stats?.errorCount || 0;

    const calculatedScore =
      totalCount > completedCount + errorCount ? null : item.stats?.avgScore || 0;

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
  });

  const evaluationList = await Promise.all(evaluationPromises);

  return {
    total,
    list: evaluationList
  };
}

async function getAccessibleAppIds(teamId: string, tmbId: string, teamPer: any) {
  if (teamPer.isOwner) {
    return null;
  }

  const [perList, myGroupMap, myOrgSet] = await Promise.all([
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.app,
      teamId,
      resourceId: { $exists: true }
    }).lean(),
    getGroupsByTmbId({ tmbId, teamId }).then((groups) => {
      const map = new Map<string, 1>();
      groups.forEach((group) => map.set(String(group._id), 1));
      return map;
    }),
    getOrgIdSetWithParentByTmbId({ teamId, tmbId })
  ]);

  const myPerList = perList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );

  const idList = { _id: { $in: myPerList.map((item) => item.resourceId) } };
  const appPerQuery = { $or: [idList, { parentId: null }] };

  const myApps = await MongoApp.find(
    { ...appPerQuery, teamId },
    '_id parentId type tmbId inheritPermission'
  ).lean();

  const accessibleApps = myApps.filter((app) => {
    const getPer = (appId: string) => {
      const tmbPer = myPerList.find(
        (item) => String(item.resourceId) === appId && !!item.tmbId
      )?.permission;
      const groupPer = concatPer(
        myPerList
          .filter((item) => String(item.resourceId) === appId && (!!item.groupId || !!item.orgId))
          .map((item) => item.permission)
      );

      return new AppPermission({
        per: tmbPer ?? groupPer ?? AppDefaultPermissionVal,
        isOwner: String(app.tmbId) === String(tmbId)
      });
    };

    const Per =
      !AppFolderTypeList.includes(app.type) && app.parentId && app.inheritPermission
        ? getPer(String(app.parentId))
        : getPer(String(app._id));

    return Per.hasManagePer;
  });

  return accessibleApps.map((app) => app._id);
}

export default NextAPI(handler);
