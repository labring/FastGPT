import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { filterPublicNodeResponseData } from '@fastgpt/global/core/chat/utils';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';

export type getResDataQuery = OutLinkChatAuthProps & {
  chatId?: string;
  dataId: string;
  appId: string;
};

export type getResDataBody = {};

export type getResDataResponse = ChatHistoryItemResType[] | [];

async function handler(
  req: ApiRequestProps<getResDataBody, getResDataQuery>,
  res: ApiResponseType<any>
): Promise<getResDataResponse> {
  const { appId, chatId, dataId, shareId } = req.query;
  if (!appId || !chatId || !dataId) {
    return [];
  }

  const [{ showCite }, chatData, nodeResponses] = await Promise.all([
    authChatCrud({
      req,
      authToken: true,
      authApiKey: true,
      ...req.query
    }),
    MongoChatItem.findOne(
      {
        appId,
        chatId,
        dataId
      },
      'dataId obj responseData'
    ).lean(),
    (
      await MongoChatItemResponse.find(
        { appId, chatId, chatItemDataId: dataId },
        { data: 1 }
      ).lean()
    ).map((item) => item.data)
  ]);

  if (chatData?.obj !== ChatRoleEnum.AI) {
    return [];
  }

  const flowResponses = chatData.responseData?.length ? chatData.responseData : nodeResponses;
  return req.query.shareId
    ? filterPublicNodeResponseData({
        responseDetail: showCite,
        nodeRespones: flowResponses
      })
    : flowResponses;
}

export default NextAPI(handler);
