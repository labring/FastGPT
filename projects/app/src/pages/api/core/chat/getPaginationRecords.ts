import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type GetChatRecordsProps } from '@/global/core/chat/api';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { transformPreviewHistories } from '@/global/core/chat/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  filterPublicNodeResponseData,
  removeAIResponseCite
} from '@fastgpt/global/core/chat/utils';
import { GetChatTypeEnum } from '@/global/core/chat/constants';
import { type PaginationProps, type PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { type ChatItemType } from '@fastgpt/global/core/chat/type';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { addPreviewUrlToChatItems } from '@fastgpt/service/core/chat/utils';

export type getPaginationRecordsQuery = {};

export type getPaginationRecordsBody = PaginationProps & GetChatRecordsProps;

export type getPaginationRecordsResponse = PaginationResponse<ChatItemType>;

async function handler(
  req: ApiRequestProps<getPaginationRecordsBody, getPaginationRecordsQuery>,
  _res: ApiResponseType<any>
): Promise<getPaginationRecordsResponse> {
  const { appId, chatId, loadCustomFeedbacks, type = GetChatTypeEnum.normal } = req.body;

  const { offset, pageSize } = parsePaginationRequest(req);

  if (!appId || !chatId) {
    return {
      list: [],
      total: 0
    };
  }

  const [app, { showCite, showRunningStatus, authType }] = await Promise.all([
    MongoApp.findById(appId, 'type').lean(),
    authChatCrud({
      req,
      authToken: true,
      authApiKey: true,
      ...req.body
    })
  ]);

  if (!app) {
    return Promise.reject(AppErrEnum.unExist);
  }
  const isPlugin = app.type === AppTypeEnum.workflowTool;
  const isOutLink = authType === GetChatTypeEnum.outLink;

  const commonField = `obj value adminFeedback userGoodFeedback userBadFeedback time hideInUI durationSeconds errorMsg ${DispatchNodeResponseKeyEnum.nodeResponse}`;
  const fieldMap = {
    [GetChatTypeEnum.normal]: `${commonField} ${loadCustomFeedbacks ? 'customFeedbacks' : ''}`,
    [GetChatTypeEnum.outLink]: commonField,
    [GetChatTypeEnum.team]: commonField,
    [GetChatTypeEnum.home]: commonField
  };

  const { total, histories } = await getChatItems({
    appId,
    chatId,
    field: fieldMap[type],
    offset,
    limit: pageSize
  });

  // Presign file urls
  await addPreviewUrlToChatItems(histories, isPlugin ? 'workflowTool' : 'chatFlow');

  // Remove important information
  if (isOutLink && app.type !== AppTypeEnum.workflowTool) {
    histories.forEach((item) => {
      if (item.obj === ChatRoleEnum.AI) {
        item.responseData = filterPublicNodeResponseData({
          nodeRespones: item.responseData,
          responseDetail: showCite
        });

        if (showRunningStatus === false) {
          item.value = item.value.filter((v) => v.type !== ChatItemValueTypeEnum.tool);
        }
      }
    });
  }
  if (!showCite) {
    histories.forEach((item) => {
      if (item.obj === ChatRoleEnum.AI) {
        item.value = removeAIResponseCite(item.value, false);
      }
    });
  }

  return {
    list: isPlugin ? histories : transformPreviewHistories(histories, showCite),
    total
  };
}

export default NextAPI(handler);
