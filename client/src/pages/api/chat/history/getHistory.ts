import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import type { ChatHistoryItemType } from '@/types/chat';
import { ChatSourceEnum } from '@/constants/chat';

/* 获取历史记录 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { appId } = req.body as { appId?: string };
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const data = await Chat.find(
      {
        userId,
        source: ChatSourceEnum.online,
        ...(appId && { appId })
      },
      'chatId title top customTitle appId updateTime'
    )
      .sort({ top: -1, updateTime: -1 })
      .limit(20);

    jsonRes<ChatHistoryItemType[]>(res, {
      data: data.map((item) => ({
        chatId: item.chatId,
        updateTime: item.updateTime,
        appId: item.appId,
        customTitle: item.customTitle,
        title: item.title,
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
