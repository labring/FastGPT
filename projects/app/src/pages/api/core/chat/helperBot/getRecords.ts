import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  GetHelperBotChatRecordsParamsSchema,
  type GetHelperBotChatRecordsParamsType,
  type GetHelperBotChatRecordsResponseType
} from '@fastgpt/global/openapi/core/chat/helperBot/api';
import { authHelperBotChatCrud } from '@/service/support/permission/auth/chat';
import { MongoHelperBotChatItem } from '../../../../../../../../packages/service/core/chat/HelperBot/chatItemSchema';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { addPreviewUrlToChatItems } from '@fastgpt/service/core/chat/utils';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export type getRecordsQuery = GetHelperBotChatRecordsParamsType;

export type getRecordsBody = Record<string, never>;

export type getRecordsResponse = GetHelperBotChatRecordsResponseType;

async function handler(
  req: ApiRequestProps<getRecordsBody, getRecordsQuery>
): Promise<getRecordsResponse> {
  const { type, chatId } = parseApiInput({
    req,
    querySchema: GetHelperBotChatRecordsParamsSchema
  }).query;
  const { userId } = await authHelperBotChatCrud({
    type,
    chatId,
    req,
    authToken: true
  });

  const { offset } = parsePaginationRequest(req);

  const [histories, total] = await Promise.all([
    MongoHelperBotChatItem.find({ userId, chatId }).sort({ _id: -1 }).skip(offset).limit(20).lean(),
    MongoHelperBotChatItem.countDocuments({ userId, chatId })
  ]);
  histories.reverse();
  await addPreviewUrlToChatItems(histories as unknown as ChatItemMiniType[], 'chatFlow');

  return {
    total,
    list: histories
  };
}

export default NextAPI(handler);
