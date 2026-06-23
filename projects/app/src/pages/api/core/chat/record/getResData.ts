import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { filterPublicNodeResponseData } from '@fastgpt/global/core/chat/utils';
import { GetResDataQuerySchema } from '@fastgpt/global/openapi/core/chat/record/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getChatItemResponseData } from '@fastgpt/service/core/chat/nodeResponseStorage';

export async function handler(req: ApiRequestProps): Promise<ChatHistoryItemResType[]> {
  const { appId, chatId, dataId, shareId, outLinkUid, teamId, teamToken } = parseApiInput({
    req,
    querySchema: GetResDataQuerySchema
  }).query;
  if (!appId || !chatId || !dataId) {
    return [];
  }

  const [{ showCite }, chatData] = await Promise.all([
    authChatCrud({
      req,
      authToken: true,
      authApiKey: true,
      appId,
      chatId,
      shareId,
      outLinkUid,
      teamId,
      teamToken
    }),
    MongoChatItem.findOne(
      {
        appId,
        chatId,
        dataId,
        obj: ChatRoleEnum.AI
      },
      'dataId obj responseData'
    ).lean()
  ]);

  if (chatData?.obj !== ChatRoleEnum.AI) {
    return [];
  }

  // 新数据优先从独立表拼详情；旧数据如果只有 chat_items.responseData，则作为 fallback 返回。
  const hasInlineResponseData = Object.prototype.hasOwnProperty.call(chatData, 'responseData');
  const flowResponses = await getChatItemResponseData({
    appId,
    chatId,
    chatItemDataId: dataId,
    fallbackResponseData: hasInlineResponseData ? chatData.responseData || [] : undefined
  });
  return shareId
    ? filterPublicNodeResponseData({
        responseDetail: showCite,
        nodeRespones: flowResponses
      })
    : flowResponses;
}

export default NextAPI(handler);
