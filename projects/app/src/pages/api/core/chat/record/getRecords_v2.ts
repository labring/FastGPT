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
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  filterPublicNodeResponseData,
  removeAIResponseCite
} from '@fastgpt/global/core/chat/utils';
import { GetChatTypeEnum } from '@/global/core/chat/constants';
import type { LinkedPaginationProps, LinkedListResponse } from '@fastgpt/web/common/fetch/type';
import type { ChatItemType, AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { addPreviewUrlToChatItems } from '@fastgpt/service/core/chat/utils';

/**
 * Reorder AI response value array: insert skill records after their corresponding tool by matching id.
 * Skills have the same id as the tool call that triggered them.
 */
export function reorderAIResponseValue(
  value: AIChatItemValueItemType[]
): AIChatItemValueItemType[] {
  const skillItems: AIChatItemValueItemType[] = [];
  const nonSkillItems: AIChatItemValueItemType[] = [];

  // Separate skill items from non-skill items
  for (const item of value) {
    if (item.skills && item.skills.length > 0) {
      skillItems.push(item);
    } else {
      nonSkillItems.push(item);
    }
  }

  // If no skill items, return original array
  if (skillItems.length === 0) return value;

  // Build a map of tool call IDs from skill items for quick lookup
  const skillByToolCallId = new Map<string, AIChatItemValueItemType>();
  for (const skillItem of skillItems) {
    const skillId = skillItem.skills?.[0]?.id;
    if (skillId) {
      skillByToolCallId.set(skillId, skillItem);
    }
  }

  // Build result array, inserting skills after matching tools
  const result: AIChatItemValueItemType[] = [];
  const usedSkillIds = new Set<string>();

  for (const item of nonSkillItems) {
    result.push(item);

    // Check if any tool in this item has a matching skill
    const tools = item.tools;
    if (tools) {
      for (const tool of tools) {
        const matchingSkill = skillByToolCallId.get(tool.id);
        if (matchingSkill && !usedSkillIds.has(tool.id)) {
          result.push(matchingSkill);
          usedSkillIds.add(tool.id);
        }
      }
    }
  }

  // Append any remaining unmatched skill items at the end
  for (const skillItem of skillItems) {
    const skillId = skillItem.skills?.[0]?.id;
    if (skillId && !usedSkillIds.has(skillId)) {
      result.push(skillItem);
    }
  }

  return result;
}

export type getChatRecordsQuery = {};

export type getChatRecordsBody = LinkedPaginationProps<GetChatRecordsProps>;

export type getChatRecordsResponse = LinkedListResponse<ChatItemType> & {
  total: number;
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
    includeDeleted = false
  } = req.body;

  if (!appId || !chatId) {
    return {
      list: [],
      total: 0,
      hasMorePrev: false,
      hasMoreNext: false
    };
  }

  const [app, { showCite, showRunningStatus, showSkillReferences, authType }] = await Promise.all([
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
    [GetChatTypeEnum.normal]: `${commonField} ${loadCustomFeedbacks ? 'customFeedbacks isFeedbackRead deleteTime' : ''}`,
    [GetChatTypeEnum.outLink]: commonField,
    [GetChatTypeEnum.team]: commonField,
    [GetChatTypeEnum.home]: commonField
  };

  const result = await getChatItems({
    includeDeleted,
    appId,
    chatId,
    field: fieldMap[type],
    limit: pageSize,
    initialId,
    prevId,
    nextId
  });

  // Presign file urls
  await addPreviewUrlToChatItems(result.histories, isPlugin ? 'workflowTool' : 'chatFlow');

  // Reorder AI response value: insert skill records after their corresponding tool
  if (global.feConfigs?.show_skill) {
    result.histories.forEach((item) => {
      if (item.obj === ChatRoleEnum.AI) {
        item.value = reorderAIResponseValue(item.value);
      }
    });
  }

  // Remove important information
  if (isOutLink && app.type !== AppTypeEnum.workflowTool) {
    result.histories.forEach((item) => {
      if (item.obj === ChatRoleEnum.AI) {
        item.responseData = filterPublicNodeResponseData({
          nodeRespones: item.responseData,
          responseDetail: showCite
        });

        if (showRunningStatus === false) {
          item.value = item.value.filter(
            (v) =>
              v.text?.content ||
              v.reasoning?.content ||
              v.interactive ||
              v.plan ||
              // 不返回 tool 和 skill
              (!v.tools && !v.skills)
          );
        } else if (showSkillReferences === false) {
          item.value = item.value.filter((v) => !v.skills);
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

  const list = isPlugin ? result.histories : transformPreviewHistories(result.histories, showCite);

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
