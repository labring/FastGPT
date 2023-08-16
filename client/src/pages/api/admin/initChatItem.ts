// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { connectToDatabase, Chat, ChatItem } from '@/service/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authUser({ req, authRoot: true });
    await connectToDatabase();

    const { limit = 1000 } = req.body as { limit: number };
    let skip = 0;
    const total = await Chat.countDocuments({
      content: { $exists: true, $not: { $size: 0 } },
      isInit: { $ne: true }
    });
    let promise = Promise.resolve();
    console.log(total);

    for (let i = 0; i < total; i += limit) {
      const skipVal = skip;
      skip += limit;
      promise = promise
        .then(() => init(limit, skipVal))
        .then(() => {
          console.log(skipVal);
        });
    }

    await promise;

    jsonRes(res, {});
  } catch (error) {
    jsonRes(res, {
      code: 500,
      error
    });
  }
}

async function init(limit: number, skip: number) {
  // 遍历 app
  const chats = await Chat.find(
    {
      content: { $exists: true, $not: { $size: 0 } },
      isInit: { $ne: true }
    },
    '_id userId appId chatId content'
  )
    .limit(limit)
    .skip(skip);

  await Promise.all(
    chats
      .map((chat) => {
        const inserts = chat.content
          .map((item) => ({
            chatId: chat.chatId,
            userId: chat.userId,
            appId: chat.appId,
            obj: item.obj,
            value: item.value,
            responseData: item.responseData
          }))
          .filter((item) => item.chatId && item.userId && item.appId && item.obj && item.value);

        return [
          Chat.findByIdAndUpdate(chat._id, {
            isInit: true
          }),
          ChatItem.insertMany(inserts)
        ];
      })
      .flat()
  );
}
