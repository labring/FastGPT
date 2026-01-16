import type { NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { getAppTemplatesAndLoadThem } from '@fastgpt/service/core/app/templates/register';
import { type AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import { ToolTypeList, type AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { getUserDetail } from '@fastgpt/service/support/user/controller';

export type ListParams = {
  isQuickTemplate?: boolean;
  randomNumber?: number;
  type?: AppTypeEnum | 'all';
  excludeIds?: string;
};

export type ListResponse = {
  list: AppTemplateSchemaType[];
  total: number;
};

async function handler(
  req: ApiRequestProps<ListParams>,
  res: NextApiResponse<any>
): Promise<ListResponse> {
  const { tmbId } = await authCert({ req, authToken: true });

  // Get user tags for filtering
  const userDetail = await getUserDetail({ tmbId });
  const userTags = userDetail.tags || [];

  const { isQuickTemplate = false, randomNumber = 0, type = 'all', excludeIds } = req.query;

  const parsedExcludeIds: string[] = (() => {
    if (!excludeIds) return [];
    try {
      return JSON.parse(excludeIds);
    } catch (error) {
      console.error('Failed to parse excludeIds:', error);
      return [];
    }
  })();
  const templateMarketItems = await getAppTemplatesAndLoadThem();

  let filteredItems = templateMarketItems.filter((item) => {
    if (!item.isActive) return false;
    if (type === 'all' && !(ToolTypeList.includes(item.type as AppTypeEnum) && randomNumber > 0))
      return true;
    if (item.type === type) return true;
    return false;
  });

  // Filter based on hideTags and promoteTags
  filteredItems = filteredItems.filter((item) => {
    // Priority 1: hideTags - hide templates with matching tags
    if (item.hideTags && item.hideTags.length > 0 && userTags.length > 0) {
      const hasHideTag = item.hideTags.some((hideTag) => userTags.includes(hideTag));
      if (hasHideTag) {
        return false; // Hide this template from user
      }
    }

    return true;
  });

  const total = filteredItems.length;

  if (parsedExcludeIds && parsedExcludeIds.length > 0) {
    filteredItems = filteredItems.filter((item) => !parsedExcludeIds.includes(item.templateId));
  }

  if (isQuickTemplate) {
    if (filteredItems.some((item) => item.isQuickTemplate !== undefined)) {
      filteredItems = filteredItems.filter((item) => item.isQuickTemplate);
    } else {
      filteredItems = filteredItems.slice(0, 9);
    }
  }

  if (randomNumber > 0 && filteredItems.length > 0) {
    // Fisher-Yates shuffle algorithm
    const shuffled = [...filteredItems];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    filteredItems = shuffled.slice(0, randomNumber);
  }

  const list = filteredItems.map((item) => {
    // Check if this template should be promoted for current user
    const isPromotedForUser =
      item.promoteTags &&
      item.promoteTags.length > 0 &&
      userTags.length > 0 &&
      item.promoteTags.some((promoteTag) => userTags.includes(promoteTag));

    // If user tags match promoteTags, add 'recommendation' to tags array
    const tags = item.tags || [];
    const finalTags =
      isPromotedForUser && !tags.includes('recommendation')
        ? [...tags, 'recommendation']
        : [...tags.filter((tag) => tag !== 'recommendation')];

    return {
      templateId: item.templateId,
      name: item.name,
      intro: item.intro,
      recommendText: item.recommendText,
      isPromoted: item.isPromoted, // Keep global promotion, don't depend on promoteTags
      avatar: item.avatar,
      tags: finalTags, // Use modified tags
      type: item.type,
      author: item.author,
      userGuide: item.userGuide,
      workflow: {}
    };
  });

  return {
    list,
    total
  };
}

export default NextAPI(handler);
