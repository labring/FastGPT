import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';

/* clear chat history */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { shareId, outLinkUid, chatIds } = req.body as {
      shareId: string;
      outLinkUid: string;
      chatIds: string[];
    };

    if (!shareId || !outLinkUid) {
      throw new Error('shareId or outLinkUid is required');
    }

    const sliceIds = chatIds.slice(0, 50);

    await MongoChat.updateMany(
      {
        shareId,
        chatId: { $in: sliceIds },
        source: ChatSourceEnum.share,
        outLinkUid: { $exists: false }
      },
      {
        $set: {
          outLinkUid
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
