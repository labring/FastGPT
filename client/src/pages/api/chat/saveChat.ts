import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { ChatItemType } from '@/types/chat';
import { connectToDatabase, Chat, Model } from '@/service/mongo';
import { authModel } from '@/service/utils/auth';
import { authUser } from '@/service/utils/auth';
import { Types } from 'mongoose';

type Props = {
  chatId?: string;
  modelId: string;
  prompts: [ChatItemType, ChatItemType];
};

/* 聊天内容存存储 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId, modelId, prompts } = req.body as Props;

    if (!prompts) {
      throw new Error('缺少参数');
    }

    const { userId } = await authUser({ req, authToken: true });

    const response = await saveChat({
      chatId,
      modelId,
      prompts,
      userId
    });

    jsonRes(res, {
      data: response
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export async function saveChat({
  newChatId,
  chatId,
  modelId,
  prompts,
  userId
}: Props & { newChatId?: Types.ObjectId; userId: string }) {
  await connectToDatabase();
  const { model } = await authModel({ modelId, userId, authOwner: false });

  const content = prompts.map((item) => ({
    _id: item._id,
    obj: item.obj,
    value: item.value,
    systemPrompt: item.systemPrompt || '',
    quote: item.quote || []
  }));

  if (String(model.userId) === userId) {
    await Model.findByIdAndUpdate(modelId, {
      updateTime: new Date()
    });
  }

  const [response] = await Promise.all([
    ...(chatId
      ? [
          Chat.findByIdAndUpdate(chatId, {
            $push: {
              content: {
                $each: content
              }
            },
            title: content[0].value.slice(0, 20),
            latestChat: content[1].value,
            updateTime: new Date()
          }).then(() => ({
            newChatId: ''
          }))
        ]
      : [
          Chat.create({
            _id: newChatId,
            userId,
            modelId,
            content,
            title: content[0].value.slice(0, 20),
            latestChat: content[1].value
          }).then((res) => ({
            newChatId: String(res._id)
          }))
        ]),
    // update model
    ...(String(model.userId) === userId
      ? [
          Model.findByIdAndUpdate(modelId, {
            updateTime: new Date()
          })
        ]
      : [])
  ]);

  return {
    ...response
  };
}
