import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ClearChatHistoriesSchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

/* clear all chat histories of an app */
export async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { query } = parseApiInput({ req, querySchema: ClearChatHistoriesSchema });
  const { appId, shareId, outLinkUid, teamId, teamToken } = query;

  const { appId: authAppId, tmbId, uid, authType } = await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    ...query
  });
  const matchAppId = appId || authAppId;
  if (!matchAppId) return Promise.reject('Param are error');

  const match = await (async () => {
    if (shareId && outLinkUid && authType === 'outLink') {
      return {
        appId: matchAppId,
        outLinkUid: uid
      };
    }
    if (teamId && teamToken && authType === 'teamDomain') {
      return {
        appId: matchAppId,
        outLinkUid: uid
      };
    }
    if (authType === 'token') {
      return {
        appId: matchAppId,
        tmbId,
        source: ChatSourceEnum.online
      };
    }
    if (authType === 'apikey') {
      return {
        appId: matchAppId,
        source: ChatSourceEnum.api
      };
    }

    return Promise.reject('Param are error');
  })();

  // find chatIds
  const list = await MongoChat.find(match, 'chatId').lean();

  await MongoChat.updateMany(
    {
      ...match,
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
