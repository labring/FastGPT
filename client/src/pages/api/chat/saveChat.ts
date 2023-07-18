import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { ChatItemType } from '@/types/chat';
import { connectToDatabase, Chat, App } from '@/service/mongo';
import { authApp } from '@/service/utils/auth';
import { authUser } from '@/service/utils/auth';
import { Types } from 'mongoose';

type Props = {
  chatId?: string;
  appId: string;
  variables?: Record<string, any>;
  prompts: [ChatItemType, ChatItemType];
};

/* 聊天内容存存储 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { chatId, appId, prompts } = req.body as Props;

    if (!prompts) {
      throw new Error('缺少参数');
    }

    const { userId } = await authUser({ req, authToken: true });

    const response = await saveChat({
      chatId,
      appId,
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
  appId,
  prompts,
  variables,
  userId
}: Props & { newChatId?: Types.ObjectId; userId: string }): Promise<{ newChatId: string }> {
  await connectToDatabase();
  const { app } = await authApp({ appId, userId, authOwner: false });

  if (String(app.userId) === userId) {
    await App.findByIdAndUpdate(appId, {
      updateTime: new Date()
    });
  }

  const [response] = await Promise.all([
    ...(chatId
      ? [
          Chat.findByIdAndUpdate(chatId, {
            $push: {
              content: {
                $each: prompts
              }
            },
            variables,
            title: prompts[0].value.slice(0, 20),
            updateTime: new Date()
          }).then(() => ({
            newChatId: ''
          }))
        ]
      : [
          Chat.create({
            _id: newChatId,
            userId,
            appId,
            variables,
            content: prompts,
            title: prompts[0].value.slice(0, 20)
          }).then((res) => ({
            newChatId: String(res._id)
          }))
        ]),
    // update app
    ...(String(app.userId) === userId
      ? [
          App.findByIdAndUpdate(appId, {
            updateTime: new Date()
          })
        ]
      : [])
  ]);

  return {
    // @ts-ignore
    newChatId: response?.newChatId || ''
  };
}
