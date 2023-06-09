import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import type { HistoryItemType } from '@/types/chat';

/* 获取历史记录 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const data = await Chat.find(
      {
        userId
      },
      '_id title top customTitle modelId updateTime latestChat'
    )
      .sort({ top: -1, updateTime: -1 })
      .limit(20);

    jsonRes<HistoryItemType[]>(res, {
      data: data.map((item) => ({
        _id: item._id,
        updateTime: item.updateTime,
        modelId: item.modelId,
        title: item.customTitle || item.title,
        latestChat: item.latestChat,
        top: item.top
      }))
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
