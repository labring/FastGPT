import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, ChatItem } from '@/service/mongo';
import type { AdminUpdateFeedbackParams } from '@/global/core/api/chatReq.d';
import { authUser } from '@fastgpt/service/support/user/auth';

/* 初始化我的聊天框，需要身份验证 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { chatItemId, datasetId, dataId, q, a } = req.body as AdminUpdateFeedbackParams;

    if (!chatItemId || !datasetId || !dataId || !q) {
      throw new Error('missing parameter');
    }

    const { userId } = await authUser({ req, authToken: true });

    await ChatItem.findOneAndUpdate(
      {
        userId,
        dataId: chatItemId
      },
      {
        adminFeedback: {
          datasetId,
          dataId,
          q,
          a
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
