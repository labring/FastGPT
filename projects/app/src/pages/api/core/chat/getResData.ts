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
  const { appId, chatId, dataId } = req.query;
  if (!appId || !chatId || !dataId) {
    return {};
  }

  // 1. Un login api: share chat, team chat
  // 2. Login api: account chat, chat log
  try {
    await authChatCrud({
      req,
      authToken: true,
      ...req.query,
      per: ReadPermissionVal
    });
  } catch (error) {
    await authApp({
      req,
      authToken: true,
      appId,
      per: ManagePermissionVal
    });
  }

  const chatData = await MongoChatItem.findOne(
    {
      appId,
      chatId,
      dataId
    },
    'obj responseData'
  ).lean();

  if (chatData?.obj === ChatRoleEnum.AI) {
    const data = chatData.responseData || {};
    return req.query.shareId ? filterPublicNodeResponseData(data) : data;
  } else return {};
}

export default NextAPI(handler);
