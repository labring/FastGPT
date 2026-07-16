import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  chatItemResponsePreviewProjection,
  transformPreviewHistories
} from '@/global/core/chat/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  filterPublicNodeResponseData,
  removeAIResponseCite
} from '@fastgpt/global/core/chat/utils';
import { GetChatTypeEnum } from '@fastgpt/global/core/chat/constants';
import { addPreviewUrlToChatItems } from '@fastgpt/service/core/chat/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetRecordsV2BodySchema,
  type GetRecordsV2ResponseType
} from '@fastgpt/global/openapi/core/chat/record/api';

async function handler(req: ApiRequestProps): Promise<GetRecordsV2ResponseType> {
  const {
    sourceType,
    sourceId,
    chatId,
    loadCustomFeedbacks = false,
    type = GetChatTypeEnum.normal,
    pageSize,
    initialId,
    nextId,
    prevId,
    includeDeleted = false,
    outLinkAuthData
  } = parseApiInput({ req, bodySchema: GetRecordsV2BodySchema }).body;

  if (!chatId) {
    return {
      list: [],
      total: 0,
      hasMorePrev: false,
      hasMoreNext: false
    };
  }

  const authRes = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    outLinkAuthData,
    sourceType,
    sourceId,
    chatId
  });
  const resolvedSourceId = authRes.sourceId;

  const app =
    sourceType === ChatSourceTypeEnum.app
      ? await MongoApp.findById(resolvedSourceId, 'type').lean()
      : null;

  if (sourceType === ChatSourceTypeEnum.app && !app) {
    return Promise.reject(AppErrEnum.unExist);
  }
  const isPlugin = app?.type === AppTypeEnum.workflowTool;
  const isOutLink = authRes.authType === GetChatTypeEnum.outLink;

  const commonField =
    'obj value adminFeedback userGoodFeedback userBadFeedback time hideInUI durationSeconds errorMsg';
  const fieldMap = {
    [GetChatTypeEnum.normal]: `${commonField} ${loadCustomFeedbacks ? 'customFeedbacks isFeedbackRead deleteTime' : ''}`,
    [GetChatTypeEnum.outLink]: commonField,
    [GetChatTypeEnum.home]: commonField
  };

  const result = await getChatItems({
    includeDeleted,
    sourceType,
    sourceId: resolvedSourceId,
    chatId,
    field: fieldMap[type],
    limit: pageSize,
    initialId,
    prevId,
    nextId,
    nodeResponseMode: isPlugin ? 'full' : 'preview',
    nodeResponsePreviewProjection: chatItemResponsePreviewProjection
  });

  // Presign file urls
  await addPreviewUrlToChatItems(result.histories, isPlugin ? 'workflowTool' : 'chatFlow');

  // Remove important information
  if (isOutLink && app?.type !== AppTypeEnum.workflowTool) {
    result.histories.forEach((item) => {
      if (item.obj === ChatRoleEnum.AI) {
        item.responseData = filterPublicNodeResponseData({
          nodeRespones: item.responseData,
          responseDetail: authRes.showCite
        });

        if (authRes.showRunningStatus === false) {
          item.value = item.value.filter(
            (v) =>
              v.text?.content ||
              v.reasoning?.content ||
              v.interactive ||
              v.plan ||
              // 不返回 tool 和 skill
              (!v.tools && !v.skills)
          );
        } else if (authRes.showSkillReferences === false) {
          item.value = item.value.filter((v) => !v.skills);
        }
      }
    });
  }
  if (!authRes.showCite) {
    result.histories.forEach((item) => {
      if (item.obj === ChatRoleEnum.AI) {
        item.value = removeAIResponseCite(item.value, false);
      }
    });
  }

  const list = isPlugin
    ? result.histories
    : transformPreviewHistories(result.histories, authRes.showCite);

  return {
    list: list.map((item) => ({
      ...item,
      id: item.dataId!
    })),
    total: result.total,
    hasMorePrev: result.hasMorePrev,
    hasMoreNext: result.hasMoreNext
  };
}

export default NextAPI(handler);
