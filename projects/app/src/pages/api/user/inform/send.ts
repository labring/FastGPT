// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Inform, User } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { InformTypeEnum } from '@/constants/user';
import { startSendInform } from '@/service/events/sendInform';

export type Props = {
  type: `${InformTypeEnum}`;
  title: string;
  content: string;
  userId?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await authUser({ req, authRoot: true });

    await connectToDatabase();

    jsonRes(res, {
      data: await sendInform(req.body),
      message: '发送通知成功'
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export async function sendInform({ type, title, content, userId }: Props) {
  if (!type || !title || !content) {
    return;
  }

  try {
    if (userId) {
      global.sendInformQueue.push(async () => {
        // skip it if have same inform within 5 minutes
        const inform = await Inform.findOne({
          type,
          title,
          content,
          userId,
          time: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
        });

        if (inform) return;

        await Inform.create({
          type,
          title,
          content,
          userId
        });
      });
      startSendInform();
      return;
    }

    // send to all user
    const users = await User.find({}, '_id');
    await Inform.insertMany(
      users.map(({ _id }) => ({
        type,
        title,
        content,
        userId: _id
      }))
    );
  } catch (error) {
    console.log('send inform error', error);
  }
}
