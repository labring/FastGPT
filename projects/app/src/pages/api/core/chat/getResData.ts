import { authChatCrud } from '@/service/support/permission/auth/chat';
import {
  ManagePermissionVal,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { filterPublicNodeResponseData } from '@fastgpt/global/core/chat/utils';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';

export type getResDataQuery = OutLinkChatAuthProps & {
  chatId?: string;
  dataId: string;
  appId: string;
};

export type getResDataBody = {};

export type getResDataResponse = ChatHistoryItemResType[] | {};

async function handler(
  req: ApiRequestProps<getResDataBody, getResDataQuery>,
  res: ApiResponseType<any>
): Promise<getResDataResponse> {
  const { appId, chatId, dataId, shareId } = req.query;
  if (!appId || !chatId || !dataId) {
    return {};
  }

  // 1. Un login api: share chat, team chat
  // 2. Login api: account chat, chat log
  const authData = await (() => {
    try {
      return authChatCrud({
        req,
        authToken: true,
        authApiKey: true,
        ...req.query,
        per: ReadPermissionVal
      });
    } catch (error) {
      return authApp({
        req,
        authToken: true,
        authApiKey: true,
        appId,
        per: ManagePermissionVal
      });
    }
  })();

  const [chatData] = await Promise.all([
    MongoChatItem.findOne(
      {
        appId,
        chatId,
        dataId
      },
      'obj responseData'
    ).lean(),
    shareId ? MongoOutLink.findOne({ shareId }).lean() : Promise.resolve(null)
  ]);

  if (chatData?.obj !== ChatRoleEnum.AI) {
    return {};
  }

  const flowResponses = chatData.responseData ?? {};
  return req.query.shareId
    ? filterPublicNodeResponseData({
        // @ts-ignore
        responseDetail: authData.responseDetail,
        flowResponses: chatData.responseData
      })
    : flowResponses;
}

export default NextAPI(handler);
