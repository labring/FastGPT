import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { Types } from 'mongoose';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';

export type getTotalDataQuery = {
  appId: string;
};

export type getTotalDataBody = {};

export type getTotalDataResponse = {
  totalUsers: number;
  totalChat: number;
  totalPoints: number;
};

async function handler(
  req: ApiRequestProps<getTotalDataBody, getTotalDataQuery>,
  res: ApiResponseType<any>
): Promise<getTotalDataResponse> {
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

  const [userStats, chatStats, pointsStats] = await Promise.all([
    MongoChat.aggregate([
      { $match: where },
      {
        $group: {
          _id: {
            $ifNull: [
              {
                $cond: [{ $ne: ['$outLinkUid', ''] }, '$outLinkUid', null]
              },
              '$tmbId'
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 }
        }
      }
    ]),
    MongoChatItem.aggregate([
      { $match: where },
      {
        $group: {
          _id: null,
          totalChat: {
            $sum: {
              $cond: [{ $eq: ['$obj', 'AI'] }, 1, 0]
            }
          }
        }
      }
    ]),
    MongoChatItem.aggregate([
      {
        $match: {
          appId: new Types.ObjectId(appId)
        }
      },
      {
        $group: {
          _id: null,
          totalPoints: {
            $sum: {
              $reduce: {
                input: { $ifNull: ['$responseData', []] },
                initialValue: 0,
                in: {
                  $add: ['$$value', { $ifNull: ['$$this.totalPoints', 0] }]
                }
              }
            }
          }
        }
      }
    ])
  ]);

  const totalUsers = userStats.length > 0 ? userStats[0].totalUsers : 0;
  const totalChat = chatStats.length > 0 ? chatStats[0].totalChat : 0;
  const totalPoints = pointsStats.length > 0 ? pointsStats[0].totalPoints : 0;

  return {
    totalUsers,
    totalChat,
    totalPoints
  };
}

export default NextAPI(handler);
