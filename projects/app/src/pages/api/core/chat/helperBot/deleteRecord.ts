import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  DeleteHelperBotChatParamsSchema,
  type DeleteHelperBotChatParamsType
} from '@fastgpt/global/openapi/core/chat/helperBot/api';
import { authHelperBotChatCrud } from '@/service/support/permission/auth/chat';
import { MongoHelperBotChatItem } from '@fastgpt/service/core/chat/HelperBot/chatItemSchema';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export type deleteRecordQuery = DeleteHelperBotChatParamsType;

export type deleteRecordBody = Record<string, never>;

export type deleteRecordResponse = Record<string, never>;

async function handler(
  req: ApiRequestProps<deleteRecordBody, deleteRecordQuery>
): Promise<deleteRecordResponse> {
  const { type, chatId, chatItemId } = parseApiInput({
    req,
    querySchema: DeleteHelperBotChatParamsSchema
  }).query;
  const { userId } = await authHelperBotChatCrud({
    type,
    chatId,
    req,
    authToken: true
  });
  await MongoHelperBotChatItem.deleteMany({ userId, chatId, chatItemId });
  return {};
}

export default NextAPI(handler);
