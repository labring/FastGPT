import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ApiRequestProps } from '@fastgpt/next/types';
import { NextAPI } from '@/service/middleware/entry';
import { type ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { filterPublicNodeResponseData } from '@fastgpt/global/core/chat/utils';
import { GetResDataQuerySchema } from '@fastgpt/global/openapi/core/chat/record/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getChatItemResponseData } from '@fastgpt/service/core/chat/nodeResponseStorage';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';

export async function handler(req: ApiRequestProps): Promise<ChatHistoryItemResType[]> {
  const { sourceType, sourceId, chatId, dataId, outLinkAuthData } = parseApiInput({
    req,
    querySchema: GetResDataQuerySchema
  }).query;
  if (!chatId || !dataId) {
    return [];
  }

  const authRes = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData
  });
  const resolvedSourceId = authRes.sourceId;

  const chatData = await MongoChatItem.findOne(
    {
      ...buildChatSourceQuery({ sourceType, sourceId: resolvedSourceId }),
      chatId,
      dataId,
      obj: ChatRoleEnum.AI
    },
    'dataId obj responseData'
  ).lean();

  if (chatData?.obj !== ChatRoleEnum.AI) {
    return [];
  }

  // 新数据优先从独立表拼详情；旧数据如果只有 chat_items.responseData，则作为 fallback 返回。
  const hasInlineResponseData = Object.prototype.hasOwnProperty.call(chatData, 'responseData');
  const flowResponses = await getChatItemResponseData({
    sourceType,
    sourceId: resolvedSourceId,
    chatId,
    chatItemDataId: dataId,
    fallbackResponseData: hasInlineResponseData ? chatData.responseData || [] : undefined
  });
  return outLinkAuthData?.shareId
    ? filterPublicNodeResponseData({
        responseDetail: authRes.showCite,
        nodeRespones: flowResponses
      })
    : flowResponses;
}

export default NextAPI(handler);
