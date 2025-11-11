import type { NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { getAppTemplatesAndLoadThem } from '@fastgpt/service/core/app/templates/register';
import { type AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import { ToolTypeList, type AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { type ApiRequestProps } from '@fastgpt/service/type/next';

export type ListParams = {
  isQuickTemplate?: boolean;
  randomNumber?: number;
  type?: AppTypeEnum | 'all';
  excludeIds?: string[];
};

export type ListResponse = {
  list: AppTemplateSchemaType[];
  total: number;
};

async function handler(
  req: ApiRequestProps<ListParams>,
  res: NextApiResponse<any>
): Promise<ListResponse> {
  await authCert({ req, authToken: true });

  const { isQuickTemplate = false, randomNumber = 0, type = 'all', excludeIds = [] } = req.query;

  const templateMarketItems = await getAppTemplatesAndLoadThem();

  let filteredItems = templateMarketItems.filter((item) => {
    if (!item.isActive) return false;
    if (type === 'all' && !ToolTypeList.includes(item.type as AppTypeEnum)) return true;
    if (item.type === type) return true;
    return false;
  });
  const total = filteredItems.length;

  if (excludeIds && excludeIds.length > 0) {
    filteredItems = filteredItems.filter((item) => !excludeIds.includes(item.templateId));
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
    return {
      templateId: item.templateId,
      name: item.name,
      intro: item.intro,
      avatar: item.avatar,
      tags: item.tags,
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
