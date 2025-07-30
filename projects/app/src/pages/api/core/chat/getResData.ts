import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResData } from '@fastgpt/service/core/chat/chatItemResDataSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { type OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { filterPublicNodeResponseData } from '@fastgpt/global/core/chat/utils';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';

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

  let nodeResponseData: ChatHistoryItemResType[] = [];

  //AI节点的详情从item表迁移到了resData表，做个判断，兼容新老数据
  const archiveItemResponseData = chatData?.[DispatchNodeResponseKeyEnum.nodeResponse];
  // 判断是否为空：undefined / null / 非数组 / 空数组
  const itemResponseDataExist =
    Array.isArray(archiveItemResponseData) && archiveItemResponseData.length > 0;
  if (chatData?.obj === ChatRoleEnum.AI && itemResponseDataExist === false) {
    const resDataList = await MongoChatItemResData.find(
      {
        itemId: chatData._id // 所有属于该 chatItem 的子数据
      },
      { [DispatchNodeResponseKeyEnum.nodeResponse]: 1, _id: 0 } // 只取 nodeResponse 字段
    )
      .sort({ dataSort: 1 }) // 确保顺序一致（可按插入顺序）
      .lean();
    return req.query.shareId
      ? filterPublicNodeResponseData({
          responseDetail,
          flowResponses: nodeResponseData
        })
      : resDataList.flatMap((item) => item[DispatchNodeResponseKeyEnum.nodeResponse] || []);
  } else {
    return req.query.shareId
      ? filterPublicNodeResponseData({
          responseDetail,
          flowResponses: nodeResponseData
        })
      : chatData?.[DispatchNodeResponseKeyEnum.nodeResponse] ?? [];
  }
}

export default NextAPI(handler);
