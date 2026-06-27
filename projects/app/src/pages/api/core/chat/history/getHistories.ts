import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatGenerateStatusEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { buildChatTargetResponse } from '@fastgpt/global/openapi/core/chat/api';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  GetHistoriesBodySchema,
  GetHistoriesResponseSchema,
  type GetHistoriesResponseType
} from '@fastgpt/global/openapi/core/chat/history/api';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { buildChatHistoryMatch } from '@/service/core/chat/history';

/* get chat histories list */
export async function handler(req: ApiRequestProps): Promise<GetHistoriesResponseType> {
  const {
    sourceType,
    sourceId,
    shareId,
    outLinkUid,
    teamId,
    teamToken,
    source,
    startCreateTime,
    endCreateTime,
    startUpdateTime,
    endUpdateTime
  } = parseApiInput({ req, bodySchema: GetHistoriesBodySchema }).body;
  const { offset, pageSize } = parsePaginationRequest(req);

  const match = await buildChatHistoryMatch({
    req,
    sourceType,
    sourceId,
    shareId,
    outLinkUid,
    teamId,
    teamToken,
    source
  });

  if (!match) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  if (match.appId && !ObjectIdSchema.safeParse(match.appId).success) {
    return GetHistoriesResponseSchema.parse({
      list: [],
      total: 0
    });
  }

  const timeMatch: Record<string, any> = {};
  if (startCreateTime || endCreateTime) {
    timeMatch.createTime = {
      ...(startCreateTime && { $gte: new Date(startCreateTime) }),
      ...(endCreateTime && { $lte: new Date(endCreateTime) })
    };
  }
  if (startUpdateTime || endUpdateTime) {
    timeMatch.updateTime = {
      ...(startUpdateTime && { $gte: new Date(startUpdateTime) }),
      ...(endUpdateTime && { $lte: new Date(endUpdateTime) })
    };
  }

  const mergeMatch = { ...match, ...timeMatch, deleteTime: null };

  const [data, total] = await Promise.all([
    await MongoChat.find(
      mergeMatch,
      'chatId title top customTitle appId updateTime chatGenerateStatus hasBeenRead'
    )
      .sort({ top: -1, updateTime: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoChat.countDocuments(mergeMatch)
  ]);

  return GetHistoriesResponseSchema.parse({
    list: data.map((item) => ({
      chatId: item.chatId,
      updateTime: item.updateTime,
      ...buildChatTargetResponse({
        sourceType: sourceType ?? ChatSourceTypeEnum.app,
        sourceId: item.appId
      }),
      customTitle: item.customTitle,
      title: item.title,
      top: item.top,
      chatGenerateStatus: item.chatGenerateStatus ?? ChatGenerateStatusEnum.done,
      hasBeenRead: item.hasBeenRead
    })),
    total
  });
}

export default NextAPI(handler);
