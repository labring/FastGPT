import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import type { ChatHistoryItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { authApp } from '@fastgpt/service/support/permission/auth/app';

/* 获取历史记录 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { appId } = req.body as { appId: string };
    const { tmbId } = await authApp({ req, authToken: true, appId, per: 'r' });

    const data = await MongoChat.find(
      {
        appId,
        tmbId,
        source: ChatSourceEnum.online
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
