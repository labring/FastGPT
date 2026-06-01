import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { filterPublicNodeResponseData } from '@fastgpt/global/core/chat/utils';
import { GetResDataQuerySchema } from '@fastgpt/global/openapi/core/chat/record/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  composeChatItemResponseData,
  getChatItemResponseRows
} from '@fastgpt/service/core/chat/nodeResponseStorage';

export async function handler(req: ApiRequestProps): Promise<ChatHistoryItemResType[]> {
  const { appId, chatId, dataId, shareId, outLinkUid, teamId, teamToken } = parseApiInput({
    req,
    querySchema: GetResDataQuerySchema
  }).query;
  if (!appId || !chatId || !dataId) {
    return [];
  }

  const [{ showCite }, chatData, nodeResponseRows] = await Promise.all([
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
        dataId
      },
      'dataId obj responseData'
    ).lean(),
    getChatItemResponseRows({
      appId,
      chatId,
      chatItemDataId: dataId
    })
  ]);

  if (chatData?.obj !== ChatRoleEnum.AI) {
    return [];
  }

  // 旧数据的 nodeResponse 直接内联在 chat_items.responseData；存在时优先返回，
  // 避免详情接口被新表的空结果覆盖。新数据没有内联 responseData，才从 flat rows 拼回树。
  const hasInlineResponseData = Object.prototype.hasOwnProperty.call(chatData, 'responseData');
  const flowResponses = hasInlineResponseData
    ? chatData.responseData || []
    : composeChatItemResponseData({
        rows: nodeResponseRows
      });
  return shareId
    ? filterPublicNodeResponseData({
        responseDetail: showCite,
        nodeRespones: flowResponses
      })
    : flowResponses;
}

export default NextAPI(handler);
