import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { DelChatHistorySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';

/* delete single chat history (soft delete) */
export async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { query } = parseApiInput({ req, querySchema: DelChatHistorySchema });
  const { appId, chatId } = query;

  const { appId: authAppId, authType, uid } = await authChatCrud({
    ...query,
    req,
    authToken: true,
    authApiKey: true
  });
  const matchAppId = appId || authAppId;
  if (!matchAppId) return Promise.reject('Param are error');

  await MongoChat.updateOne(
    {
      appId: matchAppId,
      chatId,
      ...(authType === AuthUserTypeEnum.outLink || authType === AuthUserTypeEnum.teamDomain
        ? { outLinkUid: uid }
        : {})
    },
    {
      $set: {
        deleteTime: new Date()
      }
    }
  );

  return;
}

export default NextAPI(handler);
