import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MarkChatReadBodySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps, type ApiResponseType } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';

/** 将对话标为已读（例如用户在本页看完流式回复后） */
export async function handler(req: ApiRequestProps, _res: ApiResponseType): Promise<void> {
  const body = parseApiInput({ req, bodySchema: MarkChatReadBodySchema }).body;
  const { sourceType, sourceId, chatId } = body;

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
    { $set: { hasBeenRead: true, updateTime: new Date() } }
  );
}

export default NextAPI(handler);
