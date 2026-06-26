import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatGenerateStatusEnum } from '@fastgpt/global/core/chat/constants';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps, type ApiResponseType } from '@fastgpt/service/type/next';
import {
  GetHistoryStatusBodySchema,
  GetHistoryStatusResponseSchema,
  type GetHistoryStatusResponseType
} from '@fastgpt/global/openapi/core/chat/history/api';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { buildChatHistoryMatch } from '@/service/core/chat/history';

/* Batch get chatGenerateStatus / hasBeenRead for sidebar sync */
export async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType
): Promise<GetHistoryStatusResponseType> {
  const { sourceType, sourceId, chatIds, shareId, outLinkUid, teamId, teamToken } = parseApiInput({
    req,
    bodySchema: GetHistoryStatusBodySchema
  }).body;

  const match = await buildChatHistoryMatch({
    req,
    sourceType,
    sourceId,
    shareId,
    outLinkUid,
    teamId,
    teamToken
  });

  if (!match) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  if (match.appId && !ObjectIdSchema.safeParse(match.appId).success) {
    return GetHistoryStatusResponseSchema.parse({ list: [] });
  }

  const data = await MongoChat.find(
    {
      ...match,
      chatId: { $in: chatIds },
      deleteTime: null
    },
    'chatId updateTime chatGenerateStatus hasBeenRead'
  ).lean();

  return GetHistoryStatusResponseSchema.parse({
    list: data.map((item) => ({
      chatId: item.chatId,
      updateTime: item.updateTime,
      chatGenerateStatus: item.chatGenerateStatus ?? ChatGenerateStatusEnum.done,
      hasBeenRead: item.hasBeenRead
    }))
  });
}

export default NextAPI(handler);
