import { getChatGenerationStatuses } from '@fastgpt/service/core/chat/generationLease';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps, type ApiResponseType } from '@fastgpt/next/type';
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
  const { customUid, authProxy, sourceType, sourceId, chatIds, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: GetHistoryStatusBodySchema
  }).body;

  const match = await buildChatHistoryMatch({
    customUid,
    authProxy,
    req,
    sourceType,
    sourceId,
    outLinkAuthData
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
    'chatId updateTime hasBeenRead'
  ).lean();

  // 读取异常必须上抛，避免轮询把未知状态覆盖成空闲；只查询权限过滤后的会话。
  const generationStatuses = await getChatGenerationStatuses({
    sourceType: sourceType ?? ChatSourceTypeEnum.app,
    sourceId: String(match.appId),
    chatIds: data.map((item) => item.chatId),
    fallbackOnError: false
  });

  return GetHistoryStatusResponseSchema.parse({
    list: data.map((item) => ({
      chatId: item.chatId,
      updateTime: item.updateTime,
      chatGenerateStatus: generationStatuses.get(item.chatId) ?? ChatGenerateStatusEnum.done,
      hasBeenRead: item.hasBeenRead
    }))
  });
}

export default NextAPI(handler);
