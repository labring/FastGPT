import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { GetChatRecordsProps } from '@/global/core/chat/api';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { transformPreviewHistories } from '@/global/core/chat/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { filterPublicNodeResponseData } from '@fastgpt/global/core/chat/utils';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { GetChatTypeEnum } from '@/global/core/chat/constants';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { ChatItemType } from '@fastgpt/global/core/chat/type';

export type getPaginationRecordsQuery = {};

export type getPaginationRecordsBody = PaginationProps & GetChatRecordsProps;

export type getPaginationRecordsResponse = PaginationResponse<ChatItemType>;

async function handler(
  req: ApiRequestProps<getPaginationRecordsBody, getPaginationRecordsQuery>,
  res: ApiResponseType<any>
): Promise<getPaginationRecordsResponse> {
  const {
    appId,
    chatId,
    offset,
    pageSize = 10,
    loadCustomFeedbacks,
    type = GetChatTypeEnum.normal
  } = req.body;

  if (!appId || !chatId) {
    return {
      list: [],
      total: 0
    };
  }

  const [app] = await Promise.all([
    MongoApp.findById(appId, 'type').lean(),
    authChatCrud({
      req,
      authToken: true,
      authApiKey: true,
      ...req.body,
      per: ReadPermissionVal
    })
  ]);

  if (!app) {
    return Promise.reject(AppErrEnum.unExist);
  }
  const isPlugin = app.type === AppTypeEnum.plugin;

  const shareChat = await (async () => {
    if (type === GetChatTypeEnum.outLink)
      return await authOutLink({
        shareId: req.body.shareId,
        outLinkUid: req.body.outLinkUid
      }).then((result) => result.shareChat);
  })();

  const fieldMap = {
    [GetChatTypeEnum.normal]: `dataId obj value adminFeedback userBadFeedback userGoodFeedback time ${
      DispatchNodeResponseKeyEnum.nodeResponse
    } ${loadCustomFeedbacks ? 'customFeedbacks' : ''}`,
    [GetChatTypeEnum.outLink]: `dataId obj value userGoodFeedback userBadFeedback adminFeedback time ${DispatchNodeResponseKeyEnum.nodeResponse}`,
    [GetChatTypeEnum.team]: `dataId obj value userGoodFeedback userBadFeedback adminFeedback time ${DispatchNodeResponseKeyEnum.nodeResponse}`
  };

  const { total, histories } = await getChatItems({
    appId,
    chatId,
    field: fieldMap[type],
    offset,
    limit: pageSize
  });

  const responseDetail = !shareChat || shareChat.responseDetail;

  // Remove important information
  if (shareChat && app.type !== AppTypeEnum.plugin) {
    histories.forEach((item) => {
      if (item.obj === ChatRoleEnum.AI) {
        item.responseData = filterPublicNodeResponseData({
          flowResponses: item.responseData,
          responseDetail
        });

        if (shareChat.showNodeStatus === false) {
          item.value = item.value.filter((v) => v.type !== ChatItemValueTypeEnum.tool);
        }
      }
    });
  }

  return {
    list: isPlugin ? histories : transformPreviewHistories(histories, responseDetail),
    total
  };
}

export default NextAPI(handler);
