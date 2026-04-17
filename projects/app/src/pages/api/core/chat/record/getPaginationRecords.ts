import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { transformPreviewHistories } from '@/global/core/chat/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  filterPublicNodeResponseData,
  removeAIResponseCite
} from '@fastgpt/global/core/chat/utils';
import { GetChatTypeEnum } from '@fastgpt/global/core/chat/constants';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { addPreviewUrlToChatItems } from '@fastgpt/service/core/chat/utils';
import { ChatLogsFilterEnum } from '@fastgpt/global/core/chat/correction/constants';
import { getPaginationChatItems } from '@fastgpt/service/core/chat/controller';
import {
  GetPaginationRecordsBodySchema
} from '@fastgpt/global/openapi/core/chat/record/api';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';

// Type for chat item with rewriteStandardizedQuery property using intersection type
type ChatItemWithRewrite = ChatItemType & {
  rewriteStandardizedQuery?: string;
};

export async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
) {
  const chatLogsFilter =
    ((req.body as any)?.chatLogsFilter as `${ChatLogsFilterEnum}`) ?? ChatLogsFilterEnum.all;
  const {
    appId,
    chatId,
    loadCustomFeedbacks = false,
    type = GetChatTypeEnum.normal,
    ...authProps
  } = GetPaginationRecordsBodySchema.parse(req.body);

  const { offset, pageSize } = parsePaginationRequest(req);

  if (!appId || !chatId) {
    return {
      list: [],
      total: 0
    };
  }

  const [app, { showCite, showRunningStatus, showSkillReferences, authType }] = await Promise.all([
    MongoApp.findById(appId, 'type').lean(),
    authChatCrud({
      req,
      authToken: true,
      authApiKey: true,
      appId,
      chatId,
      ...authProps
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

  filteredHistories.forEach((item) => {
    // Remove important information
    if (isOutLink && app.type !== AppTypeEnum.workflowTool) {
      if (item.obj === ChatRoleEnum.AI) {
        item.responseData = filterPublicNodeResponseData({
          nodeRespones: item.responseData,
          responseDetail: showCite
        });

        if (showRunningStatus === false) {
          item.value = item.value.filter((v) => !('tool' in v) && !v.tools && !v.skills);
        } else if (showSkillReferences === false) {
          item.value = item.value.filter((v) => !v.skills);
        }
      }
    }

    if (!showCite) {
      if (item.obj === ChatRoleEnum.AI) {
        item.value = removeAIResponseCite(item.value, false);
      }
    }

    // Add value type(适配旧版)
    item.value = item.value.map((v) => {
      enum ChatItemValueTypeEnum {
        text = 'text',
        file = 'file',
        tool = 'tool',
        interactive = 'interactive',
        reasoning = 'reasoning'
      }
      const type = (() => {
        if (v.text) return ChatItemValueTypeEnum.text;
        if ('file' in v) return ChatItemValueTypeEnum.file;
        if ('tool' in v || 'tools' in v) return ChatItemValueTypeEnum.tool;
        if ('interactive' in v) return ChatItemValueTypeEnum.interactive;
        if ('reasoning' in v) return ChatItemValueTypeEnum.reasoning;
        return ChatItemValueTypeEnum.text;
      })();
      return {
        ...v,
        type
      };
    });
  });

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
    list: isPlugin ? filteredHistories : transformPreviewHistories(filteredHistories, showCite),
    total,
    goodTotal,
    badTotal,
    notFoundTotal
  };
}

export default NextAPI(handler);
