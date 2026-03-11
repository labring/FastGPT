import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type GetChatRecordsProps } from '@/global/core/chat/api';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { transformPreviewHistories } from '@/global/core/chat/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
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
    filterDeleted?: boolean; // 是否过滤已删除的记录，默认true（用户端过滤，管理员日志详情传false）
  };

export type getPaginationRecordsResponse = PaginationResponse<ChatItemType> & {
  goodTotal?: number;
  badTotal?: number;
  notFoundTotal?: number;
};

async function handler(
  req: ApiRequestProps<getPaginationRecordsBody, getPaginationRecordsQuery>,
  _res: ApiResponseType<any>
): Promise<getPaginationRecordsResponse> {
  const {
    appId,
    chatId,
    loadCustomFeedbacks,
    type = GetChatTypeEnum.normal,
    chatLogsFilter = ChatLogsFilterEnum.all,
    filterDeleted = true // 默认过滤已删除的记录
  } = req.body;

  const { offset, pageSize } = parsePaginationRequest(req);

  if (!appId || !chatId) {
    return {
      list: [],
      total: 0
    };
  }

  const [app, { responseDetail, showNodeStatus, authType }] = await Promise.all([
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
  const isPlugin = app.type === AppTypeEnum.plugin;
  const isOutLink = authType === GetChatTypeEnum.outLink;

  const commonField =
    'dataId obj value adminFeedback userGoodFeedback userBadFeedback time hideInUI durationSeconds errorMsg correctionId';
  const fieldMap = {
    [GetChatTypeEnum.normal]: `${commonField} ${
      DispatchNodeResponseKeyEnum.nodeResponse
    } ${loadCustomFeedbacks ? 'customFeedbacks' : ''}`,
    [GetChatTypeEnum.outLink]: `${commonField} ${DispatchNodeResponseKeyEnum.nodeResponse}`,
    [GetChatTypeEnum.team]: `${commonField} ${DispatchNodeResponseKeyEnum.nodeResponse}`,
    [GetChatTypeEnum.home]: `${commonField} ${DispatchNodeResponseKeyEnum.nodeResponse}`
  };

  // Call controller function to get paginated chat items
  const { histories, total, goodTotal, badTotal, notFoundTotal } = await getPaginationChatItems({
    appId,
    chatId,
    offset,
    pageSize,
    field: fieldMap[type],
    chatLogsFilter,
    filterDeleted // 传递过滤已删除记录的参数
  });

  let filteredHistories: ChatItemWithRewrite[] = histories as ChatItemWithRewrite[];

  // Remove important information
  if (isOutLink && app.type !== AppTypeEnum.plugin) {
    filteredHistories.forEach((item) => {
      if (item.obj === ChatRoleEnum.AI) {
        item.responseData = filterPublicNodeResponseData({
          flowResponses: item.responseData,
          responseDetail
        });

        if (showNodeStatus === false) {
          item.value = item.value.filter((v) => v.type !== ChatItemValueTypeEnum.tool);
        }
      }
    });
  }
  if (!responseDetail) {
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
      : transformPreviewHistories(filteredHistories, responseDetail),
    total,
    goodTotal,
    badTotal,
    notFoundTotal
  };
}

export default NextAPI(handler);
