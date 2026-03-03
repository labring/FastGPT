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
import { ChatLogsFilterEnum } from '@fastgpt/global/core/chat/correction/constants';
import { getPaginationChatItems } from '@fastgpt/service/core/chat/controller';

// Type for chat item with rewriteStandardizedQuery property using intersection type
type ChatItemWithRewrite = ChatItemType & {
  rewriteStandardizedQuery?: string;
};

export type getPaginationRecordsQuery = {};

export type getPaginationRecordsBody = PaginationProps &
  GetChatRecordsProps & {
    chatLogsFilter?: `${ChatLogsFilterEnum}`;
  };


export type getPaginationRecordsResponse = PaginationResponse<ChatItemType> & {
  goodTotal?: number;
  badTotal?: number;
  notFoundTotal?: number;
};

export async function handler(
  req: ApiRequestProps<getPaginationRecordsBody, getPaginationRecordsQuery>,
  _res: ApiResponseType<any>
): Promise<getPaginationRecordsResponse> {
  const {
    appId,
    chatId,
    loadCustomFeedbacks,
    type = GetChatTypeEnum.normal,
    chatLogsFilter = ChatLogsFilterEnum.all
  } = req.body;

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

  const commonField = `obj value adminFeedback userGoodFeedback userBadFeedback time hideInUI durationSeconds errorMsg correctionId ${DispatchNodeResponseKeyEnum.nodeResponse}`;
  const fieldMap = {
    [GetChatTypeEnum.normal]: `${commonField} ${loadCustomFeedbacks ? 'customFeedbacks' : ''}`,
    [GetChatTypeEnum.outLink]: commonField,
    [GetChatTypeEnum.team]: commonField,
    [GetChatTypeEnum.home]: commonField
  };

  // Call controller function to get paginated chat items
  const { histories, total, goodTotal, badTotal, notFoundTotal } = await getPaginationChatItems({
    appId,
    chatId,
    offset,
    pageSize,
    field: fieldMap[type],
    chatLogsFilter
  });

  let filteredHistories: ChatItemWithRewrite[] = histories as ChatItemWithRewrite[];
  // Presign file urls
  await addPreviewUrlToChatItems(histories, isPlugin ? 'workflowTool' : 'chatFlow');

  // Remove important information
  if (isOutLink && app.type !== AppTypeEnum.workflowTool) {
    filteredHistories.forEach((item) => {
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
    filteredHistories.forEach((item) => {
      if (item.obj === ChatRoleEnum.AI) {
        item.value = removeAIResponseCite(item.value, false);
      }
    });
  }

    // Add rewriteStandardizedQuery to Human messages
  filteredHistories.forEach((item, index) => {
    if (item.obj === ChatRoleEnum.Human) {
      const nextIndex = index + 1;
      if (nextIndex < filteredHistories.length) {
        const nextMessage = filteredHistories[nextIndex];

        if (nextMessage.obj === ChatRoleEnum.AI && nextMessage.responseData) {
          const findStandardizedQuery = (responses: any[]): string | undefined => {
            for (const response of responses) {
              if (response.queryExtensionResult?.synonymRewriteResult?.standardizedQuery) {
                return response.queryExtensionResult.synonymRewriteResult.standardizedQuery;
              }
            }
            return undefined;
          };

          const standardizedQuery = findStandardizedQuery(nextMessage.responseData);
          if (standardizedQuery) {
            item.rewriteStandardizedQuery = standardizedQuery;
          }
        }
      }
    }
  });

  return {
    list: isPlugin
      ? filteredHistories
      : transformPreviewHistories(filteredHistories, showCite),
    total,
    goodTotal,
    badTotal,
    notFoundTotal
  };
}

export default NextAPI(handler);
