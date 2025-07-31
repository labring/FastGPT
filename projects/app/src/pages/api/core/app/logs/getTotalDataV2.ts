import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { Types } from 'mongoose';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';

export type getTotalDataV2Query = {
  appId: string;
};

export type getTotalDataV2Body = {};

export type getTotalDataV2Response = {
  totalUsers: number;
  totalChat: number;
  totalPoints: number;
};

async function handler(
  req: ApiRequestProps<getTotalDataV2Body, getTotalDataV2Query>,
  res: ApiResponseType<any>
): Promise<getTotalDataV2Response> {
  const { appId } = req.query;

  const { teamId } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  const where = {
    teamId: new Types.ObjectId(teamId),
    appId: new Types.ObjectId(appId)
  };

  const [userStats, chatStats] = await Promise.all([
    MongoAppChatLog.distinct('userId', where).then((users) => users.length),
    MongoAppChatLog.aggregate(
      [
        { $match: where },
        {
          $group: {
            _id: null,
            totalChat: { $sum: '$chatItemCount' },
            totalPoints: { $sum: '$totalPoints' }
          }
        }
      ],
      {
        ...readFromSecondary,
        allowDiskUse: true
      }
    )
  ]);

  if (!chatStats || chatStats.length === 0) {
    return {
      totalUsers: userStats || 0,
      totalChat: 0,
      totalPoints: 0
    };
  }

  const { totalChat, totalPoints } = chatStats[0];

  return {
    totalUsers: userStats || 0,
    totalChat: totalChat || 0,
    totalPoints: totalPoints || 0
  };
}

export default NextAPI(handler);
