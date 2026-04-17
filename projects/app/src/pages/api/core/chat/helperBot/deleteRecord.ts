import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { DeleteHelperBotChatParamsType } from '@fastgpt/global/openapi/core/chat/helperBot/api';
import { authHelperBotChatCrud } from '@/service/support/permission/auth/chat';
import { MongoHelperBotChatItem } from '@fastgpt/service/core/chat/HelperBot/chatItemSchema';

export type deleteRecordQuery = DeleteHelperBotChatParamsType;

export type deleteRecordBody = {};

export type deleteRecordResponse = {};

async function handler(
  req: ApiRequestProps<deleteRecordBody, deleteRecordQuery>,
  res: ApiResponseType<any>
): Promise<deleteRecordResponse> {
  const { type, chatId, chatItemId } = req.query;
  const { chat, userId } = await authHelperBotChatCrud({
    type,
    chatId,
    req,
    authToken: true
  });
  await MongoHelperBotChatItem.deleteMany({ userId, chatId, chatItemId });
  return {};
}

export default NextAPI(handler);
