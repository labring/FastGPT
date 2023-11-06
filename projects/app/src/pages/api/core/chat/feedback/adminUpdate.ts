import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { AdminUpdateFeedbackParams } from '@fastgpt/global/core/chat/api.d';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';

/* 初始化我的聊天框，需要身份验证 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { chatItemId, datasetId, dataId, q, a } = req.body as AdminUpdateFeedbackParams;

    if (!chatItemId || !datasetId || !dataId || !q) {
      throw new Error('missing parameter');
    }

    const { userId } = await authCert({ req, authToken: true });

    await MongoChatItem.findOneAndUpdate(
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
