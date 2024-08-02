import { authChatCrud } from '@/service/support/permission/auth/chat';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

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
  await authChatCrud({
    req,
    authToken: true,
    ...req.query,
    per: ReadPermissionVal
  });

  const chatData = await MongoChatItem.findOne({
    appId,
    chatId,
    dataId
  });

  if (chatData?.obj === ChatRoleEnum.AI) {
    return chatData.responseData || {};
  } else return {};
}

export default NextAPI(handler);
