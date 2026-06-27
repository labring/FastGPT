import type { NextApiResponse } from 'next';
import { UpdateHistoryBodySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';

/* update chat history: title, customTitle, top */
export async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { sourceType, sourceId, chatId, title, customTitle, top } = parseApiInput({
    req,
    bodySchema: UpdateHistoryBodySchema
  }).body;
  await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    per: WritePermissionVal
  });

  await MongoChat.updateOne(
    { ...buildChatSourceQuery({ sourceType, sourceId }), chatId },
    {
      updateTime: new Date(),
      ...(title !== undefined && { title }),
      ...(customTitle !== undefined && { customTitle }),
      ...(top !== undefined && { top })
    }
  );
}

export default NextAPI(handler);
