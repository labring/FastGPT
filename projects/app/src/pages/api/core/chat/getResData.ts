import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { filterPublicNodeResponseData } from '@fastgpt/global/core/chat/utils';

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

  const [{ responseDetail }, chatData] = await Promise.all([
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
      'obj responseData'
    ).lean()
  ]);

  if (chatData?.obj !== ChatRoleEnum.AI) {
    return [];
  }

  const flowResponses = chatData.responseData ?? [];
  return req.query.shareId
    ? filterPublicNodeResponseData({
        responseDetail,
        flowResponses: chatData.responseData
      })
    : flowResponses;
}

export default NextAPI(handler);
