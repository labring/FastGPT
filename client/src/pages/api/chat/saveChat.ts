import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { ChatItemType } from '@/types/chat';
import { connectToDatabase, Chat, App } from '@/service/mongo';
import { authApp } from '@/service/utils/auth';
import { authUser } from '@/service/utils/auth';
import { Types } from 'mongoose';

type Props = {
  historyId?: string;
  appId: string;
  variables?: Record<string, any>;
  prompts: [ChatItemType, ChatItemType];
};

/* 聊天内容存存储 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { historyId, appId, prompts } = req.body as Props;

    if (!prompts) {
      throw new Error('缺少参数');
    }

    const { userId } = await authUser({ req, authToken: true });

    const response = await saveChat({
      historyId,
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
  newHistoryId,
  historyId,
  appId,
  prompts,
  variables,
  userId
}: Props & { newHistoryId?: Types.ObjectId; userId: string }): Promise<{ newHistoryId: string }> {
  await connectToDatabase();
  const { app } = await authApp({ appId, userId, authOwner: false });

  const content = prompts.map((item) => ({
    _id: item._id,
    obj: item.obj,
    value: item.value,
    systemPrompt: item.systemPrompt || '',
    quote: item.quote || []
  }));

  if (String(app.userId) === userId) {
    await App.findByIdAndUpdate(appId, {
      updateTime: new Date()
    });
  }

  const [response] = await Promise.all([
    ...(historyId
      ? [
          Chat.findByIdAndUpdate(historyId, {
            $push: {
              content: {
                $each: content
              }
            },
            variables,
            title: content[0].value.slice(0, 20),
            latestChat: content[1].value,
            updateTime: new Date()
          }).then(() => ({
            newHistoryId: ''
          }))
        ]
      : [
          Chat.create({
            _id: newHistoryId,
            userId,
            appId,
            variables,
            content,
            title: content[0].value.slice(0, 20),
            latestChat: content[1].value
          }).then((res) => ({
            newHistoryId: String(res._id)
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
    newHistoryId: response?.newHistoryId || ''
  };
}
