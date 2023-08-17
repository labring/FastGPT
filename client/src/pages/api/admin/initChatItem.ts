// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@/service/utils/auth';
import { connectToDatabase, Chat, ChatItem } from '@/service/mongo';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 24);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authUser({ req, authRoot: true });
    await connectToDatabase();

    const { limit = 100 } = req.body as { limit: number };
    let skip = 0;

    const total = await Chat.countDocuments({
      content: { $exists: true, $not: { $size: 0 } },
      isInit: { $ne: true }
    });
    const totalChat = await Chat.aggregate([
      {
        $project: {
          contentLength: { $size: '$content' }
        }
      },
      {
        $group: {
          _id: null,
          totalLength: { $sum: '$contentLength' }
        }
      }
    ]);

    console.log('chatLen:', total, totalChat);

    let promise = Promise.resolve();

    for (let i = 0; i < total; i += limit) {
      const skipVal = skip;
      skip += limit;
      promise = promise
        .then(() => init(limit))
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

async function init(limit: number) {
  // 遍历 app
  const chats = await Chat.find(
    {
      content: { $exists: true, $not: { $size: 0 } },
      isInit: { $ne: true }
    },
    '_id userId appId chatId content'
  )
    .sort({ updateTime: -1 })
    .limit(limit);

  await Promise.all(
    chats.map(async (chat) => {
      const inserts = chat.content
        .map((item) => ({
          dataId: nanoid(),
          chatId: chat.chatId,
          userId: chat.userId,
          appId: chat.appId,
          obj: item.obj,
          value: item.value,
          responseData: item.responseData
        }))
        .filter((item) => item.chatId && item.userId && item.appId && item.obj && item.value);

      try {
        await Promise.all(inserts.map((item) => ChatItem.create(item)));
        await Chat.findByIdAndUpdate(chat._id, {
          isInit: true
        });
      } catch (error) {
        console.log(error);

        await ChatItem.deleteMany({ chatId: chat.chatId });
      }
    })
  );
}
