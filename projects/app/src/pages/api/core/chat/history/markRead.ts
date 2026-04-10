import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MarkChatReadBodySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps, type ApiResponseType } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

/** 将对话标为已读（例如用户在本页看完流式回复后） */
export async function handler(req: ApiRequestProps, _res: ApiResponseType): Promise<void> {
  const body = MarkChatReadBodySchema.parse(req.body);

  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    ...body,
    per: WritePermissionVal
  });

  await MongoChat.updateOne(
    { appId: body.appId, chatId: body.chatId },
    { $set: { hasBeenRead: true, updateTime: new Date() } }
  );
}

export default NextAPI(handler);
