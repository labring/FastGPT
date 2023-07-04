import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, ShareChat } from '@/service/mongo';
import { authApp, authUser } from '@/service/utils/auth';
import type { ShareChatEditType } from '@/types/app';

/* create a shareChat */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { modelId, name, maxContext, password } = req.body as ShareChatEditType & {
      modelId: string;
    };

    await connectToDatabase();

    const { userId } = await authUser({ req, authToken: true });
    await authApp({
      appId: modelId,
      userId,
      authOwner: false
    });

    const { _id } = await ShareChat.create({
      userId,
      modelId,
      name,
      password,
      maxContext
    });

    jsonRes(res, {
      data: _id
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
