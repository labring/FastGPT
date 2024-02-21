import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ClearHistoriesProps } from '@/global/core/chat/api';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';

/* clear chat history */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { appId, shareId, outLinkUid } = req.query as ClearHistoriesProps;

    const match = await (async () => {
      if (shareId && outLinkUid) {
        const { uid } = await authOutLink({ shareId, outLinkUid });

        return {
          shareId,
          outLinkUid: uid
        };
      }
      if (appId) {
        const { tmbId } = await authCert({ req, authToken: true });

        return {
          tmbId,
          appId,
          source: ChatSourceEnum.online
        };
      }

      return Promise.reject('Param are error');
    })();

    // find chatIds
    const list = await MongoChat.find(match, 'chatId').lean();
    const idList = list.map((item) => item.chatId);

    await MongoChatItem.deleteMany({
      appId,
      chatId: { $in: idList }
    });
    await MongoChat.deleteMany({
      appId,
      chatId: { $in: idList }
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
