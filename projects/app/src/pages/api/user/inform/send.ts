// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';
import { startSendInform } from '@/service/events/sendInform';
import { MongoUserInform } from '@fastgpt/service/support/user/inform/schema';
import { InformTypeEnum } from '@fastgpt/global/support/user/constant';
import {
  sendInform2AllUser,
  sendInform2OneUser
} from '@fastgpt/service/support/user/inform/controller';

export type Props = {
  type: `${InformTypeEnum}`;
  title: string;
  content: string;
  userId?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authUser({ req, authRoot: true });

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
      global.sendInformQueue.push(async () => sendInform2OneUser({ type, title, content, userId }));
      startSendInform();
      return;
    }

    // send to all user
    sendInform2AllUser({ type, title, content });
  } catch (error) {
    console.log('send inform error', error);
  }
}
