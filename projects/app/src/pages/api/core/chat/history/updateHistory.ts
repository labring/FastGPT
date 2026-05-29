import type { NextApiResponse } from 'next';
import { UpdateHistoryBodySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

/* update chat history: title, customTitle, top */
export async function handler(req: ApiRequestProps, res: NextApiResponse) {
  const { appId, chatId, title, customTitle, top } = parseApiInput({
    req,
    bodySchema: UpdateHistoryBodySchema
  }).body;
  await authChatCrud({
    ...req.body,
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
  });

  await MongoChat.updateOne(
    { appId, chatId },
    {
      updateTime: new Date(),
      ...(title !== undefined && { title }),
      ...(customTitle !== undefined && { customTitle }),
      ...(top !== undefined && { top })
    }
  );
}

export default NextAPI(handler);
