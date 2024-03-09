import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ClearHistoriesProps } from '@/global/core/chat/api';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { authTeamSpaceToken } from '@/service/support/permission/auth/team';

/* clear chat history */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { appId, shareId, outLinkUid, teamId, teamToken } = req.query as ClearHistoriesProps;

    let chatAppId = appId;

    const match = await (async () => {
      if (shareId && outLinkUid) {
        const { appId, uid } = await authOutLink({ shareId, outLinkUid });

        chatAppId = appId;
        return {
          shareId,
          outLinkUid: uid
        };
      }
      if (teamId && teamToken) {
        const { uid } = await authTeamSpaceToken({ teamId, teamToken });
        return {
          teamId,
          appId,
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
      appId: chatAppId,
      chatId: { $in: idList }
    });
    await MongoChat.deleteMany({
      appId: chatAppId,
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
