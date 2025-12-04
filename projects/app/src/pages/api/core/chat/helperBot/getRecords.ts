import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type {
  GetHelperBotChatRecordsParamsType,
  GetHelperBotChatRecordsResponseType
} from '@fastgpt/global/openapi/core/chat/helperBot/api';
import { authHelperBotChatCrud } from '@/service/support/permission/auth/chat';
import { MongoHelperBotChatItem } from '../../../../../../../../packages/service/core/chat/HelperBot/chatItemSchema';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';

export type getRecordsQuery = GetHelperBotChatRecordsParamsType;

export type getRecordsBody = {};

export type getRecordsResponse = GetHelperBotChatRecordsResponseType;

async function handler(
  req: ApiRequestProps<getRecordsBody, getRecordsQuery>,
  res: ApiResponseType<any>
): Promise<getRecordsResponse> {
  const { type, chatId } = req.query;
  const { chat, userId } = await authHelperBotChatCrud({
    type,
    chatId,
    req,
    authToken: true
  });

  const { offset, pageSize } = parsePaginationRequest(req);

  const [histories, total] = await Promise.all([
    MongoHelperBotChatItem.find({ userId, chatId }).sort({ _id: -1 }).skip(offset).limit(20).lean(),
    MongoHelperBotChatItem.countDocuments({ userId, chatId })
  ]);
  histories.reverse();

  return {
    total,
    list: histories
  };
}

export default NextAPI(handler);
