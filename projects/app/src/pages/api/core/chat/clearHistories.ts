import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ClearHistoriesProps } from '@/global/core/chat/api';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { authTeamSpaceToken } from '@/service/support/permission/auth/team';
import { NextAPI } from '@/service/middleware/entry';
import { deleteChatFiles } from '@fastgpt/service/core/chat/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

/* clear chat history */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { appId, shareId, outLinkUid, teamId, teamToken } = req.query as ClearHistoriesProps;

  let chatAppId = appId!;

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
      const { tmbId } = await authCert({ req, authToken: true, authApiKey: true });

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

  await deleteChatFiles({ chatIdList: idList });

  await mongoSessionRun(async (session) => {
    await MongoChatItem.deleteMany(
      {
        appId: chatAppId,
        chatId: { $in: idList }
      },
      { session }
    );
    await MongoChat.deleteMany(
      {
        appId: chatAppId,
        chatId: { $in: idList }
      },
      { session }
    );
  });

  jsonRes(res);
}

export default NextAPI(handler);
