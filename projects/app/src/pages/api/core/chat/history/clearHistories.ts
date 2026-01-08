import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ClearChatHistoriesSchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';

/* clear all chat histories of an app */
export async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { appId, shareId, outLinkUid, teamId, teamToken } = ClearChatHistoriesSchema.parse(
    req.query
  );

  const {
    teamId: chatTeamId,
    tmbId,
    uid,
    authType
  } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    ...req.query
  });

  const match = await (async () => {
    if (shareId && outLinkUid && authType === 'outLink') {
      return {
        teamId: chatTeamId,
        appId,
        outLinkUid: uid
      };
    }
    if (teamId && teamToken && authType === 'teamDomain') {
      return {
        teamId: chatTeamId,
        appId,
        outLinkUid: uid
      };
    }
    if (authType === 'token') {
      return {
        teamId: chatTeamId,
        tmbId,
        appId,
        source: ChatSourceEnum.online
      };
    }
    if (authType === 'apikey') {
      return {
        teamId: chatTeamId,
        appId,
        source: ChatSourceEnum.api
      };
    }

    return Promise.reject('Param are error');
  })();

  // find chatIds
  const list = await MongoChat.find(match, 'chatId').lean();

  await MongoChat.updateMany(
    {
      appId,
      chatId: { $in: list.map((item) => item.chatId) }
    },
    {
      $set: {
        deleteTime: new Date()
      }
    }
  );
}

export default NextAPI(handler);
