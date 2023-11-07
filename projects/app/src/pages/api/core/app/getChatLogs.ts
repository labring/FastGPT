import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import type { PagingData } from '@/types';
import { AppLogsListItemType } from '@/types/app';
import { Types } from '@fastgpt/service/common/mongo';
import { addDays } from 'date-fns';
import type { GetAppChatLogsParams } from '@/global/core/api/appReq.d';
import { authApp } from '@fastgpt/service/support/permission/auth/app';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const {
      pageNum = 1,
      pageSize = 20,
      appId,
      dateStart = addDays(new Date(), -7),
      dateEnd = new Date()
    } = req.body as GetAppChatLogsParams;

    if (!appId) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const { teamId } = await authApp({ req, authToken: true, appId, per: 'w' });

    const where = {
      appId: new Types.ObjectId(appId),
      teamId: new Types.ObjectId(teamId),
      updateTime: {
        $gte: new Date(dateStart),
        $lte: new Date(dateEnd)
      }
    };

    const [data, total] = await Promise.all([
      MongoChat.aggregate([
        { $match: where },
        {
          $lookup: {
            from: 'chatitems',
            let: { chat_id: '$chatId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$chatId', '$$chat_id'] },
                      { $eq: ['$appId', new Types.ObjectId(appId)] }
                    ]
                  }
                }
              }
            ],
            as: 'chatitems'
          }
        },
        {
          $addFields: {
            feedbackCount: {
              $size: {
                $filter: {
                  input: '$chatitems',
                  as: 'item',
                  cond: { $ifNull: ['$$item.userFeedback', false] }
                }
              }
            },
            markCount: {
              $size: {
                $filter: {
                  input: '$chatitems',
                  as: 'item',
                  cond: { $ifNull: ['$$item.adminFeedback', false] }
                }
              }
            }
          }
        },
        { $sort: { feedbackCount: -1, updateTime: -1 } },
        { $skip: (pageNum - 1) * pageSize },
        { $limit: pageSize },
        {
          $project: {
            _id: 1,
            id: '$chatId',
            title: 1,
            source: 1,
            time: '$updateTime',
            messageCount: { $size: '$chatitems' },
            feedbackCount: 1,
            markCount: 1
          }
        }
      ]),
      MongoChat.countDocuments(where)
    ]);

    jsonRes<PagingData<AppLogsListItemType>>(res, {
      data: {
        pageNum,
        pageSize,
        data,
        total
      }
    });
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}
