import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
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
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { addPreviewUrlToChatItems } from '@fastgpt/service/core/chat/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetPaginationRecordsBodySchema,
  GetPaginationRecordsResponseSchema,
  type GetPaginationRecordsResponseType
} from '@fastgpt/global/openapi/core/chat/record/api';

export async function handler(req: ApiRequestProps): Promise<GetPaginationRecordsResponseType> {
  const {
    sourceType,
    sourceId,
    chatId,
    loadCustomFeedbacks = false,
    type = GetChatTypeEnum.normal,
    outLinkAuthData
  } = parseApiInput({ req, bodySchema: GetPaginationRecordsBodySchema }).body;

  const { offset, pageSize } = parsePaginationRequest(req);

  if (!chatId) {
    return {
      list: [],
      total: 0
    };
  }

  const authRes = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData
  });
  const resolvedSourceId = authRes.sourceId;

  const [app] = await Promise.all([
    sourceType === ChatSourceTypeEnum.app
      ? MongoApp.findById(resolvedSourceId, 'type').lean()
      : null
  ]);

  if (sourceType === ChatSourceTypeEnum.app && !app) {
    return Promise.reject(AppErrEnum.unExist);
  }
  const isPlugin = app?.type === AppTypeEnum.workflowTool;
  const isOutLink = authRes.authType === GetChatTypeEnum.outLink;

  const commonField =
    'obj value adminFeedback userGoodFeedback userBadFeedback time hideInUI durationSeconds errorMsg';
  const fieldMap = {
    [GetChatTypeEnum.normal]: `${commonField} ${loadCustomFeedbacks ? 'customFeedbacks' : ''}`,
    [GetChatTypeEnum.outLink]: commonField,
    [GetChatTypeEnum.team]: commonField,
    [GetChatTypeEnum.home]: commonField
  };

  const { total, histories } = await getChatItems({
    sourceType,
    sourceId: resolvedSourceId,
    chatId,
    field: fieldMap[type],
    offset,
    limit: pageSize,
    nodeResponseMode: isPlugin ? 'full' : 'preview',
    nodeResponsePreviewProjection: chatItemResponsePreviewProjection
  });

  // Presign file urls
  await addPreviewUrlToChatItems(histories, isPlugin ? 'workflowTool' : 'chatFlow');

  histories.forEach((item) => {
    // Remove important information
    if (isOutLink && app?.type !== AppTypeEnum.workflowTool) {
      if (item.obj === ChatRoleEnum.AI) {
        item.responseData = filterPublicNodeResponseData({
          nodeRespones: item.responseData,
          responseDetail: authRes.showCite
        });

        if (authRes.showRunningStatus === false) {
          item.value = item.value.filter((v) => !('tool' in v) && !v.tools && !v.skills);
        } else if (authRes.showSkillReferences === false) {
          item.value = item.value.filter((v) => !v.skills);
        }
      }
    }

    if (!authRes.showCite) {
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

  return GetPaginationRecordsResponseSchema.parse({
    list: isPlugin ? histories : transformPreviewHistories(histories, authRes.showCite),
    total
  });
}

export default NextAPI(handler);
