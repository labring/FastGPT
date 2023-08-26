import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { Chat, ChatItem, connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import type { PagingData } from '@/types';
import { AppLogsListItemType } from '@/types/app';
import { Types } from 'mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const {
      pageNum = 1,
      pageSize = 20,
      appId
    } = req.body as { pageNum: number; pageSize: number; appId: string };

    if (!appId) {
      throw new Error('缺少参数');
    }
    await connectToDatabase();

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    const where = {
      appId: new Types.ObjectId(appId),
      userId: new Types.ObjectId(userId)
    };

    const [data, total] = await Promise.all([
      Chat.aggregate([
        { $match: where },
        { $sort: { updateTime: -1 } },
        { $skip: (pageNum - 1) * pageSize },
        { $limit: pageSize },
        {
          $lookup: {
            from: 'chatitems',
            localField: 'chatId',
            foreignField: 'chatId',
            as: 'messageCount'
          }
        },
        {
          $project: {
            id: '$chatId',
            title: 1,
            source: 1,
            time: '$updateTime',
            messageCount: { $size: '$messageCount' },
            callbackCount: { $literal: 0 }
          }
        }
      ]),
      Chat.countDocuments(where)
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
