import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { GetChatRecordsProps } from '@/global/core/chat/api';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { transformPreviewHistories } from '@/global/core/chat/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { adaptStringValue, getChatItems } from '@fastgpt/service/core/chat/controller';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { filterPublicNodeResponseData } from '@fastgpt/global/core/chat/utils';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { GetChatTypeEnum } from '@/global/core/chat/constants';
import { RequestPaging } from '@/types';

export type getPaginationRecordsQuery = RequestPaging & GetChatRecordsProps;

export type getPaginationRecordsBody = {};

export type getPaginationRecordsResponse = {};

async function handler(
  req: ApiRequestProps<getPaginationRecordsBody, getPaginationRecordsQuery>,
  res: ApiResponseType<any>
): Promise<getPaginationRecordsResponse> {
  const { chatId, appId, pageNum = 1, pageSize = 10, loadCustomFeedbacks, type } = req.query;
  if (!appId || !chatId)
    return {
      data: [],
      total: 0,
      pageNum,
      pageSize
    };

  const [app] = await Promise.all([
    MongoApp.findById(appId).lean(),
    authChatCrud({
      req,
      authToken: true,
      ...req.query,
      per: ReadPermissionVal
    })
  ]);
  if (!app) {
    return Promise.reject(AppErrEnum.unExist);
  }

  const shareChat = await (async () => {
    if (type === GetChatTypeEnum.outLink)
      return await authOutLink({
        shareId: req.query.shareId,
        outLinkUid: req.query.outLinkUid
      }).then((result) => result.shareChat);
  })();

  const fieldMap = {
    [GetChatTypeEnum.normal]: `dataId obj value adminFeedback userBadFeedback userGoodFeedback ${
      DispatchNodeResponseKeyEnum.nodeResponse
    } ${loadCustomFeedbacks ? 'customFeedbacks' : ''}`,
    [GetChatTypeEnum.outLink]: `dataId obj value userGoodFeedback userBadFeedback ${
      shareChat?.responseDetail || app.type === AppTypeEnum.plugin
        ? `adminFeedback ${DispatchNodeResponseKeyEnum.nodeResponse}`
        : ''
    } `,
    [GetChatTypeEnum.team]: `dataId obj value userGoodFeedback userBadFeedback adminFeedback ${DispatchNodeResponseKeyEnum.nodeResponse}`
  };

  const { total, histories } = await getChatItems({
    appId,
    chatId,
    pageSize,
    field: fieldMap[type],
    pageNum
  });

  if (type === 'outLink')
    app.type !== AppTypeEnum.plugin &&
      histories.forEach((item) => {
        if (item.obj === ChatRoleEnum.AI) {
          item.responseData = filterPublicNodeResponseData({ flowResponses: item.responseData });
        }
      });

  return {
    pageNum,
    pageSize,
    data: app.type === AppTypeEnum.plugin ? histories : transformPreviewHistories(histories),
    total
  };
}

export default NextAPI(handler);
