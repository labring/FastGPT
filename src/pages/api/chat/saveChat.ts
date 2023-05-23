import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { ChatItemType } from '@/types/chat';
import { connectToDatabase, Chat } from '@/service/mongo';
import { authModel } from '@/service/utils/auth';
import { authUser } from '@/service/utils/auth';
import mongoose from 'mongoose';

type Props = {
  newChatId?: string;
  chatId?: string;
  modelId: string;
  prompts: [ChatItemType, ChatItemType];
};

/* 聊天内容存存储 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId, modelId, prompts, newChatId } = req.body as Props;

    if (!prompts) {
      throw new Error('缺少参数');
    }

    const { userId } = await authUser({ req, authToken: true });

    const nId = await saveChat({
      chatId,
      modelId,
      prompts,
      newChatId,
      userId
    });

    jsonRes(res, {
      data: nId
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export async function saveChat({
  chatId,
  newChatId,
  modelId,
  prompts,
  userId
}: Props & { userId: string }) {
  await connectToDatabase();
  await authModel({ modelId, userId, authOwner: false });

  const content = prompts.map((item) => ({
    _id: item._id ? new mongoose.Types.ObjectId(item._id) : undefined,
    obj: item.obj,
    value: item.value,
    quote: item.quote?.map((item) => ({
      ...item,
      isEdit: false
    }))
  }));

  // 没有 chatId, 创建一个对话
  if (!chatId) {
    const { _id } = await Chat.create({
      _id: newChatId ? new mongoose.Types.ObjectId(newChatId) : undefined,
      userId,
      modelId,
      content,
      title: content[0].value.slice(0, 20),
      latestChat: content[1].value
    });
    return _id;
  } else {
    // 已经有记录，追加入库
    await Chat.findByIdAndUpdate(chatId, {
      $push: {
        content: {
          $each: content
        }
      },
      title: content[0].value.slice(0, 20),
      latestChat: content[1].value,
      updateTime: new Date()
    });
  }
}
