import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Chat } from '@/service/mongo';
import { authToken } from '@/service/utils/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId, index } = req.query as { chatId: string; index: string };
    const { authorization } = req.headers;

    if (!authorization) {
      throw new Error('无权操作');
    }
    if (!chatId || !index) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    // 凭证校验
    const userId = await authToken(authorization);

    const chatRecord = await Chat.findById(chatId);

    if (!chatRecord) {
      throw new Error('找不到对话');
    }

    // 重新计算 index，跳过已经被删除的内容
    let unDeleteIndex = +index;
    let deletedIndex = 0;
    for (deletedIndex = 0; deletedIndex < chatRecord.content.length; deletedIndex++) {
      if (!chatRecord.content[deletedIndex].deleted) {
        unDeleteIndex--;
        if (unDeleteIndex < 0) {
          break;
        }
      }
    }

    // 删除最一条数据库记录, 也就是预发送的那一条
    await Chat.updateOne(
      {
        _id: chatId,
        userId
      },
      {
        $set: {
          [`content.${deletedIndex}.deleted`]: true,
          updateTime: Date.now()
        }
      }
    );

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
