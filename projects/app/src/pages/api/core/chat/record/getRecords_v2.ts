import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type GetChatRecordsProps } from '@/global/core/chat/api';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { transformPreviewHistories } from '@/global/core/chat/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getChatItems, getChatItemStats } from '@fastgpt/service/core/chat/controller';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { ChatLogsFilterEnum } from '@fastgpt/global/core/chat/correction/constants';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  filterPublicNodeResponseData,
  removeAIResponseCite
} from '@fastgpt/global/core/chat/utils';
import { GetChatTypeEnum } from '@/global/core/chat/constants';
import type { LinkedPaginationProps, LinkedListResponse } from '@fastgpt/web/common/fetch/type';
import { type ChatItemType } from '@fastgpt/global/core/chat/type';
import { addPreviewUrlToChatItems } from '@fastgpt/service/core/chat/utils';

export type getChatRecordsQuery = {};

// Local type extension to carry rewriteStandardizedQuery without modifying global ChatItemType
type ChatItemWithRewrite = ChatItemType & {
  rewriteStandardizedQuery?: string;
};

export type getChatRecordsBody = LinkedPaginationProps<GetChatRecordsProps> & {
  chatLogsFilter?: `${ChatLogsFilterEnum}`;
};

export type getChatRecordsResponse = LinkedListResponse<ChatItemType> & {
  total: number;
  goodTotal?: number;
  badTotal?: number;
  notFoundTotal?: number;
};

async function handler(
  req: ApiRequestProps<getChatRecordsBody, getChatRecordsQuery>,
  _res: ApiResponseType<any>
): Promise<getChatRecordsResponse> {
  const {
    appId,
    chatId,
    loadCustomFeedbacks,
    type = GetChatTypeEnum.normal,
    pageSize,
    initialId,
    nextId,
    prevId,
    includeDeleted = false,
    chatLogsFilter = ChatLogsFilterEnum.all
  } = req.body;

  if (!appId || !chatId) {
    return {
      list: [],
      total: 0,
      hasMorePrev: false,
      hasMoreNext: false
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
    [GetChatTypeEnum.normal]: `${commonField} ${loadCustomFeedbacks ? 'customFeedbacks isFeedbackRead deleteTime' : ''}`,
    [GetChatTypeEnum.outLink]: commonField,
    [GetChatTypeEnum.team]: commonField,
    [GetChatTypeEnum.home]: commonField
  };

  const [result, stats] = await Promise.all([
    getChatItems({
      includeDeleted,
      appId,
      chatId,
      field: fieldMap[type as GetChatTypeEnum],
      limit: pageSize,
      initialId,
      prevId,
      nextId,
      chatLogsFilter
    }),
    type === GetChatTypeEnum.normal && chatId
      ? getChatItemStats({ appId, chatId })
      : Promise.resolve(undefined)
  ]);

  // Presign file urls
  await addPreviewUrlToChatItems(result.histories, isPlugin ? 'workflowTool' : 'chatFlow');

  // Remove important information
  if (isOutLink && app.type !== AppTypeEnum.workflowTool) {
    result.histories.forEach((item) => {
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
    result.histories.forEach((item) => {
      if (item.obj === ChatRoleEnum.AI) {
        item.value = removeAIResponseCite(item.value, false);
      }
    });
  }

  // Add rewriteStandardizedQuery to Human messages from adjacent AI response data
  const historiesWithRewrite = result.histories as ChatItemWithRewrite[];
  historiesWithRewrite.forEach((item, index) => {
    if (item.obj === ChatRoleEnum.Human) {
      const nextItem = historiesWithRewrite[index + 1];
      if (nextItem?.obj === ChatRoleEnum.AI && nextItem.responseData) {
        const findStandardizedQuery = (responses: any[]): string | undefined => {
          for (const response of responses) {
            if (response.queryExtensionResult?.synonymRewriteResult?.standardizedQuery) {
              return response.queryExtensionResult.synonymRewriteResult.standardizedQuery;
            }
          }
          return undefined;
        };
        const standardizedQuery = findStandardizedQuery(nextItem.responseData);
        if (standardizedQuery) {
          item.rewriteStandardizedQuery = standardizedQuery;
        }
      }
    }
  });

  const list = isPlugin
    ? historiesWithRewrite
    : transformPreviewHistories(historiesWithRewrite, showCite);

  return {
    list: list.map((item) => ({
      ...item,
      id: item.dataId!
    })),
    total: result.total,
    hasMorePrev: result.hasMorePrev,
    hasMoreNext: result.hasMoreNext,
    ...(stats
      ? {
          goodTotal: stats.goodTotal,
          badTotal: stats.badTotal,
          notFoundTotal: stats.notFoundTotal
        }
      : {})
  };
}

export default NextAPI(handler);
